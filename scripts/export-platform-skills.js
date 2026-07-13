#!/usr/bin/env node

const fs = require("node:fs/promises")
const path = require("node:path")

const { parseBooleanField, parseFrontmatter, toSingleLine } = require("../core/router-core")

const REPO_ROOT = path.resolve(__dirname, "..")
const SOURCE_SKILLS_DIR = path.join(REPO_ROOT, "skills")
const COPILOT_SKILLS_DIR = path.join(REPO_ROOT, ".github", "skills")
const CLAUDE_SKILLS_DIR = path.join(REPO_ROOT, ".claude", "skills")
const COPILOT_INSTRUCTIONS_PATH = path.join(REPO_ROOT, ".github", "copilot-instructions.md")
const CLAUDE_MD_PATH = path.join(REPO_ROOT, "CLAUDE.md")

const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/

// Render one scalar as YAML while keeping booleans unquoted.
function yamlScalar(value) {
  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }

  const text = String(value)
  return JSON.stringify(text)
}

// Build a small YAML frontmatter block from ordered key-value entries.
function renderFrontmatter(entries) {
  const lines = ["---"]

  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === "") continue

    if (Array.isArray(value)) {
      if (value.length === 0) continue
      lines.push(`${key}:`)
      for (const item of value) {
        lines.push(`  - ${yamlScalar(item)}`)
      }
      continue
    }

    lines.push(`${key}: ${yamlScalar(value)}`)
  }

  lines.push("---", "")
  return lines.join("\n")
}

// Remove the source frontmatter before writing platform-specific frontmatter.
function stripFrontmatter(content) {
  return content.replace(FRONTMATTER_PATTERN, "")
}

// Combine description and triggers into one bounded portable discovery string.
function buildPortableDescription(description, triggers, maxLength) {
  const triggerText = triggers.length > 0 ? ` Common triggers: ${triggers.join(", ")}.` : ""
  const combined = `${description}${triggerText}`.trim()
  return combined.length <= maxLength ? combined : `${combined.slice(0, maxLength - 3).trim()}...`
}

// Wrap a generated frontmatter block around a skill body.
function buildSkillDocument(frontmatterEntries, body) {
  return `${renderFrontmatter(frontmatterEntries)}${body.trimStart()}`
}

// Build the Copilot-facing skill document with the metadata Copilot cares about.
function buildCopilotSkill(skillName, description, triggers, disableModelInvocation, body) {
  return buildSkillDocument([
    ["name", skillName],
    ["description", buildPortableDescription(description, triggers, 1000)],
    ["disable-model-invocation", disableModelInvocation ? true : undefined],
  ], body)
}

// Build the Claude-facing skill document with Claude-specific discovery metadata.
function buildClaudeSkill(skillName, description, triggers, disableModelInvocation, body) {
  return buildSkillDocument([
    ["name", skillName],
    ["description", description],
    ["when_to_use", triggers.length > 0 ? `Common triggers: ${triggers.join(", ")}.` : undefined],
    ["disable-model-invocation", disableModelInvocation ? true : undefined],
  ], body)
}

// Normalize the source trigger list into a clean string array.
function getSkillTriggers(frontmatter) {
  if (!Array.isArray(frontmatter.triggers)) return []
  return frontmatter.triggers.map((entry) => String(entry).trim()).filter(Boolean)
}

// Rewrite source skill body references so copied skills still point at valid local assets.
function transformBody(body, platform, skillName) {
  let transformed = stripFrontmatter(body)

  // Keep runtime references valid after the source skills are copied into platform-specific directories.
  if (skillName === "nebu-github-issues") {
    transformed = transformed.replace(
      /\[check-existing-issue\.sh\]\(\.\/check-existing-issue\.sh\)/g,
      platform === "claude"
        ? "`${CLAUDE_SKILL_DIR}/check-existing-issue.sh`"
        : "`.github/skills/nebu-github-issues/check-existing-issue.sh`",
    )
  }

  if (skillName === "nebu-ui-ux") {
    const replacement = platform === "claude"
      ? "${CLAUDE_SKILL_DIR}"
      : ".github/skills/nebu-ui-ux"
    transformed = transformed.replace(/<path-to-this-skill>/g, replacement)
  }

  return transformed
}

// Copy one skill directory into a generated platform directory.
async function copyDirectory(sourceDir, targetDir) {
  await fs.mkdir(targetDir, { recursive: true })
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath)
      continue
    }

    await fs.copyFile(sourcePath, targetPath)
  }
}

// Recreate a generated output directory from scratch so exports stay deterministic.
async function resetDirectory(targetDir) {
  await fs.rm(targetDir, { recursive: true, force: true })
  await fs.mkdir(targetDir, { recursive: true })
}

