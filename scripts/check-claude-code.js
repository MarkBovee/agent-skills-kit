#!/usr/bin/env node
// Verify that the plugin, marketplace, skills, and hooks satisfy the Claude Code contract
// (ask-prefixed native names, ./-relative manifest paths, nested hook shape, additionalContext output).

const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const REPO_ROOT = path.resolve(__dirname, "..")
const SKILLS_DIR = path.join(REPO_ROOT, "skills")
const HOOK_SCRIPT = path.join(REPO_ROOT, "scripts", "agent-skills-hook.js")
const MAX_DESCRIPTION_LENGTH = 400
const MAX_LISTING_BUDGET = 1536 * 4

const failures = []

// Record one failed expectation without stopping the remaining checks.
function expect(condition, message) {
  if (condition) {
    console.log(`OK: ${message}`)
    return
  }
  failures.push(message)
  console.error(`FAIL: ${message}`)
}

// Read and parse a JSON file relative to the repository root.
function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"))
}

// Run the hook script with a raw stdin payload and capture its result.
function runHook(event, stdin) {
  return spawnSync(process.execPath, [HOOK_SCRIPT, event], { input: stdin, encoding: "utf8", timeout: 10000 })
}

// Parse hook stdout as JSON, returning null for empty or invalid output.
function parseHookOutput(stdout) {
  if (!stdout.trim()) return null
  try {
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

// Check the manifest and marketplace files for Claude Code path and identity rules.
function checkManifest() {
  const plugin = readJson(".claude-plugin/plugin.json")
  const marketplace = readJson(".claude-plugin/marketplace.json")
  // Keep only manifest keys that hold string paths.
  const pathKeys = ["skills", "commands", "agents", "hooks"].filter((key) => typeof plugin[key] === "string")
  // Require every string path to start with ./ as Claude Code demands.
  expect(pathKeys.every((key) => plugin[key].startsWith("./")), "plugin.json component paths start with ./")
  expect(plugin.name === "agent-skills-kit", "plugin.json name is agent-skills-kit")
  // Find the marketplace entry that points at this plugin root.
  expect(marketplace.plugins?.some((entry) => entry.name === plugin.name && entry.source === "./"), "marketplace.json lists the plugin with source ./")
}

// Check every skill for native Claude Code naming, parseable YAML-safe description, and listing budget.
function checkSkills() {
  let listingChars = 0
  for (const dirName of fs.readdirSync(SKILLS_DIR)) {
    const raw = fs.readFileSync(path.join(SKILLS_DIR, dirName, "SKILL.md"), "utf8")
    const nameMatch = raw.match(/^name:\s*(\S+)\s*$/m)
    const descriptionMatch = raw.match(/^description:\s*(.*)$/m)
    expect(nameMatch?.[1] === dirName && dirName.startsWith("ask-"), `${dirName} frontmatter name equals its ask-prefixed directory`)

    let description = ""
    try {
      description = JSON.parse(descriptionMatch?.[1] || "")
    } catch {
      description = ""
    }
    expect(description.length > 0, `${dirName} description is a quoted YAML string`)
    expect(description.length <= MAX_DESCRIPTION_LENGTH, `${dirName} description stays within ${MAX_DESCRIPTION_LENGTH} characters`)
    listingChars += description.length + dirName.length
  }
  expect(listingChars <= MAX_LISTING_BUDGET, `skill listing stays within ${MAX_LISTING_BUDGET} characters (${listingChars})`)
}

// Check the agent definitions use the ask- names and a tool allowlist without edit tools.
function checkAgents() {
  const agentsDir = path.join(REPO_ROOT, "agents")
  for (const fileName of fs.readdirSync(agentsDir)) {
    const raw = fs.readFileSync(path.join(agentsDir, fileName), "utf8")
    expect(/^name: ask-[a-z-]+$/m.test(raw) && raw.includes(`name: ${fileName.replace(/\.md$/, "")}`), `${fileName} agent name matches its file and the ask- prefix`)
    expect(/^tools:/m.test(raw) && !/^tools:.*\b(Edit|Write|MultiEdit)\b/m.test(raw), `${fileName} agent is read-only`)
  }
}

// Check the hooks file uses the nested Claude Code shape with a quoted plugin root.
function checkHooksFile() {
  const hooks = readJson("hooks/hooks.json").hooks || {}
  for (const eventName of ["SessionStart", "UserPromptSubmit", "PostToolUse"]) {
    // Flatten the handler lists of every hook entry for one event.
    const handlers = (hooks[eventName] || []).flatMap((entry) => entry.hooks || [])
    expect(handlers.length > 0, `${eventName} defines nested hook handlers`)
    // Require command handlers that quote the plugin root variable.
    expect(handlers.every((handler) => handler.type === "command" && handler.command.includes('"${CLAUDE_PLUGIN_ROOT}')), `${eventName} handlers quote \${CLAUDE_PLUGIN_ROOT}`)
  }
}

// Smoke-test the hook script with real Claude Code payload shapes.
function checkHookBehavior() {
  const start = parseHookOutput(runHook("session-start", "{}").stdout)
  const startContext = start?.hookSpecificOutput?.additionalContext || ""
  expect(start?.hookSpecificOutput?.hookEventName === "SessionStart" && startContext.includes("ask-develop"), "SessionStart emits additionalContext with ask-prefixed ids")
  expect(!start || !("systemMessage" in start), "SessionStart output carries no user-only systemMessage")

  const prompt = parseHookOutput(runHook("prompt", JSON.stringify({ prompt: "fix the failing test in the parser", session_id: "check" })).stdout)
  expect(prompt?.hookSpecificOutput?.additionalContext?.includes("ask-debugging"), "UserPromptSubmit routes a bug prompt to ask-debugging via additionalContext")

  const alternate = parseHookOutput(runHook("prompt", JSON.stringify({ user_input: "fix the failing test in the parser" })).stdout)
  expect(alternate?.hookSpecificOutput?.additionalContext?.includes("ask-debugging"), "UserPromptSubmit also reads the user_input payload field")

  const stateDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "ask-hook-state-"))
  const stateEnv = { ...process.env, CLAUDE_PLUGIN_DATA: stateDir }
  // Run one hook event with a JSON payload and the isolated state directory.
  const run = (event, payload) => spawnSync(process.execPath, [HOOK_SCRIPT, event], { input: JSON.stringify(payload), encoding: "utf8", env: stateEnv, timeout: 10000 })
  run("prompt", { session_id: "state", prompt: "implement the next step" })
  run("post-edit", { session_id: "state", tool_name: "Edit" })
  const nudge = parseHookOutput(run("prompt", { session_id: "state", prompt: "continue" }).stdout)
  expect(nudge?.hookSpecificOutput?.additionalContext?.includes("ask-code-review"), "an edit makes the next prompt remind about ask-code-review")
  run("post-skill", { session_id: "state", tool_input: { skill: "ask-code-review" } })
  const cleared = parseHookOutput(run("prompt", { session_id: "state", prompt: "continue" }).stdout)
  expect(!cleared?.hookSpecificOutput?.additionalContext?.includes("Code edited"), "loading ask-code-review clears the reminder")
  fs.rmSync(stateDir, { recursive: true, force: true })

  const slash = runHook("prompt", JSON.stringify({ prompt: "/clear" }))
  expect(slash.status === 0 && slash.stdout.trim() === "", "slash-command prompts produce no hint")

  const garbage = runHook("prompt", "not json")
  expect(garbage.status === 0 && garbage.stdout.trim() === "", "malformed payload exits 0 without output")
}

checkManifest()
checkSkills()
checkHooksFile()
checkAgents()
checkHookBehavior()

if (failures.length > 0) {
  console.error(`\n${failures.length} Claude Code compatibility check(s) failed.`)
  process.exitCode = 1
} else {
  console.log("\nClaude Code compatibility checks passed.")
}
