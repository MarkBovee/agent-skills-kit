const path = require("node:path")
const {
  CODE_EDIT_TOOL_IDS,
  DEFAULT_MAX_HINTS,
  DEFAULT_MAX_LISTED_SKILLS,
  SKILL_CODE_REVIEW,
  SKILL_VERIFICATION,
  SKILL_WRITING,
  cascadeRoute,
  getSessionState,
  loadSkills,
  setSessionState,
  toSingleLine,
  unique,
} = require("../core/router-core")

// Normalize tool identifiers from different hook payload shapes.
function resolveToolID(input) {
  const toolID = input?.toolID || input?.tool
  return typeof toolID === "string" ? toolID.trim() : ""
}

// Resolve the invoked skill name from possible input and output payload locations.
function resolveInvokedSkillName(input, output) {
  const candidates = [
    input?.name, input?.skill, input?.args?.name, input?.args?.skill,
    input?.arguments?.name, input?.arguments?.skill,
    output?.args?.name, output?.args?.skill,
    output?.arguments?.name, output?.arguments?.skill,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
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

// Try to extract the user's latest text from the system.transform input, supporting multiple input shapes.
function extractUserText(input) {
  if (!input) return ""
  if (typeof input.text === "string" && input.text.trim()) return input.text.trim()
  const parts = readTextParts(input.parts)
  if (parts) return parts
  if (Array.isArray(input.messages)) {
    for (let i = input.messages.length - 1; i >= 0; i--) {
      const msg = input.messages[i]
      if (msg.role !== "user") continue
      if (typeof msg.content === "string" && msg.content.trim()) return msg.content.trim()
      if (Array.isArray(msg.content)) {
        const t = readTextParts(msg.content)
        if (t) return t
      }
    }
  }
  return ""
}

// Build the OpenCode router plugin around the deterministic cascade router.
async function nebuSkillsRouterPlugin(_input, options = {}) {
  const configuredPaths = Array.isArray(options.paths) ? options.paths : []
  const preferredSkillPaths = unique([
    path.resolve(__dirname, "../skills"),
    ...configuredPaths,
  ])
  const discoveredSkills = await loadSkills(preferredSkillPaths)
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
      const { matchedSkills, executionProfile } = cascadeRoute(text, discoveredSkills, currentState)

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
      if (invokedSkillName === SKILL_CODE_REVIEW) {
        setSessionState(sessionStateBySession, input.sessionID, {
          needsCodeReview: false,
          shouldCaptureImprovement: true,
        })
        return
      }

      if (invokedSkillName === SKILL_VERIFICATION) {
        setSessionState(sessionStateBySession, input.sessionID, { shouldCaptureImprovement: true })
        return
      }

      if (invokedSkillName !== SKILL_WRITING) return

      setSessionState(sessionStateBySession, input.sessionID, { shouldCaptureImprovement: false })
    },
    "experimental.chat.system.transform": async (input, output) => {
      const sessionState = getSessionState(sessionStateBySession, input.sessionID)

      // Fallback: route on user's message directly if session state has no matches yet (first-turn blind fix).
      let matchedSkills = sessionState.matchedSkills || []
      let executionProfile = sessionState.executionProfile
      const userMessage = extractUserText(input)
      if (matchedSkills.length === 0 && userMessage) {
        const result = cascadeRoute(userMessage, discoveredSkills, sessionState)
        matchedSkills = result.matchedSkills || []
        executionProfile = result.executionProfile
        setSessionState(sessionStateBySession, input.sessionID, { matchedSkills, executionProfile })
      }

      const lines = [
        "!!! CRITICAL: You MUST load a skill before starting work. Call `skill` with the name of the best-matching workflow skill from the list below BEFORE writing any code or running any tool. This is mandatory, not optional. !!!",
        "",
        "Skill routing (cascade, first match wins):",
        "- GitHub issues → nebu-github-issues",
        "- Debug/bug/error → nebu-debugging",
        "- Audit/refactor/improve → nebu-improve",
        "- UI/UX design → nebu-ui-ux",
        "- Multi-agent/release chores → nebu-agent-workflows",
        "- Skill writing/improvement → nebu-writing-nebu-skills",
        "- Explicit review request → nebu-code-review",
        "- Code edited + done/ready → nebu-code-review",
        "- Done/ready/handoff → nebu-verification",
        "- Ambiguous/planning → nebu-kickoff",
        "- Everything else → nebu-kaizen (default)",
        "- Best match is listed below under 'Best matches for this request'. If none listed, use the cascade above to pick.",
        "- Cost-aware: bounded mechanical chores (version bumps, changelogs, release notes) start with cheap mini subagent.",
        "- Escalate from mini to default/high/xhigh only when scope expands or cheap-first validation fails.",
      ]

      if (skillPreview) {
        lines.push(`- Installed nebu-skills: ${skillPreview}`)
      }

      if (sessionState.needsCodeReview) {
        lines.push(
          "- Code was edited in this session. Before verification or a done/handoff claim, treat `nebu-code-review` as the default next skill unless the diff is truly tiny and a self-review is enough.",
        )
      }

      if (sessionState.shouldCaptureImprovement) {
        lines.push(
          "- Review or verification happened in this session. Before ending cold, consider whether a reusable workflow gap was exposed and route toward `nebu-writing-nebu-skills` when there is a concrete improvement to capture.",
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
      output.description = `${output.description} CRITICAL: You MUST call this tool at the start of every task before writing code or running tools. Installed nebu-skills: ${skillPreview}`
    },
  }
}

module.exports = nebuSkillsRouterPlugin
module.exports.default = nebuSkillsRouterPlugin
