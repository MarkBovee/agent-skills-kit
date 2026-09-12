// agent-skills-router - opencode plugin. Injects the decision tree every prompt, tracks code-edit + skill-invocation state, nudges contextually.

import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { existsSync } from "node:fs"
import { homedir } from "node:os"

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))

function resolveRouterCore() {
  const candidates = [
    resolve(here, "../core/router-core.js"),
    resolve(here, "../../core/router-core.js"),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return require(candidate)
  }
  throw new Error(`agent-skills-router: cannot find router-core.js (tried ${candidates.join(", ")})`)
}

const {
  CODE_EDIT_TOOL_IDS, CODE_WORK_TOOL_IDS, RECENT_TOOL_MAX, COMPLETION_PHRASES,
  SKILL_CODE_REVIEW, SKILL_VERIFICATION, SKILL_WRITE_SKILL, SKILL_SESSION_REVIEW, SKILL_DESIGN_REVIEW, SKILL_DESIGN,
  SKILL_DEVELOP,
  buildSkillOverview, cascadeRoute, getSessionState, loadSkills,
  setSessionState, hasPhraseSignal, toSingleLine, unique,
  hasTerminalReviewCompletion, routingHintLines, buildWorkflowState, parseWorkflowEvidence, workflowForSkill, recordWorkflowEvidence,
  buildRoutingStatus,
} = resolveRouterCore()

function resolveSkillPath() {
  const configuredSkillsPath = process.env.ASK_SKILLS_DIR
  const candidates = [configuredSkillsPath, resolve(homedir(), ".agents", "skills"), resolve(here, "../../skills")].filter(Boolean)
  for (const p of candidates) { if (existsSync(p)) return p }
  return candidates[0]
}

function resolveSkillName(input, output) {
  const candidates = [
    input?.name, input?.skill, input?.args?.name, input?.args?.skill,
    input?.arguments?.name, input?.arguments?.skill,
    output?.args?.name, output?.args?.skill,
    output?.arguments?.name, output?.arguments?.skill,
    output?.name, output?.skill,
  ]
  for (const c of candidates) { if (typeof c === "string" && c.trim()) return c.trim() }
  return ""
}

const BLOCKED_BEFORE_SKILL = new Set(["edit", "write", "apply_patch", "bash"])

// Keep router state scoped to the host session; older hook payloads fall back
// to the legacy bucket rather than preventing prompt guidance.
function sessionKey(input) {
  return typeof input?.sessionID === "string" && input.sessionID ? input.sessionID : "default"
}

// Trust review completion only from a delegated task result, never user text.
function isDelegatedReviewCompletion(toolID, input, output) {
  const evidence = parseWorkflowEvidence(output)
  return toolID === "task" && evidence?.status === "PASS" && evidence.phase === "REVIEW" && hasTerminalReviewCompletion(output)
}

let skillsCache = null
async function getSkills() {
  if (skillsCache) return skillsCache
  const skillPath = resolveSkillPath()
  skillsCache = await loadSkills([skillPath])
  return skillsCache
}

