#!/usr/bin/env node
// Live skill-activation eval for Claude Code: runs realistic prompts through `claude -p` with this
// checkout as the plugin and records which ASK skill the model loads first. It spends real tokens, so it
// is a manual measurement tool, not a CI check. Usage:
//   node ./scripts/eval-skill-activation.js [--model sonnet] [--runs 1] [--max-turns 3] [--case <id>]

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const REPO_ROOT = path.resolve(__dirname, "..")
const INSTALLED_PLUGIN_ID = "agent-skills-kit@agent-skills-kit"
const CASE_TIMEOUT_MS = 5 * 60 * 1000

// Each case names the skill a careful agent should load first; "none" marks prompts that need no skill.
const CASES = [
  { id: "debug-failing-test", expected: "debugging", prompt: "The test in test/pager.test.js started failing after my last change and I have no idea why. Figure it out." },
  { id: "debug-wrong-result", expected: "debugging", prompt: "page(items, 1, 2) returns the wrong items. Find the cause and fix it." },
  { id: "review-commit", expected: "code-review", prompt: "I am about to push my last commit. Give it a proper review first." },
  { id: "develop-function", expected: "develop", prompt: "Add a lastPage(items, pageSize) function to src/pager.js and export it." },
  { id: "intake-fuzzy", expected: "intake", prompt: "I want to build something around pagination for this project but I am not sure what yet. Help me work out what to build." },
  { id: "spec-api", expected: "spec", prompt: "Write a requirements spec with acceptance criteria for a pagination API before we build it." },
  { id: "research-fact", expected: "research", prompt: "Find out whether node --test supports --test-name-pattern on Node 18 and cite the source." },
  { id: "deep-research", expected: "deep-research", prompt: "Do an exhaustive, cited investigation comparing cursor versus offset pagination across major libraries, including contradictions between sources." },
  { id: "improve-audit", expected: "improve", prompt: "Audit this codebase for tech debt and correctness issues and turn the findings into a plan." },
  { id: "observability", expected: "observability", prompt: "Add structured logging and metrics to src/pager.js so we can see how it behaves in production." },
  { id: "text-writing", expected: "text-writing", prompt: "Write a LinkedIn post announcing this pagination library. It must not sound AI-generated." },
  { id: "design", expected: "design", prompt: "Design a landing page for this library." },
  { id: "design-review", expected: "design-review", prompt: "Here is my landing page hero: \"Unlock seamless pagination. Elevate your workflow. Get started today.\" Does this look AI-generated? Review it." },
  { id: "agent-workflows", expected: "agent-workflows", prompt: "Split this work across parallel subagents: one updates the README, one adds tests for format.js, then merge the results." },
  { id: "verification", expected: "verification", prompt: "I think the pager fix is done. Prove it actually works before we hand it off." },
  { id: "write-skill", expected: "write-skill", prompt: "Create a new agent skill that teaches the agent our release checklist." },
  { id: "gh-inbox", expected: "gh-inbox", prompt: "Check the GitHub inbox for this repository and triage new issues." },
  { id: "session-review", expected: "session-review", prompt: "Reflect on how skills were used in this session and file an improvement issue for the gaps." },
  { id: "question", expected: "none", prompt: "What does pageCount return for an empty list?" },
  { id: "locate", expected: "none", prompt: "Which file defines footer()?" },
]

// Small fixture project the prompts refer to: two modules with a typo and an off-by-one bug, one passing test, and one test that fails on the off-by-one.
const FIXTURE_FILES = {
  "package.json": "{ \"name\": \"activation-fixture\", \"version\": \"1.0.0\", \"private\": true, \"scripts\": { \"test\": \"node --test\" } }\n",
  "src/pager.js": "// Return the items of one 1-based page.\nfunction page(items, pageNumber, pageSize) {\n  const start = pageNumber * pageSize\n  return items.slice(start, start + pageSize)\n}\n\n// Count the pages needed for a list.\nfunction pageCount(items, pageSize) {\n  return Math.ceil(items.length / pageSize)\n}\n\nmodule.exports = { page, pageCount }\n",
  "src/format.js": "// Format a page indicator for the footer.\nfunction footer(pageNumber, total) {\n  return `Paeg ${pageNumber} of ${total}`\n}\n\nmodule.exports = { footer }\n",
  "README.md": "# activation-fixture\n\nSmall pagination helpers.\n",
  "VERSION": "1.0.0\n",
  "CHANGELOG.md": "# Changelog\n\n## Unreleased\n",
  "test/page.test.js": "const test = require(\"node:test\")\nconst assert = require(\"node:assert\")\nconst { page } = require(\"../src/pager\")\n\ntest(\"page returns the first page\", () => {\n  assert.deepStrictEqual(page([1, 2, 3, 4], 1, 2), [1, 2])\n})\n",
  "test/pager.test.js": "const test = require(\"node:test\")\nconst assert = require(\"node:assert\")\nconst { pageCount } = require(\"../src/pager\")\n\ntest(\"pageCount rounds up\", () => {\n  assert.strictEqual(pageCount([1, 2, 3], 2), 2)\n})\n",
}

