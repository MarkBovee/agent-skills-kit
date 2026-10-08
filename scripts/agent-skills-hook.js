#!/usr/bin/env node

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const { evaluateGitCommand, needsCurrentBranch, resolveGuardMode } = require("../core/git-guard")
const {
  SKILL_CODE_REVIEW,
  SKILL_DEVELOP,
  TEST_POLICY,
  buildWorkflowState,
  cascadeRoute,
  createEmptySessionState,
  matchingPhrases,
  parseWorkflowEvidence,
  loadSkills,
  askSkillFileRef,
  askSkillNameFromPath,
  askSkillsRoot,
  skillReadAction: routerSkillReadAction,
  reviewNudgeLines,
  routingHintLines,
  unique,
  workflowRequiresReview,
} = require("../core/router-core")

const PLUGIN_ROOT = path.resolve(__dirname, "..")
const SKILLS_ROOT = path.join(PLUGIN_ROOT, "skills")
const WORKFLOW_RULES_PATH = path.join(PLUGIN_ROOT, "rules", "workflow.md")
const RULES_MARKER = "<!-- agent-skills-kit:managed -->"
const MAX_HINT_SKILLS = 4
const STATE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000
const REVIEW_CLOSE_HINT = "  Close it with an independent reviewer/auditor report ending `ASK_WORKFLOW_PASS phase=REVIEW diff=<ref>` (or `phase=AUDIT`), or by reading the code-review skill; a later edit re-arms it."

// Read the hook payload without making malformed input fatal to the agent session.
async function readInput() {
  let input = ""
  process.stdin.setEncoding("utf8")
  for await (const chunk of process.stdin) input += chunk

  if (!input.trim()) return {}

  try {
    const payload = JSON.parse(input)
    // A JSON null, array, or scalar carries no hook fields; treat it as an empty payload.
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}
  } catch {
    return {}
  }
}

// Resolve the submitted prompt across the payload shapes of Claude Code and VS Code.
function readPrompt(payload) {
  for (const key of ["prompt", "user_input", "message"]) {
    if (typeof payload[key] === "string" && payload[key].trim()) return payload[key].trim()
  }
  return ""
}

// Resolve the session identifier so per-session state never leaks between sessions.
function readSessionId(payload) {
  const sessionId = payload.session_id || payload.sessionID
  return typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : "hook-session"
}

// Choose a private state directory, preferring the plugin data directory over a per-user cache (never shared /tmp).
function stateDirectory() {
  return process.env.CLAUDE_PLUGIN_DATA
    ? path.join(process.env.CLAUDE_PLUGIN_DATA, "sessions")
    : path.join(os.homedir(), ".cache", "agent-skills-kit", "sessions")
}

// Build the state file path for one session with a filesystem-safe name.
function statePath(sessionId) {
  return path.join(stateDirectory(), `${sessionId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80)}.json`)
}

// Load the persisted session state, returning an empty object when none exists or it is unreadable.
function loadState(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(statePath(sessionId), "utf8"))
  } catch {
    return {}
  }
}

// Persist session state best-effort; a failed write must never break the session.
function saveState(sessionId, state) {
  try {
    fs.mkdirSync(stateDirectory(), { recursive: true, mode: 0o700 })
    fs.writeFileSync(statePath(sessionId), JSON.stringify(state), { mode: 0o600 })
  } catch {
    // State is advisory; ignore write failures.
  }
}

// Drop session state files that have not been touched for two weeks.
function pruneStates() {
  try {
    const cutoff = Date.now() - STATE_MAX_AGE_MS
    for (const fileName of fs.readdirSync(stateDirectory())) {
      const filePath = path.join(stateDirectory(), fileName)
      if (fs.statSync(filePath).mtimeMs < cutoff) fs.rmSync(filePath, { force: true })
    }
  } catch {
    // Pruning is housekeeping only.
  }
}

// Resolve the SKILL.md a Read should target: the shared install when present, otherwise the copy bundled
// with the plugin, so a plugin-only Claude Code install works without `~/.agents/skills`.
function skillFilePath(skillName) {
  const sharedFile = path.join(askSkillsRoot(), `ask-${skillName}`, "SKILL.md")
  return fs.existsSync(sharedFile) ? askSkillFileRef(skillName) : path.join(SKILLS_ROOT, `ask-${skillName}`, "SKILL.md")
}

// Render the exact file-read action for one skill, pointing at whichever copy exists.
function skillReadAction(skillName) {
  return routerSkillReadAction(skillName, skillFilePath(skillName))
}

// Render a routing-table line with a direct path to the selected skill file.
function toAskIdLine(line) {
  // Swap the trailing skill name for its file-read action.
  return line.replace(/→ ([a-z][a-z-]*)$/, (_match, skillName) => `→ ${skillReadAction(skillName)}`)
}

