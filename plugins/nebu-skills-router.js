// nebu-skills-router - opencode plugin. Cascade routing, injects hints per prompt, tracks code-edit + skill-invocation state.

import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { existsSync } from "node:fs"
import { homedir } from "node:os"

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))

const {
  CODE_EDIT_TOOL_IDS, DEFAULT_MAX_LISTED_SKILLS,
  SKILL_CODE_REVIEW, SKILL_VERIFICATION, SKILL_WRITING,
  cascadeRoute, getSessionState, loadSkills, setSessionState, toSingleLine,
} = require(resolve(here, "../core/router-core"))

// Resolve skill search path: prefer ~/.agents/skills, fall back to project-relative (dev mode).
function resolveSkillPath() {
  const candidates = [resolve(homedir(), ".agents", "skills"), resolve(here, "../skills")]
  for (const p of candidates) { if (existsSync(p)) return p }
  return candidates[0]
}

// Resolve invoked skill name from various tool.execute.after input shapes.
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

// Flatten session-state key: tui.prompt.append has no sessionID, single-user anyway.
const SESSION_KEY = "default"

// Build compact routing guidance injected into every prompt.
function buildRoutingLines(discoveredSkills, sessionState) {
  const lines = [
    "Cascade routing (first match wins): debugging → improve → ui-ux → github-issues → agent-workflows → writing-nebu-skills → code-review → verification → kickoff → kaizen(default). Cost-aware: mechanical chores → mini subagent.",
  ]
  const matched = sessionState.matchedSkills || []
  if (matched.length > 0) {
    lines.push(`Match: ${matched.map(s => s.name).join("+")}${sessionState.executionProfile ? ` (${sessionState.executionProfile.executionTier}/${sessionState.executionProfile.delegationMode})` : ""}`)
  }
  if (discoveredSkills.length > 0) {
    lines.push(`Skills: ${discoveredSkills.slice(0, DEFAULT_MAX_LISTED_SKILLS).map(s => `${s.name}: ${toSingleLine(s.description, 60)}`).join("; ")}`)
  }
  if (sessionState.needsCodeReview) lines.push("Code edited. Run code-review before done.")
  if (sessionState.shouldCaptureImprovement) lines.push("Gap found? writing-nebu-skills.")
  return lines.join("\n")
}

// Shared skill loader - reused across all hooks.
let skillsCache = null
async function getSkills() {
  if (skillsCache) return skillsCache
  const skillPath = resolveSkillPath()
  skillsCache = await loadSkills([skillPath])
  return skillsCache
}

export const NebuSkillsRouter = async () => {
  const sessionState = new Map()
  return {
    "session.created": async () => {
      // Warm cache on first session. Missing skills dir never blocks session start.
      try { await getSkills() } catch { /* ok */ }
    },
    "tui.prompt.append": async (input) => {
      const promptText = (input?.prompt || input?.text || "").trim()
      if (!promptText) return
      const skills = await getSkills()
      const state = getSessionState(sessionState, SESSION_KEY)
      const { matchedSkills, executionProfile } = cascadeRoute(promptText, skills, state)
      setSessionState(sessionState, SESSION_KEY, { matchedSkills, executionProfile })
      const lines = buildRoutingLines(skills, { ...state, matchedSkills, executionProfile })
      return { append: `\n--- Nebu Skills ---\n${lines}` }
    },
    "tool.execute.before": async (input) => {
      const toolID = (typeof input?.tool === "string" ? input.tool : "").trim()
      if (!toolID || !CODE_EDIT_TOOL_IDS.has(toolID)) return
      setSessionState(sessionState, SESSION_KEY, { needsCodeReview: true })
    },
    "tool.execute.after": async (input, output) => {
      const toolID = (typeof input?.tool === "string" ? input.tool : "").trim()
      if (!toolID) return
      if (CODE_EDIT_TOOL_IDS.has(toolID)) { setSessionState(sessionState, SESSION_KEY, { needsCodeReview: true }); return }
      if (toolID !== "skill") return
      const skillName = resolveSkillName(input, output)
      if (!skillName) return
      if (skillName === SKILL_CODE_REVIEW) { setSessionState(sessionState, SESSION_KEY, { needsCodeReview: false, shouldCaptureImprovement: true }); return }
      if (skillName === SKILL_VERIFICATION) { setSessionState(sessionState, SESSION_KEY, { shouldCaptureImprovement: true }); return }
      if (skillName === SKILL_WRITING) { setSessionState(sessionState, SESSION_KEY, { shouldCaptureImprovement: false }) }
    },
  }
}

export default NebuSkillsRouter
