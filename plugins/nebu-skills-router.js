const path = require("node:path")
const {
  CODE_EDIT_TOOL_IDS,
  CODE_REVIEW_SKILL,
  DEFAULT_MAX_HINTS,
  DEFAULT_MAX_LISTED_SKILLS,
  applyExecutionRouting,
  applyKickoffRouting,
  buildExecutionProfile,
  IMPROVEMENT_SKILL,
  VERIFICATION_SKILL,
  WRAPUP_SKILL,
  applyBaselineRouting,
  applySessionAwareRouting,
  applyImprovementRouting,
  findMatches,
  getSessionState,
  loadSkills,
  setSessionState,
  toSingleLine,
  unique,
} = require("../core/router-core")

// Normalize tool identifiers from the different hook payload shapes the host may send.
function resolveToolID(input) {
  const toolID = input?.toolID || input?.tool
  return typeof toolID === "string" ? toolID.trim() : ""
}

// Resolve the invoked skill name from the possible input and output payload locations.
function resolveInvokedSkillName(input, output) {
  const candidates = [
    input?.name,
    input?.skill,
    input?.args?.name,
    input?.args?.skill,
    input?.arguments?.name,
    input?.arguments?.skill,
    output?.args?.name,
    output?.args?.skill,
    output?.arguments?.name,
    output?.arguments?.skill,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
  }

  return ""
}

// Join text parts from chat output into the plain text query used for routing.
function readTextParts(parts) {
  if (!Array.isArray(parts)) return ""

  return parts
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim()
}

