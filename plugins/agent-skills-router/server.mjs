// agent-skills-router - opencode plugin. Injects the decision tree every prompt, tracks code-edit + skill-invocation state, nudges contextually.

import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { Plugin } from "@opencode/plugin"

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))

// Execute the resolve router core helper.
function resolveRouterCore() {
  const candidates = [
    resolve(here, "../core/router-core.js"),
    resolve(here, "../../core/router-core.js"),
  ]
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    // Reload the shared core when OpenCode hot-reloads this ESM plugin in place.
    const resolvedCandidate = require.resolve(candidate)
    delete require.cache[resolvedCandidate]
    return require(resolvedCandidate)
  }
  throw new Error(`agent-skills-router: cannot find router-core.js (tried ${candidates.join(", ")})`)
}

const {
  CODE_EDIT_TOOL_IDS, CODE_WORK_TOOL_IDS, RECENT_TOOL_MAX, COMPLETION_PHRASES,
  SKILL_CODE_REVIEW, SKILL_VERIFICATION, SKILL_WRITE_SKILL, SKILL_SESSION_REVIEW, SKILL_DESIGN_REVIEW, SKILL_DESIGN,
  SKILL_DEVELOP,
  buildSkillOverview, cascadeRoute, getSessionState, isAskSkill, isAskSkillName, loadSkills,
  setSessionState, hasPhraseSignal, toSingleLine, unique,
  hasTerminalReviewCompletion, parseReviewCompletion, reviewCompletionMatches, routingHintLines, buildWorkflowState, parseWorkflowEvidence, workflowForSkill, recordWorkflowEvidence,
  buildRoutingStatus,
} = resolveRouterCore()

// Execute the resolve skill path helper.
function resolveSkillPath() {
  const configuredSkillsPath = process.env.ASK_SKILLS_DIR
  const candidates = [configuredSkillsPath, resolve(homedir(), ".agents", "skills"), resolve(here, "../../skills")].filter(Boolean)
  for (const p of candidates) { if (existsSync(p)) return p }
  return candidates[0]
}

// Execute the resolve skill name helper.
function resolveSkillName(input, output) {
  const candidates = [
    input?.name, input?.skill, input?.id, input?.args?.name, input?.args?.skill, input?.args?.id,
    input?.arguments?.name, input?.arguments?.skill, input?.arguments?.id,
    output?.args?.name, output?.args?.skill, output?.args?.id,
    output?.arguments?.name, output?.arguments?.skill, output?.arguments?.id,
    output?.name, output?.skill, output?.id,
  ]
  for (const c of candidates) {
    if (typeof c !== "string" || !c.trim()) continue
    const skill = c.trim()
    const canonicalName = skill.startsWith("ask-") ? skill.slice(4) : skill
    return isAskSkillName(canonicalName) ? canonicalName : ""
  }
  return ""
}

const BLOCKED_BEFORE_SKILL = new Set(["edit", "write", "apply_patch", "bash"])

// Keep router state scoped to the host session; older hook payloads fall back
// to the legacy bucket rather than preventing prompt guidance.
function sessionKey(input) {
  return typeof input?.sessionID === "string" && input.sessionID ? input.sessionID : "default"
}

// Trust review completion only from a delegated task result, never user text.
// Trust only passing review evidence for current edit generation.
function isDelegatedReviewCompletion(toolID, generation, output, currentReference) {
  const evidence = parseWorkflowEvidence(output)
  return toolID === "task" && evidence?.status === "PASS"
    && (evidence.phase === "REVIEW" || evidence.phase === "AUDIT")
    && reviewCompletionMatches(output, generation, evidence.phase, currentReference)
}

let skillsCache = null
// Execute the get skills helper.
async function getSkills() {
  if (skillsCache) return skillsCache
  const skillPath = resolveSkillPath()
  skillsCache = (await loadSkills([skillPath])).filter(isAskSkill)
  return skillsCache
}

