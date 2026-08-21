// agent-skills-router - opencode plugin. Injects beslisboom every prompt, tracks code-edit + skill-invocation state, nudges contextually.

import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { existsSync } from "node:fs"
import { homedir } from "node:os"

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))

const {
  CODE_EDIT_TOOL_IDS, CODE_WORK_TOOL_IDS, RECENT_TOOL_MAX, COMPLETION_PHRASES,
  SKILL_CODE_REVIEW, SKILL_VERIFICATION, SKILL_WRITE_SKILL, SKILL_DESIGN_REVIEW, SKILL_UI_UX,
  SKILL_DEVELOP,
  buildSkillOverview, cascadeRoute, getSessionState, loadSkills,
  setSessionState, hasPhraseSignal, toSingleLine, isInPeakWindow, describePeakWindow, unique,
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
const BLOCKED_BEFORE_SKILL = new Set(["edit", "write", "apply_patch", "bash"])

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
    "chat.params": async (input) => {
      try {
        const providerID = input?.provider?.info?.id || input?.model?.providerID || ""
        if (!providerID) return
        setSessionState(sessionState, SESSION_KEY, { providerID })
      } catch { /* plugin error, skip provider tracking this call */ }
    },
    "tui.prompt.append": async (input) => {
      try {
        const promptText = (input?.prompt || input?.text || "").trim()
        if (!promptText) return
        const state = getSessionState(sessionState, SESSION_KEY)
        const skills = await getSkills()
        const extraLines = []

        const route = cascadeRoute(promptText, skills, state)
        const matchSkill = route?.matchedSkills?.[0]
        const loadedSkills = state.loadedSkills || []
        if (matchSkill && matchSkill.name !== SKILL_DEVELOP && !loadedSkills.includes(matchSkill.name)) {
          extraLines.push(`→ Match: ${matchSkill.name} — call \`skill(name: '${matchSkill.name}')\` now`)
        }

        const providerID = state.providerID || ""
        if (providerID && isInPeakWindow(new Date(), providerID) && !state.peakWarningShown) {
          extraLines.push(`→ ${describePeakWindow(providerID)}`)
          setSessionState(sessionState, SESSION_KEY, { peakWarningShown: true })
        }

        if (!state.hasDoneSessionAudit) {
          const auditLines = ["FIRST ACTION: scan beslisboom, load matching skill before any code or tools:"]
          for (const s of skills) {
            auditLines.push(`  • ${s.name}: ${toSingleLine(s.description, 70)}`)
          }
          auditLines.push("Call `skill(name: '...')` now to load the right workflow.")
          setSessionState(sessionState, SESSION_KEY, { hasDoneSessionAudit: true })
          const overview = buildSkillOverview(state)
          const section = [...extraLines, ...auditLines].join("\n")
          return { append: `\n--- Agent Skills Kit ---\n${section}\n\n${overview}` }
        }

        if (state.needsCodeReview && hasPhraseSignal(promptText, COMPLETION_PHRASES)) {
          setSessionState(sessionState, SESSION_KEY, { needsCodeReview: false, shouldCaptureImprovement: true })
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
              + "  Specify requirements build design brief → spec\n"
              + "  Clarify scope plan ambiguous work    → intake\n"
              + "  Debug bug crash failing test error    → debugging\n"
              + "  Review code changes before handoff    → code-review\n"
              + "  Verify claim prove it works           → verification\n"
              + "  Audit refactor reduce tech debt        → improve\n"
              + "  Reflect on session file improvement   → session-review\n"
              + "  Coordinate multi-agent parallel tasks → agent-workflows\n"
              + "  Create or revise a skill              → write-skill\n"
              + "  Design or polish UI/UX                → ui-ux\n"
              + "  Write text that reads human, not AI   → text-writing\n"
              + "  Normal software work (default)        → develop",
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
      const toolsSinceLoad = toolID === "skill" ? 0 : (state.toolCallsSinceSkillLoad || 0) + 1
      const skillsLoadedCount = toolID === "skill" ? (state.skillsLoadedCount || 0) + 1 : (state.skillsLoadedCount || 0)
      const loadedSkills = toolID === "skill" ? unique([...(state.loadedSkills || []), resolveSkillName(input, output)]) : (state.loadedSkills || [])
      const base = { recentToolIds, toolCallCount, toolCallsSinceSkillLoad: toolsSinceLoad, skillsLoadedCount, loadedSkills }

      if (CODE_EDIT_TOOL_IDS.has(toolID)) { setSessionState(sessionState, SESSION_KEY, { ...base, needsCodeReview: true }); return }
      if (toolID !== "skill") { setSessionState(sessionState, SESSION_KEY, base); return }
      const skillName = resolveSkillName(input, output)
      if (!skillName) { setSessionState(sessionState, SESSION_KEY, base); return }
      if (skillName === SKILL_CODE_REVIEW) { setSessionState(sessionState, SESSION_KEY, { ...base, needsCodeReview: false, shouldCaptureImprovement: true }); return }
      if (skillName === SKILL_VERIFICATION) { setSessionState(sessionState, SESSION_KEY, { ...base, shouldCaptureImprovement: true }); return }
      if (skillName === SKILL_WRITE_SKILL) { setSessionState(sessionState, SESSION_KEY, { ...base, shouldCaptureImprovement: false }); return }
      if (skillName === SKILL_UI_UX) { setSessionState(sessionState, SESSION_KEY, { ...base, needsDesignReview: true }); return }
      if (skillName === SKILL_DESIGN_REVIEW) { setSessionState(sessionState, SESSION_KEY, { ...base, needsDesignReview: false }); return }
      setSessionState(sessionState, SESSION_KEY, base)
    },
  }
}

export default AgentSkillsRouter
