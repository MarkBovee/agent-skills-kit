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
  // The plugin ships commands/ so every workflow also has an unprefixed slash command (/gh-inbox next to /ask-gh-inbox).
  expect(plugin.commands === "./commands/", "plugin.json loads commands/ so workflows have unprefixed slash commands")
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
    // Slash-only contract: the user can run /ask-<name>, the model cannot start it through the Skill tool.
    expect(/^disable-model-invocation:\s*true\s*$/m.test(raw), `${dirName} blocks model invocation (disable-model-invocation: true)`)
    expect(!/^user-invocable:\s*false\s*$/m.test(raw), `${dirName} stays user-invocable as a slash command`)
    expect(description.length > 0, `${dirName} description is a quoted YAML string`)
    expect(description.length <= MAX_DESCRIPTION_LENGTH, `${dirName} description stays within ${MAX_DESCRIPTION_LENGTH} characters`)
    listingChars += description.length + dirName.length
  }
  expect(listingChars <= MAX_LISTING_BUDGET, `skill listing stays within ${MAX_LISTING_BUDGET} characters (${listingChars})`)
}

// Agents that only read and report; the worker is the one agent allowed to edit, and it must stay on Sonnet too.
const WRITING_AGENT_FILES = new Set(["ask-worker.md"])
const GATE_AGENT_FILES = new Set(["ask-reviewer.md", "ask-auditor.md"])

// Check the agent definitions use ask- names, read-only tools except the worker, and a Sonnet model.
function checkAgents() {
  const agentsDir = path.join(REPO_ROOT, "agents")
  for (const fileName of fs.readdirSync(agentsDir)) {
    const raw = fs.readFileSync(path.join(agentsDir, fileName), "utf8")
    expect(/^name: ask-[a-z-]+$/m.test(raw) && raw.includes(`name: ${fileName.replace(/\.md$/, "")}`), `${fileName} agent name matches its file and the ask- prefix`)
    expect(/^tools:/m.test(raw), `${fileName} agent declares its tools`)
    if (WRITING_AGENT_FILES.has(fileName)) {
      expect(/^tools:.*\b(Edit|Write)\b/m.test(raw), `${fileName} worker agent can edit files`)
    } else {
      expect(!/^tools:.*\b(Edit|Write|MultiEdit)\b/m.test(raw), `${fileName} agent is read-only`)
    }
    expect(/^model:\s*sonnet\s*$/m.test(raw), `${fileName} agent requests Sonnet rather than inheriting the session model`)
    // Gate agents default to medium effort and the rest to low; none may default above medium (issue #152).
    const expectedEffort = GATE_AGENT_FILES.has(fileName) ? "medium" : "low"
    expect(new RegExp(`^effort:\\s*${expectedEffort}\\s*$`, "m").test(raw), `${fileName} agent sets effort: ${expectedEffort} instead of inheriting a high default`)
  }
}