export const AgentSkillsRouter = async ({ client } = {}) => {
  const sessionState = new Map()
  const pendingPersistence = new Map()
  const pendingStateChanges = new Map()
  // Persist only the router snapshot under its own metadata key so the TUI
  // face can read it through OpenCode's native session state. The snapshot is
  // rebuilt from the full merged state so review-flag changes are reflected
  // even when no routing field changed.
  function persistStatus(sessionID, state) {
    if (!client || !sessionID || sessionID === "default") return
    const askKit = buildRoutingStatus(null, state)
    const previous = pendingPersistence.get(sessionID) || Promise.resolve()
    const next = previous
      .catch(() => {})
      .then(async () => {
        try {
          // The plugin client is the v1 SDK: path params live under `path` and
          // the body under `body`. Flattened shapes build a literal `{id}` URL.
          const current = await client.session.get({ path: { id: sessionID } })
          const metadata = current?.data?.metadata || {}
          await client.session.update({ path: { id: sessionID }, body: { metadata: { ...metadata, askKit } } })
        } catch { /* sidebar state is best-effort and must never block routing */ }
      })
    pendingPersistence.set(sessionID, next)
    void next.then(
      () => { if (pendingPersistence.get(sessionID) === next) pendingPersistence.delete(sessionID) },
      () => { if (pendingPersistence.get(sessionID) === next) pendingPersistence.delete(sessionID) },
    )
  }

  function save(input, updates) {
    const key = sessionKey(input)
    const state = setSessionState(sessionState, key, updates)
    persistStatus(key, state)
    return state
  }

  // Run stateful hooks in arrival order per session so a prompt completing
  // alongside a skill load cannot restore an older current-skill snapshot.
  function serializeStateChange(input, change) {
    const key = sessionKey(input)
    const previous = pendingStateChanges.get(key) || Promise.resolve()
    const next = previous.catch(() => {}).then(change)
    pendingStateChanges.set(key, next)
    void next.finally(() => {
      if (pendingStateChanges.get(key) === next) pendingStateChanges.delete(key)
    })
    return next
  }
  // Route one user prompt, advance workflow state, and persist the canonical
  // status snapshot. Returns the decision-tree append section for the prompt.
  async function processPrompt(input, promptText) {
    let state = getSessionState(sessionState, sessionKey(input))
    const skills = await getSkills()
    const extraLines = []

    const route = cascadeRoute(promptText, skills, state)
    const matchSkill = route?.matchedSkills?.[0]
    const loadedSkills = state.loadedSkills || []
    if (matchSkill && matchSkill.name !== SKILL_DEVELOP && !loadedSkills.includes(matchSkill.name)) {
      extraLines.push(`→ Match: ${matchSkill.name} — call \`skill(name: '${matchSkill.name}')\` now`)
    }

    const workflow = buildWorkflowState(promptText, state)
    // A route match only becomes active once its skill is actually loaded;
    // until then it stays a hollow suggestion (and its pending nudge). The
    // develop fallback must never displace the skill the agent already loaded.
    state = save(input, {
      matchedSkills: route?.matchedSkills || [],
      executionProfile: route?.executionProfile || null,
      interactionCountSinceSkillLoad: (state.interactionCountSinceSkillLoad || 0) + 1,
      workflow,
    })

    if (!state.hasDoneSessionAudit) {
      const auditLines = ["FIRST ACTION: scan the decision tree, load matching skill before any code or tools:"]
      for (const s of skills) {
        auditLines.push(`  • ${s.name}: ${toSingleLine(s.description, 70)}`)
      }
      auditLines.push("Call `skill(name: '...')` now to load the right workflow.")
      save(input, { hasDoneSessionAudit: true })
      const overview = buildSkillOverview(state)
      const section = [...extraLines, ...auditLines].join("\n")
      return `\n--- Agent Skills Kit ---\n${section}\n\n${overview}`
    }

    const lines = buildSkillOverview(state)
    const section = [...extraLines, lines].join("\n")
    return `\n--- Agent Skills Kit ---\n${section}`
  }

  // Join the user text parts of a chat.message payload for routing analysis.
  function promptTextFromMessage(output) {
    const parts = Array.isArray(output?.parts) ? output.parts : []
    return parts
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join(" ")
      .trim()
  }

  return {
    // Real server hook: a user message arrived. Analyze and persist status so
    // the TUI sidebar reflects the current route before the model responds.
    "chat.message": async (input, output) => {
      try {
        const promptText = promptTextFromMessage(output)
        if (!promptText) return
        await serializeStateChange(input, () => processPrompt(input, promptText))
      } catch { /* plugin error, skip ask hints this prompt */ }
    },
    // Real server hook: initialize safe sidebar state when a session starts.
    event: async ({ event } = {}) => {
      try {
        if (event?.type !== "session.created") return
        const sessionID = event?.properties?.info?.id
        await getSkills()
        const input = { sessionID }
        // Session IDs can be reused after host reconnects; discard any prior
        // bucket before persisting the required neutral first-render snapshot.
        sessionState.delete(sessionKey(input))
        save(input, {})
      } catch { /* ok */ }
    },
    // Legacy TUI event hook kept for host compatibility; returns the prompt
    // append section for hosts that still dispatch it.
    "tui.prompt.append": async (input) => {
      try {
        const promptText = (input?.prompt || input?.text || "").trim()
        if (!promptText) return
        const append = await serializeStateChange(input, () => processPrompt(input, promptText))
        return append ? { append } : undefined
      } catch { /* plugin error, skip ask hints this prompt */ }
    },
    "tool.execute.before": async (input) => {
      const toolID = (typeof input?.tool === "string" ? input.tool : "").trim()
      if (!toolID) return
      if (CODE_EDIT_TOOL_IDS.has(toolID)) {
        save(input, { needsCodeReview: true })
      }
      if (BLOCKED_BEFORE_SKILL.has(toolID)) {
        const state = getSessionState(sessionState, sessionKey(input))
        if ((state.skillsLoadedCount || 0) === 0) {
          return {
            tool_error: "Load a skill first via `skill(name: '...')`.\n"
              + routingHintLines().join("\n"),
          }
        }
      }
    },
    "tool.execute.after": async (input, output) => {
      return serializeStateChange(input, () => {
        const toolID = (typeof input?.tool === "string" ? input.tool : "").trim()
        if (!toolID) return
        const state = getSessionState(sessionState, sessionKey(input))
        const recentToolIds = [...(state.recentToolIds || []), toolID].slice(-RECENT_TOOL_MAX)
        const toolCallCount = (state.toolCallCount || 0) + 1
        const skillsLoadedCount = toolID === "skill" ? (state.skillsLoadedCount || 0) + 1 : (state.skillsLoadedCount || 0)
        const loadedSkills = toolID === "skill" ? unique([...(state.loadedSkills || []), resolveSkillName(input, output)]) : (state.loadedSkills || [])
        const base = {
          recentToolIds,
          toolCallCount,
          skillsLoadedCount,
          loadedSkills,
          currentSkill: state.currentSkill,
          interactionCountSinceSkillLoad: toolID === "skill"
            ? 0
            : (state.interactionCountSinceSkillLoad || 0),
          workflow: state.workflow,
        }

        // Skill documentation contains workflow marker examples; only real work
        // results may advance lifecycle gates or clear review obligations.
        const completedReview = isDelegatedReviewCompletion(toolID, input, output)
        const workflowEvidence = toolID === "task" ? parseWorkflowEvidence(output) : null
        if (workflowEvidence || completedReview) {
          const workflow = workflowEvidence ? recordWorkflowEvidence(state.workflow, workflowEvidence) : state.workflow
          save(input, {
            ...base,
            workflow,
            ...(completedReview ? { needsCodeReview: false, shouldCaptureImprovement: true } : {}),
          })
          return
        }
        if (CODE_EDIT_TOOL_IDS.has(toolID)) { save(input, { ...base, needsCodeReview: true }); return }
        if (toolID !== "skill") { save(input, base); return }
        const skillName = resolveSkillName(input, output)
        if (!skillName) { save(input, base); return }
        const skillWorkflow = workflowForSkill(state.workflow, skillName)
        if (skillName === SKILL_CODE_REVIEW) { save(input, { ...base, currentSkill: skillName, needsCodeReview: false, shouldCaptureImprovement: true, workflow: skillWorkflow }); return }
        if (skillName === SKILL_VERIFICATION) { save(input, { ...base, currentSkill: skillName, shouldCaptureImprovement: true, workflow: skillWorkflow }); return }
        if (skillName === SKILL_WRITE_SKILL) { save(input, { ...base, currentSkill: skillName, shouldCaptureImprovement: false }); return }
        if (skillName === SKILL_SESSION_REVIEW) { save(input, { ...base, currentSkill: skillName, shouldCaptureImprovement: false }); return }
        if (skillName === SKILL_DESIGN) { save(input, { ...base, currentSkill: skillName, needsDesignReview: true, workflow: skillWorkflow }); return }
        if (skillName === SKILL_DESIGN_REVIEW) { save(input, { ...base, currentSkill: skillName, needsDesignReview: false }); return }
        save(input, { ...base, currentSkill: skillName })
      })
    },
  }
}

export default AgentSkillsRouter
