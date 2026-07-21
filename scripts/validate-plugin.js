#!/usr/bin/env node

const fs = require("node:fs/promises")
const path = require("node:path")

const { parseFrontmatter, VALID_DELEGATION_MODES, VALID_EXECUTION_TIERS } = require("../core/router-core")

const REPO_ROOT = path.resolve(__dirname, "..")
const PLUGIN_PATH = path.join(REPO_ROOT, ".claude-plugin", "plugin.json")
const HOOKS_PATH = path.join(REPO_ROOT, "hooks", "hooks.json")
const SKILLS_PATH = path.join(REPO_ROOT, "skills")
const VERSION_PATH = path.join(REPO_ROOT, "VERSION")
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

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
async function validateSkills(errors) {
  const entries = await fs.readdir(SKILLS_PATH, { withFileTypes: true })
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const skillPath = path.join(SKILLS_PATH, entry.name, "SKILL.md")
    const content = await fs.readFile(skillPath, "utf8")
    const frontmatter = parseFrontmatter(content)

    const nameMatches = frontmatter.name === entry.name || entry.name === `nebu-${frontmatter.name}`
    if (!nameMatches || !NAME_PATTERN.test(entry.name)) {
      errors.push(`${path.relative(REPO_ROOT, skillPath)} name must match its kebab-case directory`)
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
}

// Run all plugin, hook, and skill checks and report every finding together.
async function main() {
  const errors = []
  await validatePluginManifest(errors)
  await validateHooks(errors)
  await validateSkills(errors)

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