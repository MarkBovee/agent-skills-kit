#!/usr/bin/env node
// Checks every skill against Anthropic's skill authoring best practices: bounded SKILL.md size,
// third-person descriptions, one-level self-contained references, tables of contents for long
// reference files, and forward-slash paths.

const fs = require("node:fs")
const path = require("node:path")

const REPO_ROOT = path.resolve(__dirname, "..")
const SKILLS_DIR = path.join(REPO_ROOT, "skills")
const MAX_BODY_LINES = 500
const TOC_THRESHOLD_LINES = 100
const FIRST_PERSON = /\b(?:I|I'll|I can|you can|you will|we)\b/
const WINDOWS_PATH = /\b(?:scripts|references|reference|data)\\[\w.-]+/
const errors = []

// Record one violation for a repo-relative file.
function fail(file, message) {
  errors.push(`${path.relative(REPO_ROOT, file)}: ${message}`)
}

// List markdown files directly under a skill's references directory.
function referenceFiles(skillDir) {
  const dir = path.join(skillDir, "references")
  if (!fs.existsSync(dir)) return []
  const files = []
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith(".md")) files.push(path.join(dir, name))
  }
  return files
}

// Validate the description: quoted third-person sentence naming what and when.
function checkDescription(file, raw) {
  const match = raw.match(/^description:\s*(.*)$/m)
  if (!match) return fail(file, "missing description")
  const description = match[1]
  if (FIRST_PERSON.test(description)) fail(file, "description must be third person")
  if (!/\bUse\b/.test(description)) fail(file, 'description must say when to use the skill ("Use when/for/before/after ...")')
}

// Validate a SKILL.md body: size and Windows-style paths.
function checkSkillFile(file, raw) {
  const lines = raw.split("\n").length
  if (lines > MAX_BODY_LINES) fail(file, `${lines} lines exceeds ${MAX_BODY_LINES}`)
  if (WINDOWS_PATH.test(raw)) fail(file, "use forward slashes in paths")
  if (/\]\(\.\.\/ask-/.test(raw)) fail(file, "skills must be self-contained: no links into other skills")
  checkDescription(file, raw)
}

// Validate a reference file: contents list when long, no nested reference chains, no cross-skill links.
function checkReferenceFile(file, raw) {
  const lines = raw.split("\n").length
  if (lines > TOC_THRESHOLD_LINES && !/^## Contents/m.test(raw)) fail(file, `over ${TOC_THRESHOLD_LINES} lines needs a "## Contents" section`)
  if (/\]\((?:\.\.\/|references\/)[^)]*\.md/.test(raw)) fail(file, "references must link one level deep from SKILL.md, not from each other")
  if (WINDOWS_PATH.test(raw)) fail(file, "use forward slashes in paths")
}

for (const name of fs.readdirSync(SKILLS_DIR)) {
  const skillDir = path.join(SKILLS_DIR, name)
  const skillFile = path.join(skillDir, "SKILL.md")
  if (!fs.existsSync(skillFile)) continue
  checkSkillFile(skillFile, fs.readFileSync(skillFile, "utf8"))
  for (const file of referenceFiles(skillDir)) checkReferenceFile(file, fs.readFileSync(file, "utf8"))
}

if (errors.length > 0) {
  console.error(errors.join("\n"))
  process.exit(1)
}
console.log("skill best-practices check passed")
