#!/usr/bin/env node

const fs = require("node:fs/promises")
const path = require("node:path")

const REPO_ROOT = path.resolve(__dirname, "..")
const GUIDANCE_ROOTS = [
  "skills",
  "rules",
  ".github/skills",
  ".claude/skills",
  ".dsh/skills",
]
const MODEL_SPECIFIC_PATTERN = /\b(?:chatgpt|grok|gemini|deepseek|anthropic|openai|gpt(?:[- ]?\d+(?:\.\d+)?)?|model-specific|provider-specific)\b/i

// Recursively collect markdown guidance files from one exported or canonical root.
async function collectMarkdownFiles(relativeRoot) {
  const absoluteRoot = path.join(REPO_ROOT, relativeRoot)
  const files = []

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

// Reject model- or provider-specific names in shipped workflow guidance.
async function checkModelAgnosticGuidance() {
  const files = (await Promise.all(GUIDANCE_ROOTS.map(collectMarkdownFiles))).flat()
  const violations = []

  for (const filePath of files) {
    const lines = (await fs.readFile(filePath, "utf8")).split(/\r?\n/)
    lines.forEach((line, index) => {
      if (MODEL_SPECIFIC_PATTERN.test(line)) {
        violations.push(`${path.relative(REPO_ROOT, filePath)}:${index + 1}: ${line.trim()}`)
      }
    })
  }

  if (violations.length > 0) {
    throw new Error(`Model-specific guidance found:\n${violations.join("\n")}`)
  }
}

// Run the compatibility guard and emit a concise CI result.
checkModelAgnosticGuidance()
  .then(() => console.log("Guidance is model- and provider-agnostic."))
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
