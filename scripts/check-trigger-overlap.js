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
  // Research
  ["research this API behavior", "research"],
  ["compare sources for this technology", "research"],
  ["perform an exhaustive research of protocol behavior", "deep-research"],
  ["deep research: compare against upstream", "deep-research"],
  ["investigate all open issues comprehensively", "deep-research"],
  ["complex contested high-stakes research", "deep-research"],
  ["research protocol behavior exhaustively", "deep-research"],
  ["compare local and upstream implementations", "deep-research"],
  ["debug a protocol behavior regression", "debugging"],
  ["investigate current state of production crash", "debugging"],
  ["deep research this production crash", "debugging"],
  ["audit protocol behavior", "improve"],
  ["audit open issues comprehensively", "improve"],
  ["research this protocol behavior", "research"],
  ["perform multi-source research across source code and standards", "deep-research"],
  ["run multi-source research with conflicting evidence", "deep-research"],
  ["deep research migration", "deep-research"],
  ["complex contested high-stakes question", "deep-research"],
  ["investigate this complex question", "deep-research"],
  ["research this complex compatibility issue", "deep-research"],
  ["research this compatibility issue using multiple sources, local code, upstream docs, and history", "deep-research"],
  // Start — spec
  ["specify requirements", "spec"],
  ["design brief", "spec"],
  ["requirements traceability", "spec"],
  ["handover package", "spec"],
  ["spec before build", "spec"],
  // Start — intake
  ["brainstorm", "intake"],
  ["plan dit werk", "intake"],
  ["start planning", "intake"],
  ["what should we build", "intake"],
  ["ambiguous scope", "intake"],
  ["multiple issues with maximum compatibility", "intake"],
  ["plan an end-to-end implementation", "intake"],
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
  // Product — design
  ["design a ui", "design"],
  ["redesign this page", "design"],
  ["polish the frontend", "design"],
  // Product — text-writing
  ["make this sound human", "text-writing"],
  ["write a tweet", "text-writing"],
  ["draft email", "text-writing"],
  ["anti-slop", "text-writing"],
  // Operate — observability
  ["add metrics to the payment service", "observability"],
  ["set up monitoring alerts", "observability"],
  ["instrument this feature", "observability"],
  ["add logging to the handler", "observability"],
  ["how do we observe our service", "observability"],
  ["alert rule for high p95", "observability"],
  // Operate — observability: generic operational terms must NOT hijack the route
  ["rename the metrics variable", "develop"],
  ["add a metrics column to the report", "develop"],
  ["watch this service", "develop"],
  ["tracing the user journey", "develop"],
  ["dashboard for the store", "develop"],
  ["logging library choice", "develop"],
  ["telemetry consent checkbox", "develop"],
  ["alert the user with a toast", "develop"],
  ["plan our observability", "intake"],
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