// Execute the agent skills router callback.
export const AgentSkillsRouter = async ({ client } = {}) => {
  const sessionState = new Map()
  const pendingStateChanges = new Map()
  // Execute the save helper.
  function save(input, updates) {
    const key = sessionKey(input)
    return setSessionState(sessionState, key, updates)
  }

  // Return the canonical snapshot for the supported V2 prompt metadata path.
  function status(input) {
    return buildRoutingStatus(null, getSessionState(sessionState, sessionKey(input)))
  }

  // Run stateful hooks in arrival order per session so a prompt completing
  // alongside a skill load cannot restore an older current-skill snapshot.
  function serializeStateChange(input, change) {
    const key = sessionKey(input)
    const previous = pendingStateChanges.get(key) || Promise.resolve()
    // Handle the fulfilled asynchronous result.
    const next = previous.catch(() => {}).then(change)
    pendingStateChanges.set(key, next)
    // Execute this callback within the surrounding workflow.
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
      // Keep items that satisfy the local predicate.
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      // Map each item through the local transformation.
      .map((part) => part.text)
      .join(" ")
      .trim()
  }

  return {
    status,
    // Real server hook: a user message arrived. Analyze and persist status so
    // the TUI sidebar reflects the current route before the model responds.
    "chat.message": async (input, output) => {
      try {
        const promptText = promptTextFromMessage(output)
        if (!promptText) return
        // Execute this callback within the surrounding workflow.
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
        // Execute the append callback.
        const append = await serializeStateChange(input, () => processPrompt(input, promptText))
        return append ? { append } : undefined
      } catch { /* plugin error, skip ask hints this prompt */ }
    },
    // Execute this callback within the surrounding workflow.
    "tool.execute.before": async (input) => {
      const toolID = (typeof input?.tool === "string" ? input.tool : "").trim()
      if (!toolID) return
      if (CODE_EDIT_TOOL_IDS.has(toolID)) {
        const state = getSessionState(sessionState, sessionKey(input))
        save(input, {
          needsCodeReview: true,
          reviewGeneration: (state.reviewGeneration || 0) + 1,
          reviewReference: input?.diffIdentity || input?.commit || `generation-${(state.reviewGeneration || 0) + 1}`,
          reviewEvidence: null, reviewFollowUp: null,
        })
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
    // Execute this callback within the surrounding workflow.
    "tool.execute.after": async (input, output) => {
      // Execute this callback within the surrounding workflow.
      return serializeStateChange(input, () => {
        const toolID = (typeof input?.tool === "string" ? input.tool : "").trim()
        if (!toolID) return
        const state = getSessionState(sessionState, sessionKey(input))
        const recentToolIds = [...(state.recentToolIds || []), toolID].slice(-RECENT_TOOL_MAX)
        const toolCallCount = (state.toolCallCount || 0) + 1
        const skillName = toolID === "skill" ? resolveSkillName(input, output) : ""
        const didLoadAskSkill = Boolean(skillName)
        const skillsLoadedCount = didLoadAskSkill ? (state.skillsLoadedCount || 0) + 1 : (state.skillsLoadedCount || 0)
        const loadedSkills = didLoadAskSkill ? unique([...(state.loadedSkills || []), skillName]) : (state.loadedSkills || [])
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
        const completedReview = isDelegatedReviewCompletion(toolID, state.reviewGeneration, output, state.reviewReference)
        const reviewHandoff = toolID === "task" ? parseReviewCompletion(output) : null
        const workflowEvidence = toolID === "task" ? parseWorkflowEvidence(output) : null
        if (workflowEvidence || reviewHandoff) {
          const workflow = workflowEvidence ? recordWorkflowEvidence(state.workflow, workflowEvidence) : state.workflow
          save(input, {
            ...base,
            workflow,
             ...(reviewHandoff ? { reviewEvidence: reviewHandoff, reviewFollowUp: completedReview ? null : { status: workflowEvidence?.status || "PENDING", evidence: reviewHandoff } } : {}),
             ...(completedReview ? { needsCodeReview: false, shouldCaptureImprovement: true } : {}),
          })
          return
        }
        if (CODE_EDIT_TOOL_IDS.has(toolID)) {
          save(input, { ...base, needsCodeReview: true, reviewReference: input?.diffIdentity || input?.commit || state.reviewReference || "" })
          return
        }
        if (toolID !== "skill") { save(input, base); return }
        if (!skillName) { save(input, base); return }
        const skillWorkflow = workflowForSkill(state.workflow, skillName)
        if (skillName === SKILL_CODE_REVIEW) { save(input, { ...base, currentSkill: skillName, shouldCaptureImprovement: true, workflow: skillWorkflow }); return }
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

// Bridge the router's state machine to OpenCode V2's typed hook domains while
// retaining the named factory for isolated regression tests.
async function setupV2(context) {
  const router = await AgentSkillsRouter({ client: context })
  const promptContext = new Map()

  // Flatten V2 tool input into the legacy state-machine shape so skill names,
  // review references, and other router fields survive the adapter boundary.
  function routerToolInput(event) {
    const toolInput = event?.input && typeof event.input === "object" ? event.input : {}
    return { sessionID: event.sessionID, tool: event.tool, ...toolInput }
  }

  // Execute this callback within the surrounding workflow.
  await context.session.hook("prompt", async (event) => {
    const append = await router["tui.prompt.append"]({
      sessionID: event.sessionID,
      prompt: event.prompt.text,
    })
    if (append?.append) promptContext.set(event.sessionID, append.append)
    event.metadata = { ...(event.metadata || {}), askKit: router.status({ sessionID: event.sessionID }) }
  })

  // Execute this callback within the surrounding workflow.
  await context.session.hook("context", async (event) => {
    const append = promptContext.get(event.sessionID)
    if (!append) return
    promptContext.delete(event.sessionID)
    event.system.push({ type: "text", text: append })
  })

  // Execute this callback within the surrounding workflow.
  await context.tool.hook("execute.before", async (event) => {
    const result = await router["tool.execute.before"](routerToolInput(event))
    if (result?.tool_error) throw new Error(result.tool_error)
  })

  // Execute this callback within the surrounding workflow.
  await context.tool.hook("execute.after", async (event) => {
    const output = event.status === "completed" ? event.result : { output: event.error }
    await router["tool.execute.after"](routerToolInput(event), output)
  })

  const controller = new AbortController()
  // Execute this callback within the surrounding workflow.
  void (async () => {
    try {
      for await (const event of context.event.subscribe({ signal: controller.signal })) {
        await router.event({ event })
      }
    } catch (error) {
      if (!controller.signal.aborted) console.error("agent-skills-router event subscription failed", error)
    }
  })()
  // Execute this callback within the surrounding workflow.
  return () => controller.abort()
}

export default Plugin.define({
  id: "agent-skills-router",
  setup: setupV2,
})
