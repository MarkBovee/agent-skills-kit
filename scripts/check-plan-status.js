#!/usr/bin/env node
// Verify the plan status parser at its public boundary: frontmatter, checkboxes, gate ledger, and the no-frontmatter fallback.

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
expect(plan.status === "active" && plan.branch === "feat/x" && plan.base === "abc1234", "frontmatter is read, trailing comment stripped")
expect(plan.done === 2 && plan.total === 4, "checkboxes count at any depth")
expect(plan.nextItem === "2. second **item**", "next item is the first open checkbox")
expect(plan.gates.length === 1 && plan.gates[0].result === "PASS" && plan.gates[0].diff === "abc1234", "gate ledger rows skip header and separator")
expect(activePlanLine({ path: "plans/x.md", ...plan }).startsWith("Active plan: plans/x.md — 2/4 done, next: 2."), "active plan line carries counts and next item")

const bare = parsePlan("# Plan\n- [ ] only\n")
expect(bare.status === "unknown" && bare.total === 1 && bare.gates.length === 0, "a plan without frontmatter has status unknown")
expect(parsePlan("---\nstatus: done\n---\n").status === "done", "status done is recognised")

if (failures.length > 0) {
  console.error(`\n${failures.length} plan-status check(s) failed.`)
  process.exit(1)
}
console.log("\nPlan status checks passed.")
