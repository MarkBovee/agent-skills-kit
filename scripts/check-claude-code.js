#!/usr/bin/env node
// Verify that the plugin, marketplace, skills, and hooks satisfy the Claude Code contract
// (ask-prefixed native names, ./-relative manifest paths, nested hook shape, additionalContext output).

const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const REPO_ROOT = path.resolve(__dirname, "..")
const SKILLS_DIR = path.join(REPO_ROOT, "skills")
const HOOK_SCRIPT = path.join(REPO_ROOT, "scripts", "agent-skills-hook.js")
// Claude Code shares one listing budget (1% of the context window) across every installed skill and drops
// descriptions once it is spent, so each ASK description stays short enough to survive next to other packs.
const MAX_DESCRIPTION_LENGTH = 160
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
  // Skills already act as slash commands in Claude Code; loading commands/ too would duplicate every menu entry.
  expect(Array.isArray(plugin.commands) && plugin.commands.length === 0, "plugin.json sets commands to [] so skills are not duplicated as commands")
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

// Check the agent definitions use ask- names, read-only tools, and a Sonnet fallback.
function checkAgents() {
  const agentsDir = path.join(REPO_ROOT, "agents")
  for (const fileName of fs.readdirSync(agentsDir)) {
    const raw = fs.readFileSync(path.join(agentsDir, fileName), "utf8")
    expect(/^name: ask-[a-z-]+$/m.test(raw) && raw.includes(`name: ${fileName.replace(/\.md$/, "")}`), `${fileName} agent name matches its file and the ask- prefix`)
    expect(/^tools:/m.test(raw) && !/^tools:.*\b(Edit|Write|MultiEdit)\b/m.test(raw), `${fileName} agent is read-only`)
    expect(/^model:\s*sonnet\s*$/m.test(raw), `${fileName} agent requests Sonnet rather than inheriting the session model`)
  }
}