// Check the hooks file uses the nested Claude Code shape with a quoted plugin root.
function checkHooksFile() {
  const hooks = readJson("hooks/hooks.json").hooks || {}
  for (const eventName of ["SessionStart", "SubagentStart", "UserPromptSubmit", "PreToolUse", "PostToolUse"]) {
    // Flatten the handler lists of every hook entry for one event.
    const handlers = (hooks[eventName] || []).flatMap((entry) => entry.hooks || [])
    expect(handlers.length > 0, `${eventName} defines nested hook handlers`)
    // Require command handlers that quote the plugin root variable.
    expect(handlers.every((handler) => handler.type === "command" && handler.command.includes('"${CLAUDE_PLUGIN_ROOT}')), `${eventName} handlers quote \${CLAUDE_PLUGIN_ROOT}`)
  }
  // Require a Bash-matched PreToolUse handler that runs the git guard.
  const guardEntry = (hooks.PreToolUse || []).find((entry) => entry.matcher === "Bash")
  // Require one of the Bash entry's handlers to call the guard-bash event.
  expect((guardEntry?.hooks || []).some((handler) => handler.command.endsWith("agent-skills-hook.js\" guard-bash")), "PreToolUse runs the git guard for Bash")
  // Flatten the handler lists of every PostToolUse entry.
  const postToolHandlers = (hooks.PostToolUse || []).flatMap((entry) => entry.hooks || [])
  // Require a handler that tracks router-directed skill file reads.
  expect(postToolHandlers.some((handler) => handler.command.endsWith("agent-skills-hook.js\" post-skill-read")), "PostToolUse tracks router-directed skill file reads")
  // Require a handler that records independent REVIEW/AUDIT agent reports.
  expect(postToolHandlers.some((handler) => handler.command.endsWith("agent-skills-hook.js\" post-agent")), "PostToolUse tracks REVIEW/AUDIT agent reports")
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

  // Mechanical edits (docs, CHANGELOG, VERSION, tests) do not arm the review reminder; code still does and keeps it armed.
  const armed = (sessionId, filePath) => {
    run("prompt", { session_id: sessionId, prompt: "implement the next step" })
    run("post-edit", { session_id: sessionId, tool_name: "Edit", cwd: "/work/app", tool_input: { file_path: filePath } })
    return Boolean(parseHookOutput(run("prompt", { session_id: sessionId, prompt: "continue" }).stdout)?.hookSpecificOutput?.additionalContext?.includes("ask-code-review"))
  }
  expect(!armed("mech-doc", "/work/app/docs/guide.md") && !armed("mech-log", "/work/app/CHANGELOG.md") && !armed("mech-ver", "/work/app/VERSION") && !armed("mech-test", "/work/app/tests/a.test.js"), "mechanical edits do not arm the review reminder")
  expect(armed("mech-code", "/work/app/src/app.js") && armed("mech-skill", "/work/app/skills/ask-x/SKILL.md"), "code and skill edits still arm the review reminder")
  run("post-edit", { session_id: "mech-keep", tool_name: "Edit", cwd: "/work/app", tool_input: { file_path: "/work/app/src/app.js" } })
  run("post-edit", { session_id: "mech-keep", tool_name: "Edit", cwd: "/work/app", tool_input: { file_path: "/work/app/CHANGELOG.md" } })
  expect(parseHookOutput(run("prompt", { session_id: "mech-keep", prompt: "continue" }).stdout)?.hookSpecificOutput?.additionalContext?.includes("ask-code-review"), "a mechanical edit keeps an armed review reminder armed")

  // Writing prose nudges once per session toward ask-text-writing; code, agent guidance, and a loaded skill stay quiet.
  const proseEdit = (sessionId, filePath) => run("post-edit", { session_id: sessionId, tool_name: "Write", cwd: "/work/app", tool_input: { file_path: filePath } }).stdout
  const readmeNudge = parseHookOutput(proseEdit("prose", "/work/app/README.md"))
  expect(readmeNudge?.hookSpecificOutput?.hookEventName === "PostToolUse" && readmeNudge.hookSpecificOutput.additionalContext.includes("ask-text-writing"), "writing a README nudges toward ask-text-writing")
  expect(!proseEdit("prose", "/work/app/docs/guide.md").trim(), "the prose nudge shows once per session")
  expect(!proseEdit("prose-code", "/work/app/src/app.js").trim(), "editing code does not nudge toward ask-text-writing")
  expect(!proseEdit("prose-skill", "/work/app/skills/ask-x/SKILL.md").trim(), "editing agent guidance under skills/ does not nudge toward ask-text-writing")
  expect(!proseEdit("prose-log", "/work/app/CHANGELOG.md").trim(), "editing the mechanical CHANGELOG.md does not nudge toward ask-text-writing")
  expect(!proseEdit("prose-layout", "/work/app/.cursor/rules/x.md").trim(), "a layout directory below a dot-directory does not nudge toward ask-text-writing")
  expect(!proseEdit("prose-agent", "/work/app/docs/x.agent.md").trim() && !proseEdit("prose-local", "/work/app/CLAUDE.local.md").trim(), "agent instruction file variants do not nudge toward ask-text-writing")
  expect(proseEdit("prose-template", "/work/app/.github/ISSUE_TEMPLATE/bug.md").includes("ask-text-writing"), "an issue template still nudges toward ask-text-writing")
  expect(!proseEdit("prose-instructions", "/work/app/.github/instructions/x.instructions.md").trim() && !proseEdit("prose-prompt", "/work/app/docs/x.prompt.md").trim(), "instruction and prompt files do not nudge toward ask-text-writing")
  // A hook state file holding null must read as empty so the routing hint survives it.
  fs.mkdirSync(path.join(stateDir, "sessions"), { recursive: true })
  fs.writeFileSync(path.join(stateDir, "sessions", "null-state.json"), "null")
  const nullStatePrompt = parseHookOutput(run("prompt", { session_id: "null-state", prompt: "fix the failing test in the parser" }).stdout)
  expect(nullStatePrompt?.hookSpecificOutput?.additionalContext?.includes("ask-debugging"), "a null hook state file still yields a routing hint")
  expect(proseEdit("prose-bare", "/work/app/README").includes("ask-text-writing"), "a bare README without an extension still nudges toward ask-text-writing")
  run("post-skill-read", { session_id: "prose-read", tool_input: { file_path: path.join(SKILLS_DIR, "ask-text-writing", "SKILL.md") } })
  expect(!proseEdit("prose-read", "/work/app/README.md").trim(), "reading ask-text-writing silences the prose nudge")
  // The agent's own notes under the host config directory never spend the one-time nudge meant for real prose.
  expect(!proseEdit("prose-home", "/home/u/.claude/plans/idea.md").trim() && proseEdit("prose-home", "/work/app/README.md").includes("ask-text-writing"), "plan and memory files outside the project do not spend the prose nudge")
  expect(proseEdit("prose-docs", "/work/app/docs/commands/install.md").includes("ask-text-writing"), "a docs page about commands still nudges toward ask-text-writing")
  run("session-start", { session_id: "prose", source: "compact" })
  expect(proseEdit("prose", "/work/app/README.md").includes("ask-text-writing"), "compaction re-arms the prose nudge")
  run("post-edit", { session_id: "prose-cwd", tool_name: "Edit", cwd: 5, tool_input: { file_path: "/work/app/src/app.js" } })
  const armedDespiteCwd = parseHookOutput(run("prompt", { session_id: "prose-cwd", prompt: "continue" }).stdout)
  expect(armedDespiteCwd?.hookSpecificOutput?.additionalContext?.includes("ask-code-review"), "a malformed cwd still arms the code-review reminder")

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

  // An independent REVIEW/AUDIT agent report satisfies the gate; BLOCKED, other phases, and later edits do not.
  // Build the PostToolUse payload shape Claude Code sends for a finished Agent call.
  const agentReport = (text) => ({ session_id: "agent", tool_name: "Agent", tool_response: { content: [{ type: "text", text }] } })
  // Arm the reminder with an edit, optionally deliver one agent report, and tell whether the next prompt still reminds.
  const reminderAfter = (text) => {
    run("post-edit", { session_id: "agent", tool_name: "Edit" })
    if (text) run("post-agent", agentReport(text))
    return Boolean(parseHookOutput(run("prompt", { session_id: "agent", prompt: "continue" }).stdout)?.hookSpecificOutput?.additionalContext?.includes("Code edited"))
  }
  expect(reminderAfter("") === true, "the review reminder is armed before any agent reports")
  expect(reminderAfter("ASK_WORKFLOW_PASS phase=REVIEW diff=abc123") === false, "an independent REVIEW pass clears the review reminder")
  expect(reminderAfter("ASK_WORKFLOW_FINDINGS phase=AUDIT diff=abc123") === false, "an independent AUDIT report clears the review reminder")
  expect(reminderAfter("ASK_WORKFLOW_PASS phase=REVIEW") === true, "a review report without a diff identity keeps the reminder")
  expect(reminderAfter("ASK_WORKFLOW_BLOCKED phase=REVIEW") === true, "a BLOCKED review keeps the reminder")
  expect(reminderAfter("ASK_WORKFLOW_PASS phase=VALIDATE diff=abc123") === true, "a non-review phase keeps the reminder")
  run("post-agent", agentReport("ASK_WORKFLOW_PASS phase=REVIEW diff=abc123"))
  run("post-edit", { session_id: "agent", tool_name: "Edit" })
  expect(Boolean(parseHookOutput(run("prompt", { session_id: "agent", prompt: "continue" }).stdout)?.hookSpecificOutput?.additionalContext?.includes("Code edited")), "an edit after the review report re-arms the reminder")

  // The reminder explains how to close the gate once per arming, then stays short until the gate is cleared and re-armed.
  // Fetch the next prompt's additional context for the hint session.
  const hintContext = () => parseHookOutput(run("prompt", { session_id: "hint", prompt: "continue" }).stdout)?.hookSpecificOutput?.additionalContext || ""
  run("post-edit", { session_id: "hint", tool_name: "Edit" })
  expect(hintContext().includes("ASK_WORKFLOW_PASS phase=REVIEW diff=<ref>"), "the first review reminder says how to close the gate")
  expect(hintContext().includes("Code edited") && !hintContext().includes("ASK_WORKFLOW_PASS phase=REVIEW diff=<ref>"), "later reminders omit the close hint")
  run("post-agent", { ...agentReport("ASK_WORKFLOW_PASS phase=REVIEW diff=abc123"), session_id: "hint" })
  run("post-edit", { session_id: "hint", tool_name: "Edit" })
  expect(hintContext().includes("ASK_WORKFLOW_PASS phase=REVIEW diff=<ref>"), "the close hint returns after the gate was cleared and re-armed")

  // Debugging is suggested for a described failure, not for inbox triage or release prep that merely mention a bug or error.
  // Tell whether the next prompt's routing line names ask-debugging.
  const suggestsDebugging = (prompt) => Boolean(parseHookOutput(run("prompt", { session_id: `route-${prompt.length}`, prompt }).stdout)?.hookSpecificOutput?.additionalContext?.includes("ask-debugging"))
  expect(suggestsDebugging("triage the bug reports in the gh inbox") === false, "inbox triage does not suggest ask-debugging")
  expect(suggestsDebugging("prepare a release and update the changelog for the error handling fix") === false, "release prep does not suggest ask-debugging")
  expect(suggestsDebugging("fix the bug in the release notes generator") === true, "a bug in code that merely mentions release notes still suggests ask-debugging")
  expect(suggestsDebugging("timeout when I open the inbox page") === true, "a timeout on an inbox page still suggests ask-debugging")
  expect(suggestsDebugging("the build fails with an error on startup") === true, "a described error still suggests ask-debugging")
  expect(suggestsDebugging("the server crash loop started after the update") === true, "a strong failure phrase still suggests ask-debugging")

  // A resumed or compacted session is told that summarized skill use is historical and skills must be reloaded.
  for (const source of ["compact", "resume"]) {
    const resumed = parseHookOutput(run("session-start", { session_id: `resume-${source}`, source }).stdout)?.hookSpecificOutput?.additionalContext || ""
    expect(resumed.includes("Resumed from a summary") && resumed.includes("historical"), `SessionStart source=${source} adds the skill reload reminder`)
  }
  expect(!startContext.includes("Resumed from a summary"), "a fresh SessionStart carries no resume reminder")
  fs.rmSync(stateDir, { recursive: true, force: true })

  checkGitGuard()

  const slash = runHook("prompt", JSON.stringify({ prompt: "/clear" }))
  expect(slash.status === 0 && slash.stdout.trim() === "", "slash-command prompts produce no hint")

  const garbage = runHook("prompt", "not json")
  expect(garbage.status === 0 && garbage.stdout.trim() === "", "malformed payload exits 0 without output")
}