// Read the workflow mandate unless the installer already wrote it into the user's Claude rules.
function readWorkflowMandate() {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude")
  try {
    const installedRules = fs.readFileSync(path.join(configDir, "rules", "agent-skills-kit.md"), "utf8")
    if (installedRules.includes(RULES_MARKER)) return ""
  } catch {
    // No installed rules; fall through to the bundled mandate.
  }
  try {
    return fs.readFileSync(WORKFLOW_RULES_PATH, "utf8").trim()
  } catch {
    return ""
  }
}

// Build the routing table shared by the main session and subagents, which do not inherit session context.
function routingContextLines() {
  return [
    "ASK workflow skills are router-only. Select the most specific route, then use Read on the SKILL.md path shown for it; never invoke an ASK leaf through the native Skill tool. Use `ask-develop` only when nothing more specific matches.",
    "Routing table:",
    ...routingHintLines().map(toAskIdLine),
  ]
}

// Build compact session guidance; the native skill listing already carries every description, so it is not repeated.
function buildSessionContext() {
  const mandate = readWorkflowMandate()
  return [
    ...routingContextLines(),
    `After code edits, complete risk-appropriate validation first; ${skillReadAction(SKILL_CODE_REVIEW)} only when the workflow includes a REVIEW gate.`,
    "Cost-aware default: bounded mechanical chores such as version bumps, changelog edits, and release-prep updates start with a cheap subagent when available; escalate only when scope expands.",
    mandate ? `Workflow mandate:\n${mandate}` : "",
  ].filter(Boolean).join("\n")
}

// Describe the workflow risk, its gates, and the test budget once per risk change.
function workflowLine(workflow) {
  const gates = (workflow.requiredPhases || []).join(" → ")
  return `Workflow risk=${workflow.risk}; gates: ${gates}; tests: ${TEST_POLICY[workflow.risk] || TEST_POLICY.normal}.`
}

// Tell whether the prompt hits one of the develop skill's own frontmatter triggers.
function developTriggerFired(prompt, skills) {
  // Find the develop skill among the loaded skills.
  const develop = skills.find((skill) => skill.name === SKILL_DEVELOP)
  return Boolean(develop) && matchingPhrases(prompt, develop.triggers || []).length > 0
}

// Build the routing and lifecycle hints for one prompt and return them with the next state.
function buildPromptHint(prompt, skills, state) {
  if (!prompt || prompt.startsWith("/")) return { text: "", state }

  const workflow = buildWorkflowState(prompt, { workflow: state.workflow })
  const sessionState = {
    ...createEmptySessionState(),
    needsCodeReview: Boolean(state.needsCodeReview) && workflowRequiresReview(workflow),
  }
  const route = cascadeRoute(prompt, skills, sessionState)
  // Collect the matched skill names without duplicates.
  const names = unique(route.matchedSkills.map((skill) => skill.name))
  // Keep the fallback develop route only when one of its own triggers fired; a bare fallback is not a signal.
  const specificNames = names.filter((name) => name !== SKILL_DEVELOP || developTriggerFired(prompt, skills)).slice(0, MAX_HINT_SKILLS)

  const lines = []
  if (specificNames.length > 0) {
    const profile = route.executionProfile
    const profileText = profile ? ` Execution profile: ${profile.executionTier}/${profile.delegationMode}.` : ""
    // Prefix each matched skill name with ask- to form its native id.
    lines.push(`Agent Skills Kit routing suggests: ${specificNames.map((name) => `ask-${name}`).join(", ")}.${profileText}`)
  }
  // A plain question with no routed skill does not start a workflow, so its gates would only be noise.
  const isPlainQuestion = specificNames.length === 0 && prompt.endsWith("?")
  const announcesRisk = Boolean(workflow) && !isPlainQuestion && state.announcedRisk !== workflow.risk
  if (announcesRisk) lines.push(workflowLine(workflow))
  // Point review nudges at the router-only ASK files rather than hidden skill commands.
  const nudges = reviewNudgeLines(sessionState, skillReadAction)
  lines.push(...nudges)
  // Say how to close the review gate once per arming, so the reminder stops costing tokens on later prompts.
  const showsCloseHint = sessionState.needsCodeReview && nudges.length > 0 && !state.reviewHintShown
  if (showsCloseHint) lines.push(REVIEW_CLOSE_HINT)

  return {
    text: lines.join("\n"),
    state: {
      ...state,
      workflow,
      announcedRisk: announcesRisk ? workflow.risk : state.announcedRisk,
      reviewHintShown: Boolean(state.reviewHintShown) || showsCloseHint,
    },
  }
}

// Wrap hook context in the event-specific JSON shape Claude Code feeds to the model.
function buildHookOutput(eventName, additionalContext) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: eventName, additionalContext } })
}

// Read the skill id a Skill tool call loaded, across the input shapes hosts use.
// Claude Code reports plugin skills as `<plugin>:<skill>` (for example `agent-skills-kit:ask-code-review`),
// so any `<namespace>:` prefix is dropped to compare against the bare native id.
function readLoadedSkill(payload) {
  const input = payload.tool_input || {}
  return String(input.skill || input.name || input.command || "").trim().split(":").pop()
}

