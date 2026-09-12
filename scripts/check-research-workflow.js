#!/usr/bin/env node

// Verify research workflows retain their distinct routing, evidence, contradiction,
// continuation, and downstream-handoff contracts without pretending to execute a
// live external investigation in a deterministic repository check.

const fs = require("node:fs")
const path = require("node:path")
const { cascadeRoute, loadSkills } = require("../core/router-core")

const REPO_ROOT = path.resolve(__dirname, "..")
const SKILLS_PATH = path.join(REPO_ROOT, "skills")
let failures = 0

// Report each contract assertion while preserving later failures for one CI result.
function check(label, condition) {
  if (condition) {
    console.log(`OK: ${label}`)
    return
  }
  failures += 1
  console.error(`FAIL: ${label}`)
}

// Read a canonical workflow asset so assertions verify shipped guidance, not a copy.
function readAsset(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
}

// Check the deep workflow contains each behavior required for autonomous research.
function checkDeepResearchContract(content, template) {
  for (const phrase of [
    "research brief", "dynamic plan", "local implementation", "upstream", "history",
    "official standards/docs", "contradict", "HYPOTHESIS", "CONFIRMED", "protocol",
    "ASK_WORKFLOW_PASS phase=RESEARCH", "Implementation Handoff", "continuation",
  ]) {
    check(`deep-research covers ${phrase}`, content.toLowerCase().includes(phrase.toLowerCase())
      || template.toLowerCase().includes(phrase.toLowerCase()))
  }
}

// Run route and static contract checks that represent the public research scenarios.
async function main() {
  const skills = await loadSkills([SKILLS_PATH])
  const research = readAsset("skills/ask-research/SKILL.md")
  const deepResearch = readAsset("skills/ask-deep-research/SKILL.md")
  const template = readAsset("skills/ask-deep-research/research-report-template.md")
  const researchCommand = readAsset("commands/research.md")
  const deepResearchCommand = readAsset("commands/deep-research.md")

  check("simple research routes to research", cascadeRoute("research this API behavior", skills, {}).matchedSkills[0]?.name === "research")
  check("complex investigation routes to deep-research", cascadeRoute("compare competing implementations and investigate historical changes", skills, {}).matchedSkills[0]?.name === "deep-research")
  check("exhaustive research routes to deep-research", cascadeRoute("perform exhaustive research", skills, {}).matchedSkills[0]?.name === "deep-research")
  check("protocol and upstream acceptance scenario routes to deep-research", cascadeRoute(
    "perform an exhaustive investigation of open protocol issues and compare against upstream",
    skills,
    {},
  ).matchedSkills[0]?.name === "deep-research")
  check("ordinary research stays bounded", research.includes("bounded") && research.includes("external sources"))
  check("ordinary research yields a portable handoff", research.includes("Handoff: next owner"))
  check("deep research starts from local evidence", deepResearch.includes("Inspect local code, tests, fixtures"))
  check("deep research requires external primary sources", deepResearch.includes("official standards/docs"))
  check("deep research requires contradiction analysis", deepResearch.includes("disconfirming evidence") && template.includes("Contradictions"))
  check("deep research preserves evidence gaps", deepResearch.includes("evidence-blocked") && template.includes("Next Evidence Needed"))
  check("deep research yields a development handoff", template.includes("Implementation Handoff") && deepResearch.includes("develop"))
  check("deep research supports continuation", deepResearch.includes("resumes rather than restarts") && template.includes("Continuation State"))
  check("research command loads research", researchCommand.includes("`research` skill"))
  check("deep-research command loads deep-research", deepResearchCommand.includes("`deep-research` skill"))
  checkDeepResearchContract(deepResearch, template)

  if (failures > 0) process.exitCode = 1
  else console.log("Research workflow checks passed.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
