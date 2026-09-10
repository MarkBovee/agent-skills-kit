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
    resolve(here, "core/router-core.js"),
    resolve(here, "../core/router-core.js"),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return require(candidate)
  }
  throw new Error(`agent-skills-router: cannot find router-core.js (tried ${candidates.join(", ")})`)
}

const {
  CODE_EDIT_TOOL_IDS, CODE_WORK_TOOL_IDS, RECENT_TOOL_MAX, COMPLETION_PHRASES,
  SKILL_CODE_REVIEW, SKILL_VERIFICATION, SKILL_WRITE_SKILL, SKILL_SESSION_REVIEW, SKILL_DESIGN_REVIEW, SKILL_UI_UX,
  SKILL_DEVELOP,
  buildSkillOverview, cascadeRoute, getSessionState, loadSkills,
  setSessionState, hasPhraseSignal, toSingleLine, unique,
  hasReviewCompletionSignal, routingHintLines, buildWorkflowState, parseWorkflowEvidence, workflowForSkill, recordWorkflowEvidence,
  buildRoutingStatus,
} = resolveRouterCore()

function resolveSkillPath() {
  const candidates = [resolve(homedir(), ".agents", "skills"), resolve(here, "../skills")]
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

const SESSION_KEY = "default"
const BLOCKED_BEFORE_SKILL = new Set(["edit", "write", "apply_patch", "bash"])

// Clear parent review debt when a direct or delegated review reports completion.
function isReviewCompletion(input, output) {
  return hasReviewCompletionSignal(input) || hasReviewCompletionSignal(output)
}

let skillsCache = null
async function getSkills() {
  if (skillsCache) return skillsCache
  const skillPath = resolveSkillPath()
  skillsCache = await loadSkills([skillPath])
  return skillsCache
}

export const AgentSkillsRouter = async () => {
  const sessionState = new Map()
  return {
    "session.created": async () => {
      try { await getSkills() } catch { /* ok */ }
    },
    "tui.prompt.append": async (input) => {
      try {
        const promptText = (input?.prompt || input?.text || "").trim()
        if (!promptText) return
        let state = getSessionState(sessionState, SESSION_KEY)
        const skills = await getSkills()
        const extraLines = []

        // A delegated review returns through the parent prompt rather than a local skill tool result.
        if (hasReviewCompletionSignal(promptText)) {
          state = setSessionState(sessionState, SESSION_KEY, { needsCodeReview: false, shouldCaptureImprovement: true })
        }

        const route = cascadeRoute(promptText, skills, state)
        const matchSkill = route?.matchedSkills?.[0]
        const loadedSkills = state.loadedSkills || []
        if (matchSkill && matchSkill.name !== SKILL_DEVELOP && !loadedSkills.includes(matchSkill.name)) {
          extraLines.push(`→ Match: ${matchSkill.name} — call \`skill(name: '${matchSkill.name}')\` now`)
        }

        const workflow = buildWorkflowState(promptText, state)
        state = setSessionState(sessionState, SESSION_KEY, {
          matchedSkills: route?.matchedSkills || [],
          executionProfile: route?.executionProfile || null,
          interactionCountSinceSkillLoad: (state.interactionCountSinceSkillLoad || 0) + 1,
          workflow,
          routing: buildRoutingStatus(route, { ...state, workflow }),
        })

        if (!state.hasDoneSessionAudit) {
          const auditLines = ["FIRST ACTION: scan the decision tree, load matching skill before any code or tools:"]
          for (const s of skills) {
            auditLines.push(`  • ${s.name}: ${toSingleLine(s.description, 70)}`)
          }
          auditLines.push("Call `skill(name: '...')` now to load the right workflow.")
          setSessionState(sessionState, SESSION_KEY, { hasDoneSessionAudit: true })
          const overview = buildSkillOverview(state)
          const section = [...extraLines, ...auditLines].join("\n")
          return { append: `\n--- Agent Skills Kit ---\n${section}\n\n${overview}` }
        }

        if ((state.needsCodeReview || state.needsDesignReview) && hasPhraseSignal(promptText, COMPLETION_PHRASES)) {
          setSessionState(sessionState, SESSION_KEY, { needsCodeReview: false, needsDesignReview: false, shouldCaptureImprovement: true })
        }

        const lines = buildSkillOverview(state)
        const section = [...extraLines, lines].join("\n")
        return { append: `\n--- Agent Skills Kit ---\n${section}` }
      } catch { /* plugin error, skip ask hints this prompt */ }
    },
    "tool.execute.before": async (input) => {
      const toolID = (typeof input?.tool === "string" ? input.tool : "").trim()
      if (!toolID) return
      if (CODE_EDIT_TOOL_IDS.has(toolID)) {
        setSessionState(sessionState, SESSION_KEY, { needsCodeReview: true })
      }
      if (BLOCKED_BEFORE_SKILL.has(toolID)) {
        const state = getSessionState(sessionState, SESSION_KEY)
        if ((state.skillsLoadedCount || 0) === 0) {
          return {
            tool_error: "Load a skill first via `skill(name: '...')`.\n"
              + routingHintLines().join("\n"),
          }
        }
      }
    },
    "tool.execute.after": async (input, output) => {
      const toolID = (typeof input?.tool === "string" ? input.tool : "").trim()
      if (!toolID) return
      const state = getSessionState(sessionState, SESSION_KEY)
      const recentToolIds = [...(state.recentToolIds || []), toolID].slice(-RECENT_TOOL_MAX)
      const toolCallCount = (state.toolCallCount || 0) + 1
      const skillsLoadedCount = toolID === "skill" ? (state.skillsLoadedCount || 0) + 1 : (state.skillsLoadedCount || 0)
      const loadedSkills = toolID === "skill" ? unique([...(state.loadedSkills || []), resolveSkillName(input, output)]) : (state.loadedSkills || [])
      const base = {
        recentToolIds,
        toolCallCount,
        skillsLoadedCount,
        loadedSkills,
        interactionCountSinceSkillLoad: toolID === "skill"
          ? 0
          : (state.interactionCountSinceSkillLoad || 0),
        workflow: state.workflow,
      }

      const workflowEvidence = parseWorkflowEvidence(input) || parseWorkflowEvidence(output)
      if (workflowEvidence) {
        const workflow = recordWorkflowEvidence(state.workflow, workflowEvidence)
        setSessionState(sessionState, SESSION_KEY, { ...base, workflow, routing: buildRoutingStatus(null, { ...state, workflow }) })
        return
      }
      if (isReviewCompletion(input, output)) {
        setSessionState(sessionState, SESSION_KEY, { ...base, needsCodeReview: false, shouldCaptureImprovement: true })
        return
      }
      if (CODE_EDIT_TOOL_IDS.has(toolID)) { setSessionState(sessionState, SESSION_KEY, { ...base, needsCodeReview: true }); return }
      if (toolID !== "skill") { setSessionState(sessionState, SESSION_KEY, base); return }
      const skillName = resolveSkillName(input, output)
      if (!skillName) { setSessionState(sessionState, SESSION_KEY, base); return }
      const skillWorkflow = workflowForSkill(state.workflow, skillName)
      const routing = buildRoutingStatus(null, { ...state, workflow: skillWorkflow }, skillName)
      if (skillName === SKILL_CODE_REVIEW) { setSessionState(sessionState, SESSION_KEY, { ...base, needsCodeReview: false, shouldCaptureImprovement: true, workflow: skillWorkflow, routing }); return }
      if (skillName === SKILL_VERIFICATION) { setSessionState(sessionState, SESSION_KEY, { ...base, shouldCaptureImprovement: true, workflow: skillWorkflow, routing }); return }
      if (skillName === SKILL_WRITE_SKILL) { setSessionState(sessionState, SESSION_KEY, { ...base, shouldCaptureImprovement: false, routing }); return }
      if (skillName === SKILL_SESSION_REVIEW) { setSessionState(sessionState, SESSION_KEY, { ...base, shouldCaptureImprovement: false, routing }); return }
      if (skillName === SKILL_UI_UX) { setSessionState(sessionState, SESSION_KEY, { ...base, needsDesignReview: true, workflow: skillWorkflow, routing }); return }
      if (skillName === SKILL_DESIGN_REVIEW) { setSessionState(sessionState, SESSION_KEY, { ...base, needsDesignReview: false, routing }); return }
      setSessionState(sessionState, SESSION_KEY, { ...base, routing })
    },
  }
}

export default AgentSkillsRouter
