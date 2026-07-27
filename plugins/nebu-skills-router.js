// nebu-skills-router - opencode plugin. Injects beslisboom every prompt, tracks code-edit + skill-invocation state, nudges contextually.

import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { existsSync } from "node:fs"
import { homedir } from "node:os"

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))

const {
  CODE_EDIT_TOOL_IDS, CODE_WORK_TOOL_IDS, RECENT_TOOL_MAX, COMPLETION_PHRASES,
  SKILL_CODE_REVIEW, SKILL_VERIFICATION, SKILL_WRITE_SKILL,
  buildSkillOverview, getSessionState, loadSkills,
  setSessionState, hasPhraseSignal, toSingleLine,
} = require(resolve(here, "../core/router-core"))

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
      try { await getSkills() } catch { /* ok */ }
    },
    "tui.prompt.append": async (input) => {
      try {
        const promptText = (input?.prompt || input?.text || "").trim()
        if (!promptText) return
        const state = getSessionState(sessionState, SESSION_KEY)

        if (!state.hasDoneSessionAudit) {
          const skills = await getSkills()
          const auditLines = ["FIRST ACTION: scan beslisboom, load matching skill before any code or tools:"]
          for (const s of skills) {
            auditLines.push(`  • ${s.name}: ${toSingleLine(s.description, 70)}`)
          }
          auditLines.push("Call `skill(name: '...')` now to load the right workflow.")
          setSessionState(sessionState, SESSION_KEY, { hasDoneSessionAudit: true })
          const overview = buildSkillOverview(state)
          return { append: `\n--- Nebu Skills ---\n${auditLines.join("\n")}\n\n${overview}` }
        }

        if (state.needsCodeReview && hasPhraseSignal(promptText, COMPLETION_PHRASES)) {
          setSessionState(sessionState, SESSION_KEY, { needsCodeReview: false, shouldCaptureImprovement: true })
        }

        const lines = buildSkillOverview(state)
        return { append: `\n--- Nebu Skills ---\n${lines}` }
      } catch { /* plugin error, skip nebu hints this prompt */ }
    },
    "tool.execute.before": async (input) => {
      const toolID = (typeof input?.tool === "string" ? input.tool : "").trim()
      if (!toolID || !CODE_EDIT_TOOL_IDS.has(toolID)) return
      setSessionState(sessionState, SESSION_KEY, { needsCodeReview: true })
    },
    "tool.execute.after": async (input, output) => {
      const toolID = (typeof input?.tool === "string" ? input.tool : "").trim()
      if (!toolID) return
      const state = getSessionState(sessionState, SESSION_KEY)
      const recentToolIds = [...(state.recentToolIds || []), toolID].slice(-RECENT_TOOL_MAX)
      const toolCallCount = (state.toolCallCount || 0) + 1
      const toolsSinceLoad = toolID === "skill" ? 0 : (state.toolCallsSinceSkillLoad || 0) + 1
      const skillsLoadedCount = toolID === "skill" ? (state.skillsLoadedCount || 0) + 1 : (state.skillsLoadedCount || 0)
      const base = { recentToolIds, toolCallCount, toolCallsSinceSkillLoad: toolsSinceLoad, skillsLoadedCount }

      if (CODE_EDIT_TOOL_IDS.has(toolID)) { setSessionState(sessionState, SESSION_KEY, { ...base, needsCodeReview: true }); return }
      if (toolID !== "skill") { setSessionState(sessionState, SESSION_KEY, base); return }
      const skillName = resolveSkillName(input, output)
      if (!skillName) { setSessionState(sessionState, SESSION_KEY, base); return }
      if (skillName === SKILL_CODE_REVIEW) { setSessionState(sessionState, SESSION_KEY, { ...base, needsCodeReview: false, shouldCaptureImprovement: true }); return }
      if (skillName === SKILL_VERIFICATION) { setSessionState(sessionState, SESSION_KEY, { ...base, shouldCaptureImprovement: true }); return }
      if (skillName === SKILL_WRITE_SKILL) { setSessionState(sessionState, SESSION_KEY, { ...base, shouldCaptureImprovement: false }); return }
      setSessionState(sessionState, SESSION_KEY, base)
    },
  }
}

export default NebuSkillsRouter