// Recognize only a successful read of a canonical ASK skill file under a trusted skill root.
function readLoadedSkillFile(payload) {
  const input = payload.tool_input || {}
  const skillName = askSkillNameFromPath(input.file_path || input.filePath || input.path, [askSkillsRoot(), SKILLS_ROOT])
  return skillName ? `ask-${skillName}` : ""
}

// Tell whether an agent result is an independent REVIEW or AUDIT report on a diff; BLOCKED and FAILED never count.
function reportsIndependentReview(payload) {
  const response = payload.tool_response ?? payload.tool_result
  // Read the agent's text parts directly so the diff identity is not polluted by JSON escaping.
  const text = Array.isArray(response?.content) ? response.content.map((part) => part?.text || "").join("\n") : response
  const evidence = parseWorkflowEvidence(text)
  // A report without a diff identity cannot be tied to the edited diff, so it never clears the gate.
  return Boolean(evidence?.diffIdentity) && ["PASS", "FINDINGS"].includes(evidence.status) && ["REVIEW", "AUDIT"].includes(evidence.phase)
}

// Mark the review gate satisfied for the current diff and allow the close hint to show again after the next edit.
function clearReviewGate(sessionId) {
  saveState(sessionId, { ...loadState(sessionId), needsCodeReview: false, reviewHintShown: false })
}

// Remind a resumed session that summarized skill use is history, not loaded guidance.
function buildResumeContext() {
  return [
    "Resumed from a summary: skill instructions read earlier are no longer in context, and a summary's claims about skill use are historical.",
    `Before editing substantial work, re-check the request against the routing table, ${skillReadAction(SKILL_DEVELOP)} and any matching workflow skill again, then compare the plan and gate ledger with the repository state.`,
  ].join("\n")
}

// Look up the checked-out branch of the session's working directory; empty when git is unavailable or HEAD is detached.
function currentGitBranch(cwd) {
  try {
    const result = spawnSync("git", ["symbolic-ref", "--short", "HEAD"], { cwd: cwd || process.cwd(), encoding: "utf8", timeout: 3000 })
    return result.status === 0 ? result.stdout.trim() : ""
  } catch {
    return ""
  }
}

// Build the PreToolUse output that denies a tool call and tells the agent to ask the user instead.
function buildDenyOutput(reason) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `Blocked by the Agent Skills Kit git guard: ${reason}. You do not have authority to run this. Tell the user what you intended and let them run it or approve it.`,
    },
  })
}

// Deny destructive git commands before the Bash tool runs them; ASK_GIT_GUARD=off disables, =strict blocks every push.
function guardBash(payload) {
  const mode = resolveGuardMode(process.env.ASK_GIT_GUARD)
  const command = payload.tool_input?.command
  if (mode === "off" || typeof command !== "string" || !command.trim()) return
  const currentBranch = needsCurrentBranch(command) ? currentGitBranch(payload.cwd) : ""
  const reason = evaluateGitCommand(command, { mode, currentBranch })
  if (reason) process.stdout.write(buildDenyOutput(reason))
}

// Handle one hook event and emit only the event-supported JSON shape.
async function main() {
  const event = process.argv[2]
  const payload = await readInput()
  const sessionId = readSessionId(payload)

  if (event === "guard-bash") {
    guardBash(payload)
    return
  }

  if (event === "post-edit") {
    saveState(sessionId, { ...loadState(sessionId), needsCodeReview: true })
    return
  }

  if (event === "post-skill") {
    if (readLoadedSkill(payload) === `ask-${SKILL_CODE_REVIEW}`) clearReviewGate(sessionId)
    return
  }

  // A REVIEW/AUDIT agent report already satisfies the gate for this diff; a later edit re-arms the reminder.
  if (event === "post-agent") {
    if (reportsIndependentReview(payload)) clearReviewGate(sessionId)
    return
  }

  if (event === "post-skill-read") {
    if (readLoadedSkillFile(payload) === `ask-${SKILL_CODE_REVIEW}`) clearReviewGate(sessionId)
    return
  }

  if (event === "session-start") {
    pruneStates()
    // Compaction drops earlier hook context, so the risk line must be announced again on the next prompt.
    if (payload.source === "compact") saveState(sessionId, { ...loadState(sessionId), announcedRisk: undefined })
    const resumed = payload.source === "compact" || payload.source === "resume"
    process.stdout.write(buildHookOutput("SessionStart", [buildSessionContext(), resumed ? buildResumeContext() : ""].filter(Boolean).join("\n")))
    return
  }

  if (event === "subagent-start") {
    process.stdout.write(buildHookOutput("SubagentStart", routingContextLines().join("\n")))
    return
  }

  const skills = await loadSkills([SKILLS_ROOT])

  if (event === "prompt") {
    const result = buildPromptHint(readPrompt(payload), skills, loadState(sessionId))
    saveState(sessionId, result.state)
    if (result.text) process.stdout.write(buildHookOutput("UserPromptSubmit", result.text))
  }
}

// Never let a hook failure break the agent session.
main().catch((error) => {
  console.error(`agent-skills-kit hook ignored an unexpected error: ${error.message}`)
  process.exitCode = 0
})
