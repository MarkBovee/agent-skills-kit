#!/usr/bin/env node
// Behavior eval for Claude Code: runs each evals/ask-<name>.json query through `claude -p` with this
// checkout as the plugin (or without it for --baseline), then has a judge model grade the transcript
// against expected_behavior. It spends real tokens, so it is a manual tool, not a CI check. Usage:
//   node ./scripts/eval-skill-behavior.js [--model haiku|sonnet|opus] [--judge sonnet] [--skill debugging,develop] [--baseline] [--allow-opus] [--max-turns 8] [--dump dir]

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { createFixture, CASE_TIMEOUT_MS, INSTALLED_PLUGIN_ID, REPO_ROOT } = require("./eval-skill-activation.js")

const EVALS_DIR = path.join(REPO_ROOT, "evals")
// Built-in tools (web reads included) and no MCP servers. Bash is unrestricted and inherits the real HOME and
// credentials, so run this only in a disposable environment.
const ALLOWED_TOOLS = "Read,Glob,Grep,Edit,Write,Bash,WebSearch,WebFetch"
// Replies that mean the account ran out of quota; grading them would score a dead run as a miss.
const LIMIT_PATTERN = /hit your (?:session|usage|weekly) limit|rate limit/i
const MAX_TRANSCRIPT_CHARS = 24000
const JUDGE_TIMEOUT_MS = 2 * 60 * 1000

// Parse the command-line flags into a typed options object with defaults.
function parseOptions(argv) {
  const options = { model: "sonnet", judge: "sonnet", skill: "", baseline: false, maxTurns: 8, dumpDir: "" }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === "--baseline") {
      options.baseline = true
      continue
    }
    if (flag === "--allow-opus") {
      options.allowOpus = true
      continue
    }
    const value = argv[index + 1]
    if (value === undefined) throw new Error(`${flag} needs a value`)
    if (flag === "--model") options.model = value
    else if (flag === "--judge") options.judge = value
    else if (flag === "--skill") options.skill = value.replace(/ask-/g, "")
    else if (flag === "--max-turns") options.maxTurns = Number(value)
    else if (flag === "--dump") options.dumpDir = value
    else continue
    index += 1
  }
  if (/opus/i.test(options.model) && !options.allowOpus) throw new Error("Opus runs are expensive; pass --allow-opus to use it")
  if (!Number.isInteger(options.maxTurns) || options.maxTurns < 1) throw new Error("--max-turns must be a positive integer")
  return options
}

// Load the selected eval files as { skill, cases } entries.
function loadEvals(skillFilter) {
  const wanted = skillFilter ? skillFilter.split(",") : []
  const entries = []
  for (const file of fs.readdirSync(EVALS_DIR).sort()) {
    const skill = file.replace(/^ask-/, "").replace(/\.json$/, "")
    if (wanted.length > 0 && !wanted.includes(skill)) continue
    entries.push({ skill, cases: JSON.parse(fs.readFileSync(path.join(EVALS_DIR, file), "utf8")) })
  }
  return entries
}

// Render one stream-json transcript as compact text: assistant prose, tool calls, and the final result.
function renderTranscript(stdout) {
  const parts = []
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (event.type !== "assistant") continue
    for (const block of event.message?.content || []) {
      if (block.type === "text") parts.push(`ASSISTANT: ${block.text}`)
      if (block.type === "tool_use") parts.push(`TOOL ${block.name}: ${JSON.stringify(block.input).slice(0, 300)}`)
    }
  }
  return parts.join("\n").slice(0, MAX_TRANSCRIPT_CHARS)
}