// Build the OpenCode router plugin around the shared scoring and session helpers.
async function nebuSkillsRouterPlugin(_input, options = {}) {
  const configuredPaths = Array.isArray(options.paths) ? options.paths : []
  const preferredSkillPaths = unique([
    path.resolve(__dirname, "../skills"),
    ...configuredPaths,
  ])
  const discoveredSkills = await loadSkills(preferredSkillPaths)
  const maxHints = Number.isInteger(options.maxHints) ? options.maxHints : DEFAULT_MAX_HINTS
  const maxListedSkills = Number.isInteger(options.maxListedSkills)
    ? options.maxListedSkills
    : DEFAULT_MAX_LISTED_SKILLS

  const skillPreview = discoveredSkills
    .slice(0, maxListedSkills)
    .map((skill) => `${skill.name}: ${toSingleLine(skill.description, 70)}`)
    .join("; ")

  const sessionStateBySession = new Map()

  return {
    "chat.message": async (input, output) => {
      const text = readTextParts(output.parts)
      if (!text) return

      const currentState = getSessionState(sessionStateBySession, input.sessionID)
      const kickoffAwareMatches = applyKickoffRouting(
        text,
        findMatches(text, discoveredSkills, maxHints),
        discoveredSkills,
        maxHints,
      )
      const reviewAwareMatches = applySessionAwareRouting(
        text,
        kickoffAwareMatches,
        discoveredSkills,
        currentState.needsCodeReview,
        maxHints,
      )
      const improvementAwareMatches = applyImprovementRouting(
        text,
        reviewAwareMatches,
        discoveredSkills,
        currentState.shouldCaptureImprovement,
        maxHints,
      )
      const executionAwareMatches = applyExecutionRouting(
        text,
        improvementAwareMatches,
        discoveredSkills,
        maxHints,
      )
      const matchedSkills = applyBaselineRouting(
        text,
        executionAwareMatches,
        discoveredSkills,
        maxHints,
      )
      const executionProfile = buildExecutionProfile(text, matchedSkills)

      setSessionState(sessionStateBySession, input.sessionID, {
        matchedSkills,
        executionProfile,
      })
    },
    "tool.execute.before": async (input) => {
      if (!input.sessionID) return

      const toolID = resolveToolID(input)
      if (!CODE_EDIT_TOOL_IDS.has(toolID)) return

      setSessionState(sessionStateBySession, input.sessionID, { needsCodeReview: true })
    },
    "tool.execute.after": async (input, output) => {
      if (!input.sessionID) return

      const toolID = resolveToolID(input)

      if (CODE_EDIT_TOOL_IDS.has(toolID)) {
        setSessionState(sessionStateBySession, input.sessionID, { needsCodeReview: true })
        return
      }

      if (toolID !== "skill") return

      const invokedSkillName = resolveInvokedSkillName(input, output)
      if (invokedSkillName === CODE_REVIEW_SKILL) {
        setSessionState(sessionStateBySession, input.sessionID, {
          needsCodeReview: false,
          shouldCaptureImprovement: true,
        })
        return
      }

      if (invokedSkillName === WRAPUP_SKILL || invokedSkillName === VERIFICATION_SKILL) {
        setSessionState(sessionStateBySession, input.sessionID, { shouldCaptureImprovement: true })
        return
      }

      if (invokedSkillName !== IMPROVEMENT_SKILL) return

      setSessionState(sessionStateBySession, input.sessionID, { shouldCaptureImprovement: false })
    },
    "experimental.chat.system.transform": async (input, output) => {
      const sessionState = getSessionState(sessionStateBySession, input.sessionID)
      const matchedSkills = sessionState.matchedSkills
      const executionProfile = sessionState.executionProfile
      // Keep the injected guidance compact so it nudges routing without drowning the system prompt.
      const lines = [
        "Skill routing:",
        "- At the start of a task, select the best matching skill immediately instead of waiting for a manual trigger when the fit is clear.",
        "- For concrete executable work, bias early toward `nebu-kaizen` and combine it with a more specific nebu skill when needed.",
        "- For ambiguous, cross-cutting, or behavior-changing starts, bias early toward `nebu-kickoff` so scope and success criteria get clarified before execution.",
        "- Cost-aware default: bounded mechanical chores such as version bumps, changelog edits, release notes, and release-prep updates should start with a cheap small/mini subagent when the host supports it.",
        "- Escalate from mini to default/high/xhigh only when scope expands, the task is analysis-heavy, or cheap-first validation fails.",
        "- Prefer the `skill` tool at task start when a request clearly matches an installed nebu workflow skill.",
        "- When the session exposed a reusable workflow gap, consider `nebu-skill-improvement` before ending cold.",
        "- This router only suggests skills and should coexist cleanly with other plugins, including nebu-ctx.",
      ]

      if (skillPreview) {
        lines.push(`- Installed nebu-skills: ${skillPreview}`)
      }

      if (sessionState.needsCodeReview) {
        lines.push(
          "- Code was edited in this session. Before `nebu-verification` or a done/handoff claim, treat `nebu-code-review` as the default next skill unless the diff is truly tiny and a self-review is enough.",
        )
        lines.push(
          "- If the user says `done`, `ready`, `finished`, `handoff`, or Dutch equivalents like `klaar`, bias routing toward `nebu-code-review` before `nebu-verification`.",
        )
      }

      if (sessionState.shouldCaptureImprovement) {
        lines.push(
          "- Review, verification, or wrap-up happened in this session. Before ending cold, consider whether a reusable workflow gap was exposed and route toward `nebu-skill-improvement` when there is a concrete improvement to capture.",
        )
      }

      if (matchedSkills.length > 0) {
        lines.push(
          `- Best matches for this request: ${matchedSkills
            .map((skill) => `${skill.name} (${toSingleLine(skill.description, 80)})`)
            .join("; ")}`,
        )
      }

      if (executionProfile) {
        lines.push(
          `- Suggested execution profile: task=${executionProfile.executionTier}, agent=${executionProfile.agentTier}, delegation=${executionProfile.delegationMode}${executionProfile.matchedSkill ? `, anchor=${executionProfile.matchedSkill}` : ""}.`,
        )
      }

      output.system.push(lines.join("\n"))
    },
    "tool.definition": async (input, output) => {
      if (resolveToolID(input) !== "skill" || !skillPreview) return

      output.description = `${output.description} Prefer this tool when the request matches an installed nebu workflow skill. Installed nebu-skills: ${skillPreview}`
    },
  }
}

module.exports = nebuSkillsRouterPlugin
module.exports.default = nebuSkillsRouterPlugin