// List the canonical source skill directories in stable name order.
async function listSkillDirectories() {
  const entries = await fs.readdir(SOURCE_SKILLS_DIR, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

// Build a compact always-on Copilot instructions file that points the agent at the skills.
function buildCopilotInstructions(skills) {
  const preview = skills
    .slice(0, 8)
    .map((skill) => `- ${skill.name}: ${toSingleLine(skill.description, 100)}`)
    .join("\n")

  return `# Nebu Skills for GitHub Copilot

This repository ships portable workflow skills under [.github/skills](./skills).

- At the start of a task, choose the best matching skill immediately; do not wait for a manual trigger when the fit is clear.
- Prefer these skills when the user's request clearly matches one of them instead of restating the full workflow inline.
- Treat \`nebu-kaizen\` as the default execution baseline for normal software work and combine it with a more specific skill when needed.
- After every code edit, always invoke \`nebu-code-review\` before claiming done or moving on — regardless of change size. The skill itself determines the review depth.
- If review, verification, or wrap-up exposes a reusable workflow gap, capture it with \`nebu-skill-improvement\` before ending cold.
- When editing code, add concise intent comments by default; place one short comment above each function unless the repo's local convention says otherwise.
- Keep always-on instructions compact; put reusable procedures in skills so Copilot can load them on demand.

## Installed skills

${preview}
`
}

// Build the Claude root instructions file that layers Claude-specific guidance over AGENTS.md.
function buildClaudeMd() {
  return `@AGENTS.md

## Claude Code

- Prefer workflow skills under [.claude/skills](.claude/skills) when the user's request clearly matches one of them.
- At the start of a task, choose the best matching skill immediately; do not wait for a manual trigger when the fit is clear.
- Treat \`nebu-kaizen\` as the default execution baseline for normal software work and combine it with a more specific skill when needed.
- After every code edit, always invoke \`nebu-code-review\` before claiming done or moving on — regardless of change size. The skill itself determines the review depth.
- If review, verification, or wrap-up exposes a reusable workflow gap, capture it with \`nebu-skill-improvement\` before ending cold.
- When editing code, add concise intent comments by default; place one short comment above each function unless the repo's local convention says otherwise.
`
}

// Export the canonical skills into GitHub Copilot and Claude Code project directories.
async function exportSkills() {
  await fs.mkdir(path.dirname(COPILOT_INSTRUCTIONS_PATH), { recursive: true })
  await fs.mkdir(path.dirname(CLAUDE_MD_PATH), { recursive: true })
  await fs.mkdir(path.dirname(CLAUDE_SKILLS_DIR), { recursive: true })

  await resetDirectory(COPILOT_SKILLS_DIR)
  await resetDirectory(CLAUDE_SKILLS_DIR)

  const skillNames = await listSkillDirectories()
  const skillSummaries = []

  for (const skillName of skillNames) {
    const sourceDir = path.join(SOURCE_SKILLS_DIR, skillName)
    const sourceSkillPath = path.join(sourceDir, "SKILL.md")
    const sourceSkill = await fs.readFile(sourceSkillPath, "utf8")
    const frontmatter = parseFrontmatter(sourceSkill)
    const description = (frontmatter.description || "").trim()
    const triggers = getSkillTriggers(frontmatter)
    const disableModelInvocation = parseBooleanField(frontmatter["disable-model-invocation"])

    skillSummaries.push({ name: skillName, description })

    const copilotTarget = path.join(COPILOT_SKILLS_DIR, skillName)
    const claudeTarget = path.join(CLAUDE_SKILLS_DIR, skillName)
    await copyDirectory(sourceDir, copilotTarget)
    await copyDirectory(sourceDir, claudeTarget)

    await fs.writeFile(
      path.join(copilotTarget, "SKILL.md"),
      buildCopilotSkill(skillName, description, triggers, disableModelInvocation, transformBody(sourceSkill, "copilot", skillName)),
      "utf8",
    )
    await fs.writeFile(
      path.join(claudeTarget, "SKILL.md"),
      buildClaudeSkill(skillName, description, triggers, disableModelInvocation, transformBody(sourceSkill, "claude", skillName)),
      "utf8",
    )
  }

  await fs.writeFile(COPILOT_INSTRUCTIONS_PATH, buildCopilotInstructions(skillSummaries), "utf8")
  await fs.writeFile(CLAUDE_MD_PATH, buildClaudeMd(), "utf8")

  return skillNames.length
}

exportSkills()
  .then((count) => {
    console.log(`Exported ${count} skills for GitHub Copilot and Claude Code.`)
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