// Run one query in a fresh fixture, with the plugin unless this is the baseline run.
function runQuery(query, options, parentDir) {
  const workDir = createFixture(parentDir)
  const settings = JSON.stringify({ enabledPlugins: { [INSTALLED_PLUGIN_ID]: false } })
  const args = ["-p", query, "--settings", settings,
    "--model", options.model, "--max-turns", String(options.maxTurns), "--output-format", "stream-json", "--verbose",
    "--allowedTools", ALLOWED_TOOLS, "--strict-mcp-config"]
  if (!options.baseline) args.push("--plugin-dir", REPO_ROOT)
  const run = spawnSync("claude", args, { cwd: workDir, encoding: "utf8", input: "", timeout: CASE_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 })
  if (run.error) return `RUN FAILED: ${run.error.message}`
  return renderTranscript(run.stdout || "")
}

// Render one expected behavior as a numbered rubric line.
function numberedLine(text, index) {
  return `${index + 1}. ${text}`
}

// Ask the judge model which expected behaviors the transcript shows, from a private scratch directory; returns an array of booleans.
function gradeTranscript(evalCase, transcript, options, judgeDir) {
  const expected = evalCase.expected_behavior
  const rubric = expected.map(numberedLine).join("\n")
  const prompt = `Grade this agent transcript. For each numbered expected behavior answer true only if the transcript clearly shows it.\n` +
    `Reply with a JSON array of ${expected.length} booleans and nothing else.\n\nTask: ${evalCase.query}\n\nExpected:\n${rubric}\n\nTranscript:\n${transcript}`
  const run = spawnSync("claude", ["-p", prompt, "--model", options.judge, "--max-turns", "1", "--output-format", "text"],
    { cwd: judgeDir, encoding: "utf8", input: "", timeout: JUDGE_TIMEOUT_MS })
  const match = (run.stdout || "").match(/\[[^\]]*\]/)
  try {
    const verdicts = JSON.parse(match ? match[0] : "[]")
    // Count a behavior as shown only when the judge said exactly true.
    return expected.map((_, index) => verdicts[index] === true)
  } catch {
    // An unparseable judge reply grades every behavior as not shown.
    return expected.map(() => false)
  }
}

// Save one transcript and its verdicts so a miss can be inspected.
function dumpTranscript(dir, skill, evalCase, transcript, verdicts) {
  fs.mkdirSync(dir, { recursive: true })
  const slug = evalCase.query.slice(0, 40).replace(/\W+/g, "-")
  const name = `${skill}-${slug}-${Date.now()}.txt`
  fs.writeFileSync(path.join(dir, name), `${evalCase.query}\n${JSON.stringify(verdicts)}\n\n${transcript}\n`)
}

// Run every selected case, print a per-case line, and finish with a total score.
function main() {
  const options = parseOptions(process.argv.slice(2))
  const probe = spawnSync("claude", ["--version"], { encoding: "utf8" })
  if (probe.error || probe.status !== 0) throw new Error("claude CLI is required for the behavior eval")
  const evals = loadEvals(options.skill)
  if (evals.length === 0) throw new Error(`no evals found for: ${options.skill}`)

  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), "ask-behavior-eval-"))
  let passed = 0
  let total = 0
  try {
    for (const { skill, cases } of evals) {
      for (const evalCase of cases) {
        const transcript = runQuery(evalCase.query, options, parentDir)
        if (LIMIT_PATTERN.test(transcript)) throw new Error(`usage limit reached at "${evalCase.query.slice(0, 50)}"; scores so far are partial`)
        const verdicts = gradeTranscript(evalCase, transcript, options, parentDir)
        if (options.dumpDir) dumpTranscript(options.dumpDir, skill, evalCase, transcript, verdicts)
        const hits = verdicts.filter(Boolean).length // count the behaviors the judge confirmed
        passed += hits
        total += verdicts.length
        console.log(`${hits === verdicts.length ? "OK  " : "MISS"} ${skill.padEnd(16)} ${hits}/${verdicts.length} ${evalCase.query.slice(0, 60)}`)
      }
    }
  } finally {
    fs.rmSync(parentDir, { recursive: true, force: true })
  }
  console.log(`\nscore ${passed}/${total} (model ${options.model}, judge ${options.judge}, ${options.baseline ? "baseline" : "with skills"})`)
}

if (require.main === module) main()
