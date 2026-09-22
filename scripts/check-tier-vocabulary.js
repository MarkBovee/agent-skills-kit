#!/usr/bin/env node

const fs = require("node:fs/promises")
const path = require("node:path")

const REPO_ROOT = path.resolve(__dirname, "..")
const GUIDANCE_ROOTS = [
  "skills",
  "rules",
  ".github/skills",
  ".dsh/skills",
]

// Tier tokens that reference the removed `heavy` execution tier or the removed
// `high` agent tier. Kept narrow to avoid ordinary English: `heavy` only counts
// as a tier when paired with tier vocabulary, and `high` only as an agent-tier
// jump, never as a standalone word.
const STALE_TIER_PATTERNS = [
  /\blight\/standard\/heavy\b/i,
  /\bheavy\s+(?:tier|pass|run|agent)\b/i,
  /(?:heavy)\s*(?:→|->)\s*high\b/i,
  /\b(?:to\s+)?high\s+(?:or\s+)?xhigh\b/i,
]

// Recursively collect markdown guidance files from one exported or canonical root.
async function collectMarkdownFiles(relativeRoot) {
  const absoluteRoot = path.join(REPO_ROOT, relativeRoot)
  const files = []

  // Execute the walk helper.
  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(entryPath)
        continue
      }
      if (entry.isFile() && entry.name.endsWith(".md")) files.push(entryPath)
    }
  }

  await walk(absoluteRoot)
  return files
}

// Reject stale execution-tier (`heavy`) and agent-tier (`high`) tokens in the
// shipped guidance, which now only recognizes light/standard/deep and
// mini/default/xhigh.
async function checkTierVocabulary() {
  const files = (await Promise.all(GUIDANCE_ROOTS.map(collectMarkdownFiles))).flat()
  const violations = []

  for (const filePath of files) {
    const lines = (await fs.readFile(filePath, "utf8")).split(/\r?\n/)
    // Visit every item in the local collection.
    lines.forEach((line, index) => {
      // Test whether any item satisfies the local predicate.
      if (STALE_TIER_PATTERNS.some((pattern) => pattern.test(line))) {
        violations.push(`${path.relative(REPO_ROOT, filePath)}:${index + 1}: ${line.trim()}`)
      }
    })
  }

  if (violations.length > 0) {
    throw new Error(`Stale tier vocabulary found:\n${violations.join("\n")}`)
  }
}

// Run the tier-vocabulary guard and emit a concise CI result.
checkTierVocabulary()
  // Handle the fulfilled asynchronous result.
  .then(() => console.log("Tier vocabulary is limited to light/standard/deep and mini/default/xhigh."))
  // Handle the local asynchronous failure.
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })