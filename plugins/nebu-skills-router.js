const path = require("node:path")
const {
  CODE_EDIT_TOOL_IDS,
  CODE_REVIEW_SKILL,
  DEFAULT_MAX_HINTS,
  DEFAULT_MAX_LISTED_SKILLS,
  IMPROVEMENT_SKILL,
  VERIFICATION_SKILL,
  WRAPUP_SKILL,
  applyBaselineRouting,
  applyImprovementRouting,
  applySessionAwareRouting,
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
      const reviewAwareMatches = applySessionAwareRouting(
        text,
        findMatches(text, discoveredSkills, maxHints),
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
      const matchedSkills = applyBaselineRouting(
        text,
        improvementAwareMatches,
        discoveredSkills,
        maxHints,
      )

      setSessionState(sessionStateBySession, input.sessionID, {
        matchedSkills,
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
      // Keep the injected guidance compact so it nudges routing without drowning the system prompt.
      const lines = [
        "Skill routing:",
        "- For normal software work, prefer `nebu-kaizen` as the baseline and combine it with a more specific nebu skill when needed.",
        "- Prefer the `skill` tool when a request clearly matches an installed nebu workflow skill.",
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
