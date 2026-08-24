#!/usr/bin/env node

const fs = require("node:fs/promises")
const path = require("node:path")

const { parseFrontmatter, VALID_DELEGATION_MODES, VALID_EXECUTION_TIERS, routingHintLines } = require("../core/router-core")

const REPO_ROOT = path.resolve(__dirname, "..")
const PLUGIN_PATH = path.join(REPO_ROOT, ".claude-plugin", "plugin.json")
const HOOKS_PATH = path.join(REPO_ROOT, "hooks", "hooks.json")
const SKILLS_PATH = path.join(REPO_ROOT, "skills")
const RULES_PATH = path.join(REPO_ROOT, "rules")
const VERSION_PATH = path.join(REPO_ROOT, "VERSION")
const README_PATH = path.join(REPO_ROOT, "README.md")
const ROUTER_RULES_PATH = path.join(REPO_ROOT, "rules", "agent-skills-kit.md")
const COMMANDS_PATH = path.join(REPO_ROOT, "commands")
const REFERENCE_PATTERN = /`([^`]+)`/g
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Collapse whitespace so doc mirrors of the beslisboom can keep their own
// alignment while still being held to the same rows, order, and skill names.
function normalizeHintRow(line) {
  return line.trim().replace(/\s+/g, " ")
}

// Read JSON and turn parse errors into a validation finding.
async function readJson(filePath, errors) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"))
  } catch (error) {
    errors.push(`${path.relative(REPO_ROOT, filePath)} is not valid JSON: ${error.message}`)
    return null
  }
}

// Validate the plugin identity and its references to bundled assets.
async function validatePluginManifest(errors) {
  const plugin = await readJson(PLUGIN_PATH, errors)
  if (!plugin) return

  if (typeof plugin.name !== "string" || !NAME_PATTERN.test(plugin.name)) {
    errors.push("plugin.json name must be plain kebab-case")
  }

  if (typeof plugin.version !== "string") errors.push("plugin.json version is required")
  if (plugin.skills !== "skills/") errors.push('plugin.json must point skills to "skills/"')
  if (plugin.hooks !== "hooks/hooks.json") errors.push('plugin.json must point hooks to "hooks/hooks.json"')

  const version = (await fs.readFile(VERSION_PATH, "utf8")).trim()
  if (plugin.version !== version) errors.push(`plugin.json version must match VERSION (${version})`)
}

// Validate the hook manifest against the supported VS Code lifecycle shape.
async function validateHooks(errors) {
  const hooks = await readJson(HOOKS_PATH, errors)
  if (!hooks) return

  for (const eventName of ["SessionStart", "UserPromptSubmit"]) {
    if (!Array.isArray(hooks.hooks?.[eventName])) {
      errors.push(`hooks/hooks.json must define ${eventName}`)
    }
  }

  for (const entries of Object.values(hooks.hooks || {})) {
    for (const entry of entries) {
      if (entry.type !== "command" || typeof entry.command !== "string") {
        errors.push("every hook entry must define type=command and a command")
      }
    }
  }
}

// Validate every canonical skill's directory, required metadata, and name format.
// Returns the resolved skill display names for downstream doc-consistency checks.
async function validateSkills(errors) {
  const entries = await fs.readdir(SKILLS_PATH, { withFileTypes: true })
  const skillNames = []
  for (const entry of entries.filter((item => item.isDirectory()))) {
    const skillPath = path.join(SKILLS_PATH, entry.name, "SKILL.md")
    const content = await fs.readFile(skillPath, "utf8")
    const frontmatter = parseFrontmatter(content)

    const nameMatches = frontmatter.name === entry.name || entry.name === `ask-${frontmatter.name}`
    if (!nameMatches || !NAME_PATTERN.test(entry.name)) {
      errors.push(`${path.relative(REPO_ROOT, skillPath)} name must match its kebab-case directory`)
    } else {
      skillNames.push(frontmatter.name)
    }
    if (typeof frontmatter.description !== "string" || frontmatter.description.trim().length === 0) {
      errors.push(`${path.relative(REPO_ROOT, skillPath)} requires a description`)
    } else if (frontmatter.description.trim().length > 1024) {
      errors.push(`${path.relative(REPO_ROOT, skillPath)} description exceeds 1024 characters`)
    }
    const disableModelInvocation = frontmatter["disable-model-invocation"]
    if (disableModelInvocation !== undefined) {
      const normalizedValue = String(disableModelInvocation).trim().toLowerCase()
      const isBooleanValue = disableModelInvocation === true || disableModelInvocation === false
      const isBooleanString = typeof disableModelInvocation === "string"
        && ["true", "false"].includes(normalizedValue)
      if (!isBooleanValue && !isBooleanString) {
        errors.push(`${path.relative(REPO_ROOT, skillPath)} has an unsupported disable-model-invocation value`)
      }
    }
    if (frontmatter.execution_tier !== undefined && !VALID_EXECUTION_TIERS.has(String(frontmatter.execution_tier).trim().toLowerCase())) {
      errors.push(`${path.relative(REPO_ROOT, skillPath)} has an unsupported execution_tier value`)
    }
    if (frontmatter.delegation_default !== undefined && !VALID_DELEGATION_MODES.has(String(frontmatter.delegation_default).trim().toLowerCase())) {
      errors.push(`${path.relative(REPO_ROOT, skillPath)} has an unsupported delegation_default value`)
    }
  }
  return skillNames.sort((left, right) => left.localeCompare(right))
}

// Assert the hand-maintained doc mirrors of pack facts still match generated truth:
// README's skill-count badge, one command file per skill, and the beslisboom rows
// mirrored in rules/agent-skills-kit.md.
async function validateDocConsistency(errors, skillNames) {
  const readme = await fs.readFile(README_PATH, "utf8")
  const badgeMatch = readme.match(/<code>(\d+) skills<\/code>/)
  if (!badgeMatch) {
    errors.push('README.md must contain a "<code>N skills</code>" badge')
  } else if (Number(badgeMatch[1]) !== skillNames.length) {
    errors.push(`README.md badge says ${badgeMatch[1]} skills but ${skillNames.length} skills exist in skills/`)
  }

  for (const skillName of skillNames) {
    try {
      await fs.access(path.join(COMMANDS_PATH, `${skillName}.md`))
    } catch {
      errors.push(`commands/${skillName}.md is missing — every skill ships a slash command`)
    }
  }

  const rulesContent = await fs.readFile(ROUTER_RULES_PATH, "utf8")
  const sectionMatch = rulesContent.match(/## Beslisboom\n([\s\S]*?)\n## /)
  if (!sectionMatch) {
    errors.push("rules/agent-skills-kit.md must contain a ## Beslisboom section")
    return
  }

  const actualRows = sectionMatch[1]
    .split("\n")
    .map(normalizeHintRow)
    .filter((line) => line.includes("→"))
  const expectedRows = routingHintLines().map(normalizeHintRow)
  if (JSON.stringify(actualRows) !== JSON.stringify(expectedRows)) {
    errors.push(
      `rules/agent-skills-kit.md beslisboom rows drifted from core/router-core.js OVERVIEW_ROWS `
      + `(found ${actualRows.length} rows, expected ${expectedRows.length}; regenerate from routingHintLines())`,
    )
  }
}

// Scan every SKILL.md for backtick-quoted references to rules/ files and verify they exist.
async function validateSkillReferences(errors) {
  const rulesFiles = new Set(await fs.readdir(RULES_PATH))

  const entries = await fs.readdir(SKILLS_PATH, { withFileTypes: true })
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const skillPath = path.join(SKILLS_PATH, entry.name, "SKILL.md")
    const content = await fs.readFile(skillPath, "utf8")
    let match

    REFERENCE_PATTERN.lastIndex = 0
    while ((match = REFERENCE_PATTERN.exec(content)) !== null) {
      const ref = match[1]
      const rulesMatch = ref.match(/^rules\/(.+)$/)
      if (rulesMatch && !rulesFiles.has(rulesMatch[1])) {
        errors.push(
          `${path.relative(REPO_ROOT, skillPath)} references rules/${rulesMatch[1]} but that file does not exist in rules/`,
        )
      }
    }
  }
}

// Run all plugin, hook, skill, and reference checks and report every finding together.
async function main() {
  const errors = []
  await validatePluginManifest(errors)
  await validateHooks(errors)
  const skillNames = await validateSkills(errors)
  await validateSkillReferences(errors)
  await validateDocConsistency(errors, skillNames)

  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  console.log("Plugin validation OK.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})