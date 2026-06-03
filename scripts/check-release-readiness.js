#!/usr/bin/env node

const childProcess = require("node:child_process")
const fs = require("node:fs/promises")
const path = require("node:path")
const util = require("node:util")

const REPO_ROOT = path.resolve(__dirname, "..")
const VERSION_PATH = path.join(REPO_ROOT, "VERSION")
const CHANGELOG_PATH = path.join(REPO_ROOT, "CHANGELOG.md")
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/
const RELEASE_SENSITIVE_PATH_PATTERNS = [
  /^core\//,
  /^plugins\//,
  /^skills\//,
  /^scripts\/bootstrap-.*\.(?:sh|ps1)$/,
  /^scripts\/install-.*\.(?:sh|ps1)$/,
  /^scripts\/update-.*\.(?:sh|ps1)$/,
  /^scripts\/release-helpers\.(?:sh|ps1)$/,
]
const execFile = util.promisify(childProcess.execFile)

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

// Run one git command from the repo root and return trimmed stdout.
async function readGitStdout(args) {
  const { stdout } = await execFile("git", ["-C", REPO_ROOT, ...args])
  return stdout.trim()
}

// Parse one SemVer string into comparable numeric parts.
function parseSemVer(version) {
  return version.split(".").map((part) => Number(part))
}

// Compare two SemVer strings and return sort-style ordering.
function compareSemVer(leftVersion, rightVersion) {
  const leftParts = parseSemVer(leftVersion)
  const rightParts = parseSemVer(rightVersion)

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] > rightParts[index]) {
      return 1
    }

    if (leftParts[index] < rightParts[index]) {
      return -1
    }
  }

  return 0
}

// Read the newest stable tag version from the local repo when one exists.
async function readLatestStableVersion() {
  const output = await readGitStdout(["tag", "--sort=-version:refname", "--list", "v[0-9]*.[0-9]*.[0-9]*"])
  const [latestTag = ""] = output.split(/\r?\n/).filter(Boolean)

  if (!latestTag) {
    return null
  }

  return latestTag.replace(/^v/, "")
}

// Read changed paths since the current stable tag for release-sensitive checks.
async function readChangedPathsSinceVersion(version) {
  if (!version) {
    return []
  }

  const output = await readGitStdout(["diff", "--name-only", `v${version}..HEAD`])

  if (!output) {
    return []
  }

  return output.split(/\r?\n/).filter(Boolean)
}

// Detect whether one changed path affects shipped install or managed assets.
function isReleaseSensitivePath(filePath) {
  return RELEASE_SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(filePath))
}

// Validate the root VERSION file against simple SemVer.
function validateVersion(version) {
  const errors = []

  if (!SEMVER_PATTERN.test(version)) {
    errors.push(`VERSION must contain SemVer like 0.1.0. Received: ${version}`)
  }

  return errors
}

// Validate that shipped changes moved VERSION ahead of the latest stable tag.
function validateVersionAheadOfLatestStable(version, latestStableVersion, changedPaths) {
  const errors = []

  if (!latestStableVersion) {
    return errors
  }

  const releaseSensitivePaths = changedPaths.filter(isReleaseSensitivePath)

  if (releaseSensitivePaths.length === 0) {
    return errors
  }

  if (compareSemVer(version, latestStableVersion) <= 0) {
    const samplePaths = releaseSensitivePaths.slice(0, 5).join(", ")
    const suffix = releaseSensitivePaths.length > 5 ? ", ..." : ""
    errors.push(
      `VERSION must be bumped above latest stable ${latestStableVersion} when shipped files changed since v${latestStableVersion}: ${samplePaths}${suffix}`,
    )
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
  const [version, changelog, latestStableVersion] = await Promise.all([
    readTrimmedFile(VERSION_PATH),
    readTrimmedFile(CHANGELOG_PATH),
    readLatestStableVersion(),
  ])
  const changedPaths = await readChangedPathsSinceVersion(latestStableVersion)
  const errors = [
    ...validateVersion(version),
    ...validateVersionAheadOfLatestStable(version, latestStableVersion, changedPaths),
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
