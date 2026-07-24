#!/usr/bin/env node

const path = require("node:path")

const {
  DEFAULT_MAX_HINTS,
  applyBaselineRouting,
  applyExecutionRouting,
  applyImprovementRouting,
  applyKickoffRouting,
  applySessionAwareRouting,
  buildExecutionProfile,
  findMatches,
  getSessionState,
  loadSkills,
  setSessionState,
  toSingleLine,
  unique,
} = require("../core/router-core")

const SKILLS_ROOT = path.resolve(__dirname, "..", "skills")
const MAX_SESSION_HINTS = 4

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

// Resolve the prompt across VS Code-compatible payload shapes.
function readPrompt(payload) {
  return typeof payload.prompt === "string"
    ? payload.prompt.trim()
    : typeof payload.message === "string"
      ? payload.message.trim()
      : ""
}

// Resolve a session identifier when the host supplies one.
function readSessionID(payload) {
  const sessionID = payload.session_id || payload.sessionID
  return typeof sessionID === "string" ? sessionID.trim() : "hook-session"
}

// Run the same routing precedence as the OpenCode adapter for one prompt.
function routePrompt(prompt, skills, state) {
  const sessionID = readSessionID(state.payload)
  const currentState = getSessionState(state.sessions, sessionID)
  const kickoffMatches = applyKickoffRouting(prompt, findMatches(prompt, skills, DEFAULT_MAX_HINTS), skills, DEFAULT_MAX_HINTS)
  const reviewMatches = applySessionAwareRouting(prompt, kickoffMatches, skills, currentState.needsCodeReview, DEFAULT_MAX_HINTS)
  const improvementMatches = applyImprovementRouting(prompt, reviewMatches, skills, currentState.shouldCaptureImprovement, DEFAULT_MAX_HINTS)
  const executionMatches = applyExecutionRouting(prompt, improvementMatches, skills, DEFAULT_MAX_HINTS)
  const matches = applyBaselineRouting(prompt, executionMatches, skills, DEFAULT_MAX_HINTS)
  const executionProfile = buildExecutionProfile(prompt, matches)

  setSessionState(state.sessions, sessionID, { matchedSkills: matches, executionProfile })
  return { matches, executionProfile }
}

// Build compact session guidance so native Agent Skills remain responsible for loading bodies.
function buildSessionContext(skills) {
  const preview = skills
    .slice(0, 8)
    .map((skill) => `${skill.name}: ${toSingleLine(skill.description, 90)}`)
    .join("; ")

  return [
    "Nebu Skills are installed as native Agent Skills and should be loaded when their descriptions match the task.",
    "After verification, consider session-review to reflect on skill usage and file improvements in the nebu-skills repo.",
    "After code edits, route through nebu-code-review before verification or a completion claim.",
    "Cost-aware default: bounded mechanical chores such as version bumps, changelog edits, release notes, and release-prep updates should start with a cheap small/mini subagent when the host supports it. Escalate to a stronger agent only when scope expands or cheap-first validation fails.",
    `Installed skill preview: ${preview}`,
  ].join("\n")
}

// Build a non-blocking visible hint for the user's submitted prompt.
function buildPromptMessage(prompt, skills, state) {
  if (!prompt) return ""

  const { matches, executionProfile } = routePrompt(prompt, skills, state)
  if (matches.length === 0) return ""

  const names = unique(matches.map((skill) => skill.name)).slice(0, MAX_SESSION_HINTS)
  return `Nebu skill routing suggests: ${names.join(", ")}. Execution profile: ${executionProfile.executionTier}/${executionProfile.delegationMode}.`
}

// Handle one VS Code hook event and emit only the event-supported JSON shape.
async function main() {
  const event = process.argv[2]
  const payload = await readInput()
  const skills = await loadSkills([SKILLS_ROOT])
  // ponytail: sessions resets every hook invocation because each call is a separate process.
  // needsCodeReview/shouldCaptureImprovement can never flip true today anyway — hooks.json
  // only wires SessionStart and UserPromptSubmit, and no post-tool-execution event exists here
  // to set them (unlike the OpenCode plugin's tool.execute.after handler). If a tool-completion
  // hook event becomes available, wire it here and persist this Map across invocations then.
  const state = { payload, sessions: new Map() }

  if (event === "session-start") {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: buildSessionContext(skills),
      },
    }))
    return
  }

  if (event === "prompt") {
    const message = buildPromptMessage(readPrompt(payload), skills, state)
    if (message) process.stdout.write(JSON.stringify({ systemMessage: message }))
  }
}

main().catch((error) => {
  console.error(`nebu-skills hook ignored an unexpected error: ${error.message}`)
  process.exitCode = 0
})