#!/usr/bin/env node

const fs = require("node:fs/promises")
const path = require("node:path")

const REPO_ROOT = path.resolve(__dirname, "..")
const VERSION_PATH = path.join(REPO_ROOT, "VERSION")
const CHANGELOG_PATH = path.join(REPO_ROOT, "CHANGELOG.md")
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/

// Parse CLI flags for local checks versus release-candidate checks.
function parseOptions(argv) {
  return {
    requireVersionEntry: argv.includes("--require-version-entry"),
  }
}

// Read one UTF-8 file and trim outer whitespace for stable comparisons.
async function readTrimmedFile(filePath) {
  const content = await fs.readFile(filePath, "utf8")
  return content.trim()
}

// Validate the root VERSION file against simple SemVer.
function validateVersion(version) {
  const errors = []

  if (!SEMVER_PATTERN.test(version)) {
    errors.push(`VERSION must contain SemVer like 0.1.0. Received: ${version}`)
  }

  return errors
}

// Validate that the changelog contains required release-management sections.
function validateChangelog(changelog, version, requireVersionEntry) {
  const errors = []

  if (!changelog.includes("## Unreleased")) {
    errors.push("CHANGELOG.md must include a ## Unreleased section.")
  }

  if (requireVersionEntry && !changelog.includes(`## [${version}] - `)) {
    errors.push(`CHANGELOG.md must include a release entry for ${version} when --require-version-entry is used.`)
  }

  return errors
}

// Run release-readiness checks and report every failure together.
async function main() {
  const options = parseOptions(process.argv.slice(2))
  const version = await readTrimmedFile(VERSION_PATH)
  const changelog = await readTrimmedFile(CHANGELOG_PATH)
  const errors = [
    ...validateVersion(version),
    ...validateChangelog(changelog, version, options.requireVersionEntry),
  ]

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`- ${error}`)
    }

    process.exitCode = 1
    return
  }

  console.log(`Release readiness OK for ${version}.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
