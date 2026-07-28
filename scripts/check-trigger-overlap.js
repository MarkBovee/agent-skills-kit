#!/usr/bin/env node
// Verify that no trigger string is shared across skills and that the
// cascade routing produces the expected skill for a fixed set of
// canonical queries. Exits non-zero on any failure.

const path = require("node:path")
const {
  cascadeRoute,
  loadSkills,
} = require("../core/router-core")

const SKILLS_PATH = path.resolve(__dirname, "..", "skills")

// Each entry asserts the cascade top match for the query is the expected skill.
const ROUTING_CASES = [
  // Start — intake
  ["brainstorm", "intake"],
  ["plan dit werk", "intake"],
  ["start planning", "intake"],
  ["what should we build", "intake"],
  ["ambiguous scope", "intake"],
  // Execute — debugging
  ["fix this bug", "debugging"],
  ["start debugging", "debugging"],
  ["debuggen", "debugging"],
  ["crash in production", "debugging"],
  // Validate — code-review
  ["review my pr", "code-review"],
  ["check this diff", "code-review"],
  ["code review deze code", "code-review"],
  // Validate — verification
  ["done with task", "verification"],
  ["klaar", "verification"],
  ["verifiëren", "verification"],
  ["verify this works", "verification"],
  ["ready to handoff", "verification"],
  ["wrap up", "verification"],
  // Improve — refactor
  ["refactor this", "improve"],
  ["audit codebase", "improve"],
  ["refactoren", "improve"],
  ["opschonen", "improve"],
  ["tech debt audit", "improve"],
  // Improve — session-review
  ["retrospective", "session-review"],
  ["create issue", "session-review"],
  ["retro", "session-review"],
  ["file an issue", "session-review"],
  // Coordinate — agent-workflows
  ["multi-agent coordination", "agent-workflows"],
  ["parallel work", "agent-workflows"],
  // Coordinate — write-skill
  ["create skill", "write-skill"],
  ["skill gap", "write-skill"],
  ["write skills", "write-skill"],
  // Product — ui-ux
  ["design a ui", "ui-ux"],
  ["redesign this page", "ui-ux"],
  ["polish the frontend", "ui-ux"],
  // Default
  ["hello world", "develop"],
  ["bump version", "develop"],
  ["continue working", "develop"],
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

// Run cascade routing checks.
function runRoutingChecks(skills) {
  const failures = []
  for (const [query, expected] of ROUTING_CASES) {
    const { matchedSkills } = cascadeRoute(query, skills, {})
    const winner = matchedSkills[0]?.name
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
