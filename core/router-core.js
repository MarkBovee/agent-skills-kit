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
const CODE_EDIT_TOOL_IDS = new Set(["edit", "write", "apply_patch"])
const CODE_REVIEW_SKILL = "nebu-code-review"
const VERIFICATION_SKILL = "nebu-verification"
const WRAPUP_SKILL = "nebu-workspace-wrapup"
const IMPROVEMENT_SKILL = "nebu-skill-improvement"
const COMPLETION_PHRASES = [
  "done",
  "finished",
  "ready",
  "handoff",
  "hand off",
  "wrap up",
  "claim success",
  "klaar",
  "gereed",
  "afronden",
  "afgerond",
]

// Return the default per-session routing state when no session data exists yet.
function createEmptySessionState() {
  return {
    matchedSkills: [],
    needsCodeReview: false,
    shouldCaptureImprovement: false,
  }
}

// Remove falsy values and duplicates while preserving the original order.
function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

// Strip matching surrounding quotes from simple frontmatter scalar values.
function stripQuotes(value) {
  return value.replace(/^['"]|['"]$/g, "").trim()
}

// Parse the small YAML frontmatter subset used by the skill files in this repo.
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

// Convert free-form text into normalized tokens for rough relevance scoring.
function tokenize(text) {
  const matches = text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || []

  return matches
    .flatMap((word) => word.split("-"))
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
}

// Pull quoted phrases from descriptions so exact phrase matches can score higher.
function extractQuotedPhrases(text) {
  return [...text.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1].trim().toLowerCase())
    .filter(Boolean)
}

// Normalize frontmatter fields that may arrive as either a string or string array.
function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean)
  }

  if (typeof value === "string") {
    return [value.trim()].filter(Boolean)
  }

  return []
}

// Collapse multiline text into a bounded single-line preview for prompts and listings.
function toSingleLine(text, maxLength = 120) {
  const singleLine = text.replace(/\s+/g, " ").trim()
  if (singleLine.length <= maxLength) return singleLine
  return `${singleLine.slice(0, maxLength - 3).trim()}...`
}

// Check whether a file-system path exists without throwing on missing paths.
async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

// Recursively discover skill entrypoints below a configured skills root.
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

// Load installed skills, parse their frontmatter, and precompute match metadata.
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

// Score one skill against a user query using explicit names, phrases, and tokens.
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

// Detect completion-oriented wording that should bias routing toward review or wrap-up.
function hasCompletionSignal(query) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return false

  return COMPLETION_PHRASES.some((phrase) => normalizedQuery.includes(phrase))
}

// Move one named skill to the front of a match list when it is present.
function prioritizeSkill(matches, skillName) {
  const matchedSkill = matches.find((skill) => skill.name === skillName)
  if (!matchedSkill) return matches

  return [matchedSkill, ...matches.filter((skill) => skill.name !== skillName)]
}

// Add a named skill to the current matches without exceeding the configured hint budget.
function maybeAddSkill(matches, discoveredSkills, skillName, maxHints) {
  const matchedSkill = discoveredSkills.find((skill) => skill.name === skillName)
  if (!matchedSkill) return matches

  return unique([matchedSkill, ...matches]).slice(0, maxHints)
}

// Bias completion-oriented sessions toward code review and keep verification nearby.
function applySessionAwareRouting(query, matches, discoveredSkills, needsCodeReview, maxHints) {
  if (!needsCodeReview || !hasCompletionSignal(query)) {
    return matches
  }

  const codeReviewSkill = discoveredSkills.find((skill) => skill.name === CODE_REVIEW_SKILL)
  if (!codeReviewSkill) return matches

  const augmentedMatches = unique([
    codeReviewSkill,
    ...matches,
  ]).slice(0, maxHints)

  const prioritizedMatches = prioritizeSkill(augmentedMatches, CODE_REVIEW_SKILL)
  const verificationIndex = prioritizedMatches.findIndex((skill) => skill.name === VERIFICATION_SKILL)
  if (verificationIndex <= 0) {
    return prioritizedMatches
  }

  const verificationSkill = prioritizedMatches[verificationIndex]
  // Keep verification adjacent to review when both are present in a completion-oriented turn.
  return [
    prioritizedMatches[0],
    verificationSkill,
    ...prioritizedMatches.filter((skill, index) => index !== 0 && index !== verificationIndex),
  ].slice(0, maxHints)
}

// Bias post-review or post-wrap-up sessions toward capturing reusable improvements.
function applyImprovementRouting(query, matches, discoveredSkills, shouldCaptureImprovement, maxHints) {
  if (!shouldCaptureImprovement || !hasCompletionSignal(query)) return matches

  return prioritizeSkill(
    maybeAddSkill(matches, discoveredSkills, IMPROVEMENT_SKILL, maxHints),
    IMPROVEMENT_SKILL,
  )
}

// Return the highest-scoring skills for the current query.
function findMatches(query, skills, maxHints) {
  return skills
    .map((skill) => ({ skill, score: scoreSkill(skill, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name))
    .slice(0, maxHints)
    .map((entry) => entry.skill)
}

// Trim the session cache down to the configured size by evicting the oldest entries.
function trimSessionCache(cache, maxEntries) {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value
    if (!oldestKey) return
    cache.delete(oldestKey)
  }
}

// Merge updates into one session state record and refresh its recency in the cache.
function setSessionState(cache, sessionID, updates) {
  if (!sessionID) return null

  const current = cache.get(sessionID) || createEmptySessionState()
  const next = { ...current, ...updates }

  // Refresh insertion order so the trim step behaves like a small session-scoped LRU cache.
  cache.delete(sessionID)
  cache.set(sessionID, next)
  trimSessionCache(cache, MAX_SESSION_CACHE)

  return next
}

// Read the cached session state or fall back to the default empty state.
function getSessionState(cache, sessionID) {
  if (!sessionID) return createEmptySessionState()
  return cache.get(sessionID) || createEmptySessionState()
}

module.exports = {
  CODE_EDIT_TOOL_IDS,
  CODE_REVIEW_SKILL,
  DEFAULT_MAX_HINTS,
  DEFAULT_MAX_LISTED_SKILLS,
  IMPROVEMENT_SKILL,
  VERIFICATION_SKILL,
  WRAPUP_SKILL,
  applyImprovementRouting,
  applySessionAwareRouting,
  createEmptySessionState,
  findMatches,
  getSessionState,
  loadSkills,
  normalizeStringList,
  parseFrontmatter,
  scoreSkill,
  setSessionState,
  toSingleLine,
  unique,
}