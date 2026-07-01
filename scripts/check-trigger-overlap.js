#!/usr/bin/env node
// Verify that no trigger string is shared across skills and that the
// baseline routing produces the expected skill for a fixed set of
// canonical queries. Exits non-zero on any failure.

const path = require("node:path")
const {
  applyBaselineRouting,
  findMatches,
  loadSkills,
} = require("../core/router-core")

const SKILLS_PATH = path.resolve(__dirname, "..", "skills")

// Each entry asserts that the biased top match for the query is exactly
// the expected skill. Use null to assert "no match expected".
const ROUTING_CASES = [
  ["ga door", "nebu-kaizen"],
  ["werk door", "nebu-kaizen"],
  ["autopilot", "nebu-kaizen"],
  ["start coding", "nebu-kaizen"],
  ["continue without waiting", "nebu-kaizen"],
  ["keep going", "nebu-kaizen"],
  ["start by clarifying", "nebu-kickoff"],
  ["klaar", "nebu-verification"],
  ["verifiëren", "nebu-verification"],
  ["refactor dit", "nebu-refactoring"],
  ["fix this bug", "nebu-debugging"],
  ["plan dit werk", "nebu-planning"],
  ["start planning", "nebu-planning"],
  ["implementeer dit", "nebu-implementation"],
  ["start implementing", "nebu-implementation"],
  ["bouwen", "nebu-kickoff"],
  ["brainstormen", "nebu-brainstorming"],
  ["create issue", "nebu-github-issues"],
  ["skill gap", "nebu-skill-improvement"],
  ["review deze wijziging", "nebu-code-review"],
  ["start reviewing", "nebu-code-review"],
  ["debuggen", "nebu-debugging"],
  ["start debugging", "nebu-debugging"],
  ["refactoren", "nebu-refactoring"],
  ["opschonen", "nebu-refactoring"],
  ["afronden", "nebu-workspace-wrapup"],
  ["nakijken", "nebu-code-review"],
]

// Detect any trigger string that appears in more than one skill.
function findDuplicateTriggers(skills) {
  const owners = new Map()
  for (const skill of skills) {
    for (const trigger of skill.triggers) {
      const key = trigger.toLowerCase().trim()
      if (!key) continue
      if (!owners.has(key)) owners.set(key, [])
      owners.get(key).push(skill.name)
    }
  }
  return [...owners.entries()].filter(([, list]) => list.length > 1)
}

// Run the routing checks against the full chain used by the plugin.
function runRoutingChecks(skills) {
  const failures = []
  for (const [query, expected] of ROUTING_CASES) {
    const raw = findMatches(query, skills, 4)
    const biased = applyBaselineRouting(query, raw, skills, 4)
    const winner = biased[0]?.name
    if (expected === null) {
      if (winner) {
        failures.push({ query, expected, winner, reason: "expected no match" })
      }
      continue
    }
    if (winner !== expected) {
      failures.push({ query, expected, winner, reason: "wrong winner" })
    }
  }
  return failures
}

async function main() {
  const skills = await loadSkills([SKILLS_PATH])
  const duplicates = findDuplicateTriggers(skills)
  const failures = runRoutingChecks(skills)

  let hasError = false

  if (duplicates.length > 0) {
    hasError = true
    console.error("Duplicate triggers found across skills:")
    for (const [trigger, owners] of duplicates) {
      console.error(`  - ${JSON.stringify(trigger)} -> ${owners.join(", ")}`)
    }
  }

  if (failures.length > 0) {
    hasError = true
    console.error("Routing check failures:")
    for (const { query, expected, winner, reason } of failures) {
      const expectedLabel = expected ?? "(no match)"
      console.error(
        `  - ${JSON.stringify(query)}: expected ${expectedLabel}, got ${winner ?? "(none)"} (${reason})`,
      )
    }
  }

  const defaults = skills.filter((skill) => skill.isDefault).map((skill) => skill.name)
  if (defaults.length !== 1) {
    hasError = true
    console.error(`Expected exactly one default skill, found ${defaults.length}: ${defaults.join(", ") || "(none)"}`)
  }

  if (hasError) {
    process.exitCode = 1
    return
  }

  console.log(
    `OK: ${skills.length} skills loaded, ${ROUTING_CASES.length} routing checks passed, default = ${defaults[0]}, no duplicate triggers.`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