// Check the hooks file uses the nested Claude Code shape with a quoted plugin root.
function checkHooksFile() {
  const hooks = readJson("hooks/hooks.json").hooks || {}
  for (const eventName of ["SessionStart", "SubagentStart", "UserPromptSubmit", "PostToolUse"]) {
    // Flatten the handler lists of every hook entry for one event.
    const handlers = (hooks[eventName] || []).flatMap((entry) => entry.hooks || [])
    expect(handlers.length > 0, `${eventName} defines nested hook handlers`)
    // Require command handlers that quote the plugin root variable.
    expect(handlers.every((handler) => handler.type === "command" && handler.command.includes('"${CLAUDE_PLUGIN_ROOT}')), `${eventName} handlers quote \${CLAUDE_PLUGIN_ROOT}`)
  }
  const postToolHandlers = (hooks.PostToolUse || []).flatMap((entry) => entry.hooks || [])
  expect(postToolHandlers.some((handler) => handler.command.endsWith("agent-skills-hook.js\" post-skill-read")), "PostToolUse tracks router-directed skill file reads")
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
  run("post-skill-read", { session_id: "state", tool_input: { file_path: path.join(SKILLS_DIR, "ask-code-review", "SKILL.md") } })
  const cleared = parseHookOutput(run("prompt", { session_id: "state", prompt: "continue" }).stdout)
  expect(!cleared?.hookSpecificOutput?.additionalContext?.includes("Code edited"), "reading ask-code-review clears the reminder")
  // Payload captured live from Claude Code 2.1.284: plugin skills arrive namespaced as `<plugin>:<skill>`.
  run("post-edit", { session_id: "state", tool_name: "Write" })
  run("post-skill", { session_id: "state", hook_event_name: "PostToolUse", tool_name: "Skill", tool_input: { skill: "agent-skills-kit:ask-code-review" }, tool_response: { success: true, commandName: "agent-skills-kit:ask-code-review" } })
  const clearedNamespaced = parseHookOutput(run("prompt", { session_id: "state", prompt: "continue" }).stdout)
  expect(!clearedNamespaced?.hookSpecificOutput?.additionalContext?.includes("Code edited"), "loading the plugin-namespaced agent-skills-kit:ask-code-review clears the reminder")

  // Run a hook with a chosen shared skill root so path resolution never depends on the developer's real home directory.
  const runWithSharedRoot = (event, payload, sharedRoot) => spawnSync(process.execPath, [HOOK_SCRIPT, event], { input: JSON.stringify(payload), encoding: "utf8", env: { ...stateEnv, ASK_SKILLS_DIR: sharedRoot }, timeout: 10000 })
  const bundledDebugging = path.join(SKILLS_DIR, "ask-debugging", "SKILL.md")
  const missingRoot = path.join(stateDir, "no-shared-skills")
  const pluginOnly = parseHookOutput(runWithSharedRoot("subagent-start", { agent_type: "Explore" }, missingRoot).stdout)
  expect(pluginOnly?.hookSpecificOutput?.hookEventName === "SubagentStart" && pluginOnly.hookSpecificOutput.additionalContext.includes(`Read \`${bundledDebugging}\``), "plugin-only installs point subagents at the bundled skill files")
  const sharedRoot = path.join(stateDir, "shared-skills")
  fs.mkdirSync(path.join(sharedRoot, "ask-debugging"), { recursive: true })
  fs.writeFileSync(path.join(sharedRoot, "ask-debugging", "SKILL.md"), "stub\n")
  const sharedInstall = parseHookOutput(runWithSharedRoot("subagent-start", { agent_type: "Explore" }, sharedRoot).stdout)
  expect(sharedInstall?.hookSpecificOutput?.additionalContext?.includes(`Read \`${path.join(sharedRoot, "ask-debugging", "SKILL.md")}\``), "a shared install takes precedence over the bundled skill files")
  // A shared root with a space must stay one quoted token in the emitted action.
  const spacedRoot = path.join(stateDir, "shared skills")
  fs.mkdirSync(path.join(spacedRoot, "ask-debugging"), { recursive: true })
  fs.writeFileSync(path.join(spacedRoot, "ask-debugging", "SKILL.md"), "stub\n")
  const spaced = parseHookOutput(runWithSharedRoot("subagent-start", { agent_type: "Explore" }, spacedRoot).stdout)
  expect(spaced?.hookSpecificOutput?.additionalContext?.includes(`Read \`${path.join(spacedRoot, "ask-debugging", "SKILL.md")}\``), "paths with spaces are backtick-quoted in read actions")
  const sessionPluginOnly = parseHookOutput(runWithSharedRoot("session-start", {}, missingRoot).stdout)
  expect(sessionPluginOnly?.hookSpecificOutput?.additionalContext?.includes(`Read \`${path.join(SKILLS_DIR, "ask-code-review", "SKILL.md")}\``), "SessionStart names a readable code-review file for plugin-only installs")
  // Reading a file under a relocated shared root clears the review reminder just like the bundled copy.
  runWithSharedRoot("post-edit", { session_id: "shared", tool_name: "Edit" }, sharedRoot)
  fs.mkdirSync(path.join(sharedRoot, "ask-code-review"), { recursive: true })
  fs.writeFileSync(path.join(sharedRoot, "ask-code-review", "SKILL.md"), "stub\n")
  runWithSharedRoot("post-skill-read", { session_id: "shared", tool_input: { file_path: path.join(sharedRoot, "ask-code-review", "SKILL.md") } }, sharedRoot)
  const sharedCleared = parseHookOutput(runWithSharedRoot("prompt", { session_id: "shared", prompt: "continue" }, sharedRoot).stdout)
  expect(!sharedCleared?.hookSpecificOutput?.additionalContext?.includes("Code edited"), "reading ask-code-review from the shared root clears the reminder")
  expect(!startContext.includes("Installed skill preview"), "SessionStart does not repeat the native skill listing")

  const question = parseHookOutput(run("prompt", { prompt: "What does pageCount return for an empty list?", session_id: "question" }).stdout)
  expect(!question, "a plain question gets no routing or workflow line")
  const develop = parseHookOutput(run("prompt", { prompt: "Implement this: add pagination to the API", session_id: "develop" }).stdout)
  expect(develop?.hookSpecificOutput?.additionalContext?.includes("ask-develop"), "a develop trigger produces an ask-develop hint")

  run("prompt", { session_id: "compact", prompt: "implement the next step" })
  run("session-start", { session_id: "compact", source: "compact" })
  const afterCompact = parseHookOutput(run("prompt", { session_id: "compact", prompt: "implement the next step" }).stdout)
  expect(afterCompact?.hookSpecificOutput?.additionalContext?.includes("Workflow risk="), "the workflow risk line is announced again after compaction")
  fs.rmSync(stateDir, { recursive: true, force: true })

  const slash = runHook("prompt", JSON.stringify({ prompt: "/clear" }))
  expect(slash.status === 0 && slash.stdout.trim() === "", "slash-command prompts produce no hint")

  const garbage = runHook("prompt", "not json")
  expect(garbage.status === 0 && garbage.stdout.trim() === "", "malformed payload exits 0 without output")
}

// Run the real `claude plugin validate --strict` on each manifest/component target when the CLI is installed.
function checkNativeValidator() {
  const probe = spawnSync("claude", ["--version"], { encoding: "utf8", timeout: 20000 })
  if (probe.error || probe.status !== 0) {
    console.log("SKIP: claude CLI not installed; native plugin validation not run")
    return
  }
  const targets = [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "skills", "agents", "commands"]
  for (const target of targets) {
    const validation = spawnSync("claude", ["plugin", "validate", target, "--strict"], { cwd: REPO_ROOT, encoding: "utf8", timeout: 60000 })
    expect(validation.status === 0, `claude plugin validate --strict passes for ${target}`)
  }
}

checkManifest()
checkNativeValidator()
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
