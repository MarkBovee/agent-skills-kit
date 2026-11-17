#!/usr/bin/env node
// Verify the plan status parser at its public boundary: frontmatter, checkboxes, gate ledger, and the no-frontmatter fallback.

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { parsePlan, activePlanLine } = require("./plan-status")

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

const sample = [
  "---",
  "status: active   # active | done | parked",
  "branch: feat/x",
  "base: abc1234",
  "---",
  "# Plan",
  "- [x] 1. first",
  "  - [ ] 2. second **item**",
  "- [ ] 3. third",
  "",
  "## Gate ledger",
  "",
  "| Gate | Result | By | Diff |",
  "|---|---|---|---|",
  "| review | PASS | independent | abc1234 |",
  "",
  "## Other",
  "- [x] not counted? yes counted",
].join("\n")

const plan = parsePlan(sample)
expect(plan.title === "Plan" && parsePlan("# Plan: Ship it\n").title === "Ship it" && parsePlan("- [ ] x\n").title === "", "title is the first # heading without a Plan: label")
expect(plan.status === "active" && plan.branch === "feat/x" && plan.base === "abc1234", "frontmatter is read, trailing comment stripped")
expect(plan.done === 2 && plan.total === 4, "checkboxes count at any depth")
expect(plan.nextItem === "2. second **item**", "next item is the first open checkbox")
expect(plan.gates.length === 1 && plan.gates[0].result === "PASS" && plan.gates[0].diff === "abc1234", "gate ledger rows skip header and separator")
expect(activePlanLine({ path: "plans/x.md", ...plan }).startsWith("Active plan: plans/x.md — 2/4 done, next: 2."), "active plan line carries counts and next item")

const bare = parsePlan("# Plan\n- [ ] only\n")
expect(bare.status === "unknown" && bare.total === 1 && bare.gates.length === 0, "a plan without frontmatter has status unknown")
expect(parsePlan("---\nstatus: done\n---\n").status === "done", "status done is recognised")

const sliced = parsePlan("# Plan\n- [x] loose\n## Checklist\n### Slice 1\n- [x] a\n- [ ] b\n### Slice 2\n- [ ] c\n## Gate ledger\n")
expect(JSON.stringify(sliced.groups) === JSON.stringify([
  { title: "", done: 1, total: 1 },
  { title: "Slice 1", done: 1, total: 2 },
  { title: "Slice 2", done: 0, total: 1 },
]), "groups count items per nearest heading, headings without items are left out")

// Run the CLI on a fixture directory and return its stdout.
function runCli(args) {
  return spawnSync(process.execPath, [path.join(__dirname, "plan-status.js"), ...args], { encoding: "utf8" }).stdout
}

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "ask-plan-status-"))
try {
  fs.mkdirSync(path.join(fixtureDir, "plans"))
  fs.writeFileSync(path.join(fixtureDir, "plans", "x.md"), "---\nstatus: active\n---\n### Slice 1\n- [x] a\n- [ ] **Title.** long text\n")
  const text = runCli([fixtureDir])
  expect(text === "plans/x.md [active] 1/2 done\n  next: Title.\n  last gate: none recorded\n  drift: base unknown\n", "text output without --json is unchanged")
  const parsed = JSON.parse(runCli(["--json", fixtureDir]))
  const [jsonPlan] = parsed.plans
  expect(jsonPlan.path === "plans/x.md" && jsonPlan.done === 1 && jsonPlan.total === 2, "--json carries path and counts")
  expect(jsonPlan.nextItem === "**Title.** long text" && jsonPlan.drift === "base unknown", "--json keeps the raw next item and adds drift")
  expect(jsonPlan.groups.length === 1 && jsonPlan.groups[0].title === "Slice 1", "--json carries the slice groups")
} finally {
  fs.rmSync(fixtureDir, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error(`\n${failures.length} plan-status check(s) failed.`)
  process.exit(1)
}
console.log("\nPlan status checks passed.")
