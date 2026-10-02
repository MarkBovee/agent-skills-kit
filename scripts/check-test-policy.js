#!/usr/bin/env node
// Verify the workflow keeps a proportional test budget: no unconditional TDD or per-fix regression
// test mandates, a documented budget per risk class, and a matching router-core policy.

const fs = require("node:fs")
const path = require("node:path")

const { TEST_POLICY, WORKFLOW_RISK_LEVELS } = require("../core/router-core")

const REPO_ROOT = path.resolve(__dirname, "..")
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

// Read a repository file as text.
function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
}

const verification = read("skills/ask-verification/SKILL.md")
const develop = read("skills/ask-develop/SKILL.md")
const debugging = read("skills/ask-debugging/SKILL.md")
const spec = read("skills/ask-spec/SKILL.md")
const agentWorkflows = read("skills/ask-agent-workflows/SKILL.md")

expect(verification.includes("## Test budget"), "verification documents a Test budget section")
for (const risk of WORKFLOW_RISK_LEVELS) {
  expect(Boolean(TEST_POLICY[risk]), `router-core TEST_POLICY covers risk ${risk}`)
  expect(new RegExp(`\\|\\s*${risk}\\s*\\|`).test(verification), `verification budget table lists ${risk}`)
}
expect(!develop.includes("RED → GREEN → REFACTOR"), "develop no longer mandates RED → GREEN → REFACTOR")
expect(develop.includes("test budget"), "develop defers to the test budget")
expect(!verification.includes("A regression test guards the original symptom"), "quality floor no longer demands a regression test for every change")
expect(debugging.includes("only when the symptom is cheap to reproduce"), "debugging limits regression tests to cheap reproductions")
expect(spec.includes("one test per acceptance criterion"), "spec plans one test per acceptance criterion")
expect(agentWorkflows.includes("within the test budget"), "audit finding loop stays within the test budget")

if (failures.length > 0) {
  console.error(`\n${failures.length} test-policy check(s) failed.`)
  process.exitCode = 1
} else {
  console.log("\nTest policy checks passed.")
}
