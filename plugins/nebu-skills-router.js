// nebu-skills-router — opencode plugin
//
// Routes user prompts to the best-matching nebu-skill using deterministic
// cascade routing. Injects routing hints into every prompt so the model
// knows which skill to load before acting. Tracks code-edit and skill-
// invocation session state.

import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { existsSync } from "node:fs"
import { homedir } from "node:os"

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))

const {
  CODE_EDIT_TOOL_IDS,
  DEFAULT_MAX_LISTED_SKILLS,
  SKILL_CODE_REVIEW,
  SKILL_VERIFICATION,
  SKILL_WRITING,
  cascadeRoute,
  getSessionState,
  loadSkills,
  setSessionState,
  toSingleLine,
} = require(resolve(here, "../core/router-core"))

// Resolve skill search path. Prefer the installed canonical location
// (~/.agents/skills), fall back to project-relative (development mode).
function resolveSkillPath() {
  const candidates = [
    resolve(homedir(), ".agents", "skills"),
    resolve(here, "../skills"),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return candidates[0]
}

// Resolve invoked skill name from tool.execute.after input shapes.
function resolveSkillName(input, output) {
  const candidates = [
    input?.name, input?.skill, input?.args?.name, input?.args?.skill,
    input?.arguments?.name, input?.arguments?.skill,
    output?.args?.name, output?.args?.skill,
    output?.arguments?.name, output?.arguments?.skill,
    output?.name, output?.skill,
  ]
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim()
  }
  return ""
}

// Flatten session-state key to a single default slot. tui.prompt.append does
// not carry sessionID, and OpenCode sessions are single-user anyway.
const SESSION_KEY = "default"

// Build the routing guidance block injected into every prompt.
function buildRoutingLines(discoveredSkills, sessionState) {
  const lines = [
    "Skill routing (cascade, first match wins):",
    "- GitHub issues → github-issues",
    "- Debug/bug/error → debugging",
    "- Audit/refactor/improve → improve",
    "- UI/UX design → ui-ux",
    "- Multi-agent/release chores → agent-workflows",
    "- Skill writing/improvement → writing-nebu-skills",
    "- Explicit review request → code-review",
    "- Code edited + done/ready → code-review",
    "- Done/ready/handoff → verification",
    "- Ambiguous/planning → kickoff",
    "- Everything else → kaizen (default)",
    "- Cost-aware: bounded mechanical chores start with cheap mini subagent.",
  ]

  const matchedSkills = sessionState.matchedSkills || []
  if (matchedSkills.length > 0) {
    lines.push(
      `- Best matches: ${matchedSkills.map((s) => `${s.name} (${toSingleLine(s.description, 80)})`).join("; ")}`,
    )
    const ep = sessionState.executionProfile
    if (ep) {
      lines.push(`- Execution profile: task=${ep.executionTier}, agent=${ep.agentTier}, delegation=${ep.delegationMode}${ep.matchedSkill ? `, anchor=${ep.matchedSkill}` : ""}.`)
    }
  }

  if (discoveredSkills.length > 0) {
    lines.push(
      `- Available nebu-skills: ${discoveredSkills.slice(0, DEFAULT_MAX_LISTED_SKILLS).map((s) => `${s.name}: ${toSingleLine(s.description, 70)}`).join("; ")}`,
    )
  }

  if (sessionState.needsCodeReview) {
    lines.push("- Code was edited. Use code-review before verification or handoff.")
  }

  if (sessionState.shouldCaptureImprovement) {
    lines.push("- Review/verification happened. Consider writing-nebu-skills if a reusable gap emerged.")
  }

  return lines.join("\n")
}

// Single shared skill loader so every hook reuses the same skill list.
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
      // Warm skill cache on first session. Swallow errors so a missing
      // skills directory never breaks session start.
      try { await getSkills() } catch { /* skills dir may not exist */ }
    },

    // Inject routing hints before every model prompt. This is the OpenCode
    // equivalent of the old experimental.chat.system.transform hook.
    "tui.prompt.append": async (input) => {
      const promptText = (input?.prompt || input?.text || "").trim()
      if (!promptText) return

      const skills = await getSkills()
      const state = getSessionState(sessionState, SESSION_KEY)
      const { matchedSkills, executionProfile } = cascadeRoute(promptText, skills, state)

      // Persist discovered routing into session state.
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

      if (CODE_EDIT_TOOL_IDS.has(toolID)) {
        setSessionState(sessionState, SESSION_KEY, { needsCodeReview: true })
        return
      }

      if (toolID !== "skill") return

      const skillName = resolveSkillName(input, output)
      if (!skillName) return

      if (skillName === SKILL_CODE_REVIEW) {
        setSessionState(sessionState, SESSION_KEY, {
          needsCodeReview: false,
          shouldCaptureImprovement: true,
        })
        return
      }

      if (skillName === SKILL_VERIFICATION) {
        setSessionState(sessionState, SESSION_KEY, { shouldCaptureImprovement: true })
        return
      }

      if (skillName === SKILL_WRITING) {
        setSessionState(sessionState, SESSION_KEY, { shouldCaptureImprovement: false })
      }
    },
  }
}

export default NebuSkillsRouter
