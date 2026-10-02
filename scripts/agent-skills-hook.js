#!/usr/bin/env node

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const {
  SKILL_CODE_REVIEW,
  SKILL_DEVELOP,
  TEST_POLICY,
  buildWorkflowState,
  cascadeRoute,
  createEmptySessionState,
  loadSkills,
  reviewNudgeLines,
  routingHintLines,
  toSingleLine,
  unique,
  workflowRequiresReview,
} = require("../core/router-core")

const PLUGIN_ROOT = path.resolve(__dirname, "..")
const SKILLS_ROOT = path.join(PLUGIN_ROOT, "skills")
const WORKFLOW_RULES_PATH = path.join(PLUGIN_ROOT, "rules", "workflow.md")
const RULES_MARKER = "<!-- agent-skills-kit:managed -->"
const MAX_PREVIEW_SKILLS = 8
const MAX_HINT_SKILLS = 4
const STATE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

// Read the hook payload without making malformed input fatal to the agent session.
async function readInput() {
  let input = ""
  process.stdin.setEncoding("utf8")
  for await (const chunk of process.stdin) input += chunk

  if (!input.trim()) return {}

  try {
    return JSON.parse(input)
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

// Render a routing-table line with ask-prefixed ids so it matches the native skill names.
function toAskIdLine(line) {
  // Prefix the matched skill name with ask- to form its native id.
  return line.replace(/→ ([a-z][a-z-]*)$/, (_match, skillName) => `→ ask-${skillName}`)
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

// Build compact session guidance so native Agent Skills stay responsible for loading bodies.
function buildSessionContext(skills) {
  const preview = skills
    .slice(0, MAX_PREVIEW_SKILLS)
    // Map each skill to a compact id and description preview.
    .map((skill) => `ask-${skill.name}: ${toSingleLine(skill.description, 90)}`)
    .join("; ")
  const mandate = readWorkflowMandate()

  return [
    "Agent Skills Kit (ASK) skills are native Agent Skills with the id `ask-<name>`; load the most specific one with the Skill tool before substantial work. Use `ask-develop` only when nothing more specific matches.",
    "Routing table:",
    ...routingHintLines().map(toAskIdLine),
    "After code edits, complete risk-appropriate validation first; load `ask-code-review` only when the workflow includes a REVIEW gate.",
    "Cost-aware default: bounded mechanical chores such as version bumps, changelog edits, and release-prep updates start with a cheap subagent when available; escalate only when scope expands.",
    mandate ? `Workflow mandate:\n${mandate}` : "",
    `Installed skill preview: ${preview}`,
  ].filter(Boolean).join("\n")
}

// Describe the workflow risk, its gates, and the test budget once per risk change.
function workflowLine(workflow) {
  const gates = (workflow.requiredPhases || []).join(" → ")
  return `Workflow risk=${workflow.risk}; gates: ${gates}; tests: ${TEST_POLICY[workflow.risk] || TEST_POLICY.normal}.`
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
  // Drop the default develop skill so only specific matches produce a routing line.
  const specificNames = names.filter((name) => name !== SKILL_DEVELOP).slice(0, MAX_HINT_SKILLS)

  const lines = []
  if (specificNames.length > 0) {
    const profile = route.executionProfile
    const profileText = profile ? ` Execution profile: ${profile.executionTier}/${profile.delegationMode}.` : ""
    // Prefix each matched skill name with ask- to form its native id.
    lines.push(`Agent Skills Kit routing suggests: ${specificNames.map((name) => `ask-${name}`).join(", ")}.${profileText}`)
  }
  if (workflow && state.announcedRisk !== workflow.risk) lines.push(workflowLine(workflow))
  // Phrase each load call the way Claude Code loads native skills.
  lines.push(...reviewNudgeLines(sessionState, (name) => `Skill tool with skill "ask-${name}"`))

  return {
    text: lines.join("\n"),
    state: { ...state, workflow, announcedRisk: workflow ? workflow.risk : state.announcedRisk },
  }
}

// Wrap hook context in the event-specific JSON shape Claude Code feeds to the model.
function buildHookOutput(eventName, additionalContext) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: eventName, additionalContext } })
}

// Read the skill id a Skill tool call loaded, across the input shapes hosts use.
function readLoadedSkill(payload) {
  const input = payload.tool_input || {}
  return String(input.skill || input.name || input.command || "").trim()
}

// Handle one hook event and emit only the event-supported JSON shape.
async function main() {
  const event = process.argv[2]
  const payload = await readInput()
  const sessionId = readSessionId(payload)

  if (event === "post-edit") {
    saveState(sessionId, { ...loadState(sessionId), needsCodeReview: true })
    return
  }

  if (event === "post-skill") {
    if (readLoadedSkill(payload) === `ask-${SKILL_CODE_REVIEW}`) {
      saveState(sessionId, { ...loadState(sessionId), needsCodeReview: false })
    }
    return
  }

  const skills = await loadSkills([SKILLS_ROOT])

  if (event === "session-start") {
    pruneStates()
    process.stdout.write(buildHookOutput("SessionStart", buildSessionContext(skills)))
    return
  }

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