// Check that the PreToolUse git guard denies destructive git commands, allows normal ones, and honors ASK_GIT_GUARD.
function checkGitGuard() {
  // Run the guard for one Bash command with an optional ASK_GIT_GUARD value and parse its decision.
  const guard = (command, mode) => {
    const env = { ...process.env, ASK_GIT_GUARD: mode || "" }
    const result = spawnSync(process.execPath, [HOOK_SCRIPT, "guard-bash"], { input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: REPO_ROOT }), encoding: "utf8", env, timeout: 10000 })
    return { status: result.status, decision: parseHookOutput(result.stdout)?.hookSpecificOutput }
  }
  // Tell whether the guard denies one command in the given mode.
  const denied = (command, mode) => guard(command, mode).decision?.permissionDecision === "deny"
  const blocked = ["git reset --hard HEAD~1", "git clean -fd", "git branch -D old", "git checkout .", "git restore .", "git push --force origin feature", "git push origin main", "cd app && git push -f", "(cd app && git reset --hard)", "{ git reset --hard; }", "command git reset --hard", "sudo git clean -fd", "/usr/bin/git reset --hard", "echo hi &git reset --hard", "git push -o ci.skip origin main", 'git push origin "HEAD:main"', 'git push origin "+feature"', "cat <<EOF; git reset --hard\nx\nEOF", "git reset --hard \\\n  HEAD", "if true; then git reset --hard; fi"]
  for (const command of blocked) expect(denied(command), `git guard denies \`${command}\``)
  const allowed = ["git status", "git push origin feature/x", "git reset --soft HEAD~1", "git clean -n", "git branch -d merged", "git restore --staged .", "git checkout -b topic", 'git commit -m "docs: mention git push --force"', 'git commit -m "say \\"hi\\"; git reset --hard"', "git commit -F - <<'EOF'\nfix\ngit push --force origin main\nEOF", "git push origin feature # main", "git push -o ci.skip origin feature"]
  for (const command of allowed) expect(!denied(command), `git guard allows \`${command}\``)
  expect(denied("git push origin feature/x", "strict"), "ASK_GIT_GUARD=strict denies every push")
  expect(!denied("git reset --hard", "off"), "ASK_GIT_GUARD=off disables the guard")
  const reason = guard("git reset --hard").decision?.permissionDecisionReason || ""
  expect(reason.includes("do not have authority") && !reason.includes("ASK_GIT_GUARD"), "the denial tells the agent to ask the user and does not advertise the off switch")
  expect(guard("").status === 0 && guard("git status").status === 0, "the guard exits 0 for empty and allowed commands")
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
