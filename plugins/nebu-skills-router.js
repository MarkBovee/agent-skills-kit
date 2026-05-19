const fs = require("node:fs/promises")
const path = require("node:path")

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "do",
  "for",
  "from",
  "help",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "should",
  "that",
  "the",
  "this",
  "to",
  "use",
  "user",
  "using",
  "when",
  "with",
  "you",
  "your",
])

const DEFAULT_MAX_HINTS = 4
const DEFAULT_MAX_LISTED_SKILLS = 8
const MAX_SESSION_CACHE = 100

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function stripQuotes(value) {
  return value.replace(/^['"]|['"]$/g, "").trim()
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}

  const result = {}
  let currentListKey = null

  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const listItem = line.match(/^[-*]\s+(.*)$/)
    if (currentListKey && listItem) {
      if (!Array.isArray(result[currentListKey])) {
        result[currentListKey] = []
      }

      result[currentListKey].push(stripQuotes(listItem[1]))
      continue
    }

    const keyValue = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!keyValue) continue

    const [, key, rawValue] = keyValue
    if (!rawValue) {
      currentListKey = key
      result[key] = []
      continue
    }

    currentListKey = null
    result[key] = stripQuotes(rawValue)
  }

  return result
}

function tokenize(text) {
  const matches = text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || []

  return matches
    .flatMap((word) => word.split("-"))
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
}

function extractQuotedPhrases(text) {
  return [...text.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1].trim().toLowerCase())
    .filter(Boolean)
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean)
  }

  if (typeof value === "string") {
    return [value.trim()].filter(Boolean)
  }

  return []
}

function toSingleLine(text, maxLength = 120) {
  const singleLine = text.replace(/\s+/g, " ").trim()
  if (singleLine.length <= maxLength) return singleLine
  return `${singleLine.slice(0, maxLength - 3).trim()}...`
}

async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function findSkillFiles(root) {
  const results = []
  const entries = await fs.readdir(root, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await findSkillFiles(entryPath)))
      continue
    }

    if (entry.isFile() && entry.name === "SKILL.md") {
      results.push(entryPath)
    }
  }

  return results
}

async function loadSkills(pathsToScan) {
  const files = []

  for (const skillPath of pathsToScan) {
    if (!(await pathExists(skillPath))) continue
    files.push(...(await findSkillFiles(skillPath)))
  }

  const skills = []

  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8")
    const frontmatter = parseFrontmatter(content)
    const name = (frontmatter.name || path.basename(path.dirname(filePath))).trim()
    const description = (frontmatter.description || "").trim()
    const triggers = normalizeStringList(frontmatter.triggers)

    if (!name || !description) continue

    skills.push({
      name,
      description,
      triggers,
      filePath,
      phrases: unique([...triggers.map((trigger) => trigger.toLowerCase()), ...extractQuotedPhrases(description)]),
      tokens: tokenize(`${name} ${description} ${triggers.join(" ")}`),
    })
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name))
}

function scoreSkill(skill, query) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return 0

  let score = 0
  if (normalizedQuery.includes(skill.name.toLowerCase())) {
    score += 10
  }

  for (const trigger of skill.triggers) {
    const normalizedTrigger = trigger.toLowerCase()
    if (!normalizedTrigger) continue

    if (normalizedQuery.includes(normalizedTrigger)) {
      score += Math.min(8, normalizedTrigger.split(/\s+/).length + 3)
    }
  }

  for (const phrase of skill.phrases) {
    if (normalizedQuery.includes(phrase)) {
      score += Math.min(6, phrase.split(/\s+/).length + 2)
    }
  }

  const queryTokens = new Set(tokenize(normalizedQuery))
  for (const token of skill.tokens) {
    if (!queryTokens.has(token)) continue
    score += token.length >= 6 ? 2 : 1
  }

  return score
}

function findMatches(query, skills, maxHints) {
  return skills
    .map((skill) => ({ skill, score: scoreSkill(skill, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name))
    .slice(0, maxHints)
    .map((entry) => entry.skill)
}

function trimSessionCache(cache, maxEntries) {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value
    if (!oldestKey) return
    cache.delete(oldestKey)
  }
}

function readTextParts(parts) {
  if (!Array.isArray(parts)) return ""

  return parts
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim()
}

async function nebuSkillsRouterPlugin(_input, options = {}) {
  const configuredPaths = Array.isArray(options.paths) ? options.paths : []
  const preferredSkillPaths = unique([
    path.resolve(__dirname, "../skills"),
    ...configuredPaths,
  ])
  const discoveredSkills = await loadSkills(preferredSkillPaths)
  const maxHints = Number.isInteger(options.maxHints) ? options.maxHints : DEFAULT_MAX_HINTS
  const maxListedSkills = Number.isInteger(options.maxListedSkills)
    ? options.maxListedSkills
    : DEFAULT_MAX_LISTED_SKILLS

  const skillPreview = discoveredSkills
    .slice(0, maxListedSkills)
    .map((skill) => `${skill.name}: ${toSingleLine(skill.description, 70)}`)
    .join("; ")

  const matchesBySession = new Map()

  return {
    "chat.message": async (input, output) => {
      const text = readTextParts(output.parts)
      if (!text) return

      matchesBySession.set(input.sessionID, findMatches(text, discoveredSkills, maxHints))
      trimSessionCache(matchesBySession, MAX_SESSION_CACHE)
    },
    "experimental.chat.system.transform": async (input, output) => {
      const matchedSkills = input.sessionID ? matchesBySession.get(input.sessionID) || [] : []
      const lines = [
        "Skill routing:",
        "- Prefer the `skill` tool when a request clearly matches an installed nebu workflow skill.",
        "- This router only suggests skills and should coexist cleanly with other plugins, including nebu-ctx.",
      ]

      if (skillPreview) {
        lines.push(`- Installed nebu-skills: ${skillPreview}`)
      }

      if (matchedSkills.length > 0) {
        lines.push(
          `- Best matches for this request: ${matchedSkills
            .map((skill) => `${skill.name} (${toSingleLine(skill.description, 80)})`)
            .join("; ")}`,
        )
      }

      output.system.push(lines.join("\n"))
    },
    "tool.definition": async (input, output) => {
      if (input.toolID !== "skill" || !skillPreview) return

      output.description = `${output.description} Prefer this tool when the request matches an installed nebu workflow skill. Installed nebu-skills: ${skillPreview}`
    },
  }
}

module.exports = nebuSkillsRouterPlugin
module.exports.default = nebuSkillsRouterPlugin
