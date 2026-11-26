#!/usr/bin/env node
// Verify the plan status parser at its public boundary: frontmatter, checkboxes, gate ledger, and the no-frontmatter fallback.

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { parsePlan, activePlanLine, listPlans, renderOverview } = require("./plan-status")

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
expect(plan.status === "active" && plan.branch === "feat/x" && plan.base === "abc1234", "frontmatter is read, trailing comment stripped")
expect(plan.done === 2 && plan.total === 4, "checkboxes count at any depth")
expect(plan.nextItem === "2. second **item**", "next item is the first open checkbox")
expect(plan.gates.length === 1 && plan.gates[0].result === "PASS" && plan.gates[0].diff === "abc1234", "gate ledger rows skip header and separator")
expect(activePlanLine({ path: "plans/x.md", ...plan }).startsWith("Active plan: plans/x.md — 2/4 done, next: 2."), "active plan line carries counts and next item")

const bare = parsePlan("# Plan\n- [ ] only\n")
expect(bare.status === "unknown" && bare.total === 1 && bare.gates.length === 0, "a plan without frontmatter has status unknown")
expect(parsePlan("---\nstatus: done\n---\n").status === "done", "status done is recognised")

// A repository that keeps its plans outside plans/ points the overview there through .ask.json.
const repo = fs.mkdtempSync(path.join(os.tmpdir(), "ask-plans-"))
try {
  fs.mkdirSync(path.join(repo, "docs"))
  fs.writeFileSync(path.join(repo, "docs", "auth-plan.md"), "---\nstatus: active\n---\n- [ ] 1. first\n")
  fs.writeFileSync(path.join(repo, "docs", "readme.md"), "# not a plan\n")
  expect(listPlans(repo).length === 0 && renderOverview(repo, []).includes("plans/*.md") && renderOverview(repo, []).includes(".ask.json"), "an empty overview names where it looked and how to configure it")
  fs.writeFileSync(path.join(repo, ".ask.json"), JSON.stringify({ plans: ["docs/*-plan.md", "../*.md"] }))
  const plans = listPlans(repo)
  expect(plans.length === 1 && plans[0].path === "docs/auth-plan.md" && plans[0].status === "active", "configured globs find a plan outside plans/ and ignore unsafe globs")
} finally {
  fs.rmSync(repo, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error(`\n${failures.length} plan-status check(s) failed.`)
  process.exit(1)
}
console.log("\nPlan status checks passed.")
