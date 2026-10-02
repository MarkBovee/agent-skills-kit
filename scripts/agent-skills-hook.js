#!/usr/bin/env node

const path = require("node:path")

const {
  SKILL_DEVELOP,
  cascadeRoute,
  createEmptySessionState,
  loadSkills,
  routingHintLines,
  toSingleLine,
  unique,
} = require("../core/router-core")

const SKILLS_ROOT = path.resolve(__dirname, "..", "skills")
const MAX_PREVIEW_SKILLS = 8
const MAX_HINT_SKILLS = 4

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

// Render a routing-table line with ask-prefixed ids so it matches the native skill names.
function toAskIdLine(line) {
  // Prefix the matched skill name with ask- to form its native id.
  return line.replace(/→ ([a-z][a-z-]*)$/, (_match, skillName) => `→ ask-${skillName}`)
}

// Build compact session guidance so native Agent Skills stay responsible for loading bodies.
function buildSessionContext(skills) {
  const preview = skills
    .slice(0, MAX_PREVIEW_SKILLS)
    // Map each skill to a compact id and description preview.
    .map((skill) => `ask-${skill.name}: ${toSingleLine(skill.description, 90)}`)
    .join("; ")

  return [
    "Agent Skills Kit (ASK) skills are native Agent Skills with the id `ask-<name>`; load the most specific one with the Skill tool before substantial work. Use `ask-develop` only when nothing more specific matches.",
    "Routing table:",
    ...routingHintLines().map(toAskIdLine),
    "After code edits, complete risk-appropriate validation first; load `ask-code-review` only when the workflow includes a REVIEW gate.",
    "Cost-aware default: bounded mechanical chores such as version bumps, changelog edits, and release-prep updates start with a cheap subagent when available; escalate only when scope expands.",
    `Installed skill preview: ${preview}`,
  ].join("\n")
}

// Build a non-blocking routing hint for the submitted prompt, or an empty string when nothing specific matches.
function buildPromptHint(prompt, skills) {
  if (!prompt || prompt.startsWith("/")) return ""

  const route = cascadeRoute(prompt, skills, createEmptySessionState())
  // Collect the matched skill names without duplicates.
  const names = unique(route.matchedSkills.map((skill) => skill.name))
  // Drop the default develop skill so only specific matches produce a hint.
  const specificNames = names.filter((name) => name !== SKILL_DEVELOP).slice(0, MAX_HINT_SKILLS)
  if (specificNames.length === 0) return ""

  const profile = route.executionProfile
  const profileText = profile ? ` Execution profile: ${profile.executionTier}/${profile.delegationMode}.` : ""
  return `Agent Skills Kit routing suggests: ${specificNames.map((name) => `ask-${name}`).join(", ")}.${profileText}`
}

// Wrap hook context in the event-specific JSON shape Claude Code feeds to the model.
function buildHookOutput(eventName, additionalContext) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: eventName, additionalContext } })
}

// Handle one hook event and emit only the event-supported JSON shape.
async function main() {
  const event = process.argv[2]
  const payload = await readInput()
  const skills = await loadSkills([SKILLS_ROOT])

  if (event === "session-start") {
    process.stdout.write(buildHookOutput("SessionStart", buildSessionContext(skills)))
    return
  }

  if (event === "prompt") {
    const hint = buildPromptHint(readPrompt(payload), skills)
    if (hint) process.stdout.write(buildHookOutput("UserPromptSubmit", hint))
  }
}

// Never let a hook failure break the agent session.
main().catch((error) => {
  console.error(`agent-skills-kit hook ignored an unexpected error: ${error.message}`)
  process.exitCode = 0
})
