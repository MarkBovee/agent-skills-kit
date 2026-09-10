#!/usr/bin/env node

const fs = require("node:fs/promises")
const path = require("node:path")

const REPO_ROOT = path.resolve(__dirname, "..")

// Read a repository file for policy assertions.
async function readRepoFile(relativePath) {
  return fs.readFile(path.join(REPO_ROOT, relativePath), "utf8")
}

// Fail with a useful message when required policy text drifts or disappears.
function assertIncludes(content, expected, sourcePath) {
  if (!content.includes(expected)) {
    throw new Error(`${sourcePath} is missing required guidance: ${expected}`)
  }
}

// Verify shared policy and maintainer-facing workflow applications remain aligned.
async function checkEvidenceAwareCommunication() {
  const sharedGuidance = await readRepoFile("rules/agent-skills-kit.md")
  const inboxSkill = await readRepoFile("skills/ask-gh-inbox/SKILL.md")
  const sessionReviewSkill = await readRepoFile("skills/ask-session-review/SKILL.md")

  for (const phrase of [
    "## Evidence-aware communication",
    "Separate facts already proven from information still unknown.",
    "Never request evidence that is already available.",
    "report → investigation → evidence → implementation → release → verification",
    "switch from diagnosis mode to verification mode",
    "smallest fresh evidence",
  ]) {
    assertIncludes(sharedGuidance, phrase, "rules/agent-skills-kit.md")
  }

  for (const phrase of [
    "## Evidence-aware communication",
    "Read the complete issue, all comments, linked attachments, relevant fixtures, and recent implementation or release history.",
    "Do not request an existing dump, log, or reproduction again.",
    "request a fresh integration discovery capture from the new release",
  ]) {
    assertIncludes(inboxSkill, phrase, "skills/ask-gh-inbox/SKILL.md")
  }

  for (const phrase of [
    "## Evidence-aware issue communication",
    "Distinguish observed evidence, conclusions, and information still needed.",
    "Prefer the smallest concrete next step over a broad diagnostic checklist.",
  ]) {
    assertIncludes(sessionReviewSkill, phrase, "skills/ask-session-review/SKILL.md")
  }
}

// Run the policy regression check and report a concise success signal for CI.
checkEvidenceAwareCommunication()
  .then(() => console.log("Evidence-aware communication guidance is present and applied."))
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