// Parse the command-line flags into a typed options object with defaults.
function parseOptions(argv) {
  const options = { model: "sonnet", runs: 1, maxTurns: 3, caseId: "" }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (flag === "--model") options.model = value
    else if (flag === "--runs") options.runs = Number(value)
    else if (flag === "--max-turns") options.maxTurns = Number(value)
    else if (flag === "--case") options.caseId = value
    else continue
    index += 1
  }
  if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error("--runs must be a positive integer")
  return options
}

// Write the fixture into a fresh private directory and commit it so prompts about "my last commit" work.
function createFixture(parentDir) {
  const workDir = fs.mkdtempSync(path.join(parentDir, "case-"))
  for (const [relativePath, content] of Object.entries(FIXTURE_FILES)) {
    fs.mkdirSync(path.join(workDir, path.dirname(relativePath)), { recursive: true })
    fs.writeFileSync(path.join(workDir, relativePath), content)
  }
  // Run one git command inside the fixture.
  const git = (args) => spawnSync("git", args, { cwd: workDir, encoding: "utf8" })
  git(["init", "-q"])
  git(["add", "-A"])
  git(["-c", "user.email=eval@example.invalid", "-c", "user.name=eval", "commit", "-qm", "fixture"])
  // Leave one untracked scratch file so cleanup prompts have something real to find.
  fs.writeFileSync(path.join(workDir, "notes.tmp"), "scratch\n")
  return workDir
}

// Run one prompt with this checkout as the plugin; the installed copy is disabled so it cannot answer instead.
function runCase(evalCase, options, parentDir) {
  const workDir = createFixture(parentDir)
  const settings = JSON.stringify({ enabledPlugins: { [INSTALLED_PLUGIN_ID]: false } })
  const args = ["-p", evalCase.prompt, "--plugin-dir", REPO_ROOT, "--settings", settings, "--model", options.model,
    "--max-turns", String(options.maxTurns), "--output-format", "stream-json", "--verbose"]
  const run = spawnSync("claude", args, { cwd: workDir, encoding: "utf8", input: "", timeout: CASE_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 })
  return parseRun(run.stdout || "")
}

// Extract the loaded skills, output tokens, and cost from one stream-json transcript.
function parseRun(stdout) {
  const skills = []
  let outputTokens = 0
  let costUsd = 0
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (event.type === "assistant") skills.push(...skillCalls(event.message?.content || []))
    if (event.type === "result") {
      outputTokens = event.usage?.output_tokens || 0
      costUsd = event.total_cost_usd || 0
    }
  }
  return { skills, outputTokens, costUsd }
}

// Return the bare ASK names of the Skill tool calls in one assistant message.
function skillCalls(content) {
  return content
    // Keep only Skill tool calls.
    .filter((block) => block.type === "tool_use" && block.name === "Skill")
    // Strip the plugin namespace and the ask- prefix to compare against the expected bare name.
    .map((block) => String(block.input?.skill || "").split(":").pop().replace(/^ask-/, ""))
}

// Run every selected case the requested number of times and print a per-case line plus a summary.
function main() {
  const options = parseOptions(process.argv.slice(2))
  const probe = spawnSync("claude", ["--version"], { encoding: "utf8" })
  if (probe.error || probe.status !== 0) throw new Error("claude CLI is required for the activation eval")

  // Keep the cases that match --case, or all of them.
  const selected = CASES.filter((evalCase) => !options.caseId || evalCase.id === options.caseId)
  if (selected.length === 0) throw new Error(`unknown case: ${options.caseId}`)

  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), "ask-activation-eval-"))
  let hits = 0
  let total = 0
  let outputTokens = 0
  let costUsd = 0
  try {
    for (const evalCase of selected) {
      for (let runIndex = 0; runIndex < options.runs; runIndex += 1) {
        const outcome = runCase(evalCase, options, parentDir)
        const first = outcome.skills[0] || "none"
        const passed = first === evalCase.expected
        hits += passed ? 1 : 0
        total += 1
        outputTokens += outcome.outputTokens
        costUsd += outcome.costUsd
        console.log(`${passed ? "OK  " : "MISS"} ${evalCase.id.padEnd(20)} want=${evalCase.expected.padEnd(15)} got=${outcome.skills.join(",") || "none"}`)
      }
    }
  } finally {
    fs.rmSync(parentDir, { recursive: true, force: true })
  }
  console.log(`\nscore ${hits}/${total} (model ${options.model}, runs ${options.runs}) output-tokens ${outputTokens} cost $${costUsd.toFixed(2)}`)
}

// Run only when executed directly so the behavior eval can reuse the fixture helpers.
if (require.main === module) main()

module.exports = { createFixture, CASE_TIMEOUT_MS, INSTALLED_PLUGIN_ID, REPO_ROOT }
