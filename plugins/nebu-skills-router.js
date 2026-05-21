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

function hasCompletionSignal(query) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return false

  return COMPLETION_PHRASES.some((phrase) => normalizedQuery.includes(phrase))
}

function prioritizeSkill(matches, skillName) {
  const matchedSkill = matches.find((skill) => skill.name === skillName)
  if (!matchedSkill) return matches

  return [matchedSkill, ...matches.filter((skill) => skill.name !== skillName)]
}

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
  return [
    prioritizedMatches[0],
    verificationSkill,
    ...prioritizedMatches.filter((skill, index) => index !== 0 && index !== verificationIndex),
  ].slice(0, maxHints)
}

function maybeAddSkill(matches, discoveredSkills, skillName, maxHints) {
  const matchedSkill = discoveredSkills.find((skill) => skill.name === skillName)
  if (!matchedSkill) return matches

  return unique([matchedSkill, ...matches]).slice(0, maxHints)
}

function applyImprovementRouting(query, matches, discoveredSkills, shouldCaptureImprovement, maxHints) {
  if (!shouldCaptureImprovement || !hasCompletionSignal(query)) return matches

  return prioritizeSkill(
    maybeAddSkill(matches, discoveredSkills, IMPROVEMENT_SKILL, maxHints),
    IMPROVEMENT_SKILL,
  )
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

function setSessionState(cache, sessionID, updates) {
  if (!sessionID) return null

  const current = cache.get(sessionID) || { matchedSkills: [], needsCodeReview: false, shouldCaptureImprovement: false }
  const next = { ...current, ...updates }

  cache.delete(sessionID)
  cache.set(sessionID, next)
  trimSessionCache(cache, MAX_SESSION_CACHE)

  return next
}

function resolveToolID(input) {
  const toolID = input?.toolID || input?.tool
  return typeof toolID === "string" ? toolID.trim() : ""
}

function resolveInvokedSkillName(input, output) {
  const candidates = [
    input?.name,
    input?.skill,
    input?.args?.name,
    input?.args?.skill,
    input?.arguments?.name,
    input?.arguments?.skill,
    output?.args?.name,
    output?.args?.skill,
    output?.arguments?.name,
    output?.arguments?.skill,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
  }

  return ""
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

  const sessionStateBySession = new Map()

  return {
    "chat.message": async (input, output) => {
      const text = readTextParts(output.parts)
      if (!text) return

      const currentState = input.sessionID
        ? sessionStateBySession.get(input.sessionID) || { matchedSkills: [], needsCodeReview: false, shouldCaptureImprovement: false }
        : { matchedSkills: [], needsCodeReview: false, shouldCaptureImprovement: false }
      const reviewAwareMatches = applySessionAwareRouting(
        text,
        findMatches(text, discoveredSkills, maxHints),
        discoveredSkills,
        currentState.needsCodeReview,
        maxHints,
      )
      const matchedSkills = applyImprovementRouting(
        text,
        reviewAwareMatches,
        discoveredSkills,
        currentState.shouldCaptureImprovement,
        maxHints,
      )

      setSessionState(sessionStateBySession, input.sessionID, {
        matchedSkills,
      })
    },
    "tool.execute.before": async (input) => {
      if (!input.sessionID) return

      const toolID = resolveToolID(input)
      if (!CODE_EDIT_TOOL_IDS.has(toolID)) return

      setSessionState(sessionStateBySession, input.sessionID, { needsCodeReview: true })
    },
    "tool.execute.after": async (input, output) => {
      if (!input.sessionID) return

      const toolID = resolveToolID(input)

      if (CODE_EDIT_TOOL_IDS.has(toolID)) {
        setSessionState(sessionStateBySession, input.sessionID, { needsCodeReview: true })
        return
      }

      if (toolID !== "skill") return

      const invokedSkillName = resolveInvokedSkillName(input, output)
      if (invokedSkillName === CODE_REVIEW_SKILL) {
        setSessionState(sessionStateBySession, input.sessionID, {
          needsCodeReview: false,
          shouldCaptureImprovement: true,
        })
        return
      }

      if (invokedSkillName === WRAPUP_SKILL || invokedSkillName === VERIFICATION_SKILL) {
        setSessionState(sessionStateBySession, input.sessionID, { shouldCaptureImprovement: true })
        return
      }

      if (invokedSkillName !== IMPROVEMENT_SKILL) return

      setSessionState(sessionStateBySession, input.sessionID, { shouldCaptureImprovement: false })
    },
    "experimental.chat.system.transform": async (input, output) => {
      const sessionState = input.sessionID
        ? sessionStateBySession.get(input.sessionID) || { matchedSkills: [], needsCodeReview: false, shouldCaptureImprovement: false }
        : { matchedSkills: [], needsCodeReview: false, shouldCaptureImprovement: false }
      const matchedSkills = sessionState.matchedSkills
      const lines = [
        "Skill routing:",
        "- For normal software work, prefer `nebu-kaizen` as the baseline and combine it with a more specific nebu skill when needed.",
        "- Prefer the `skill` tool when a request clearly matches an installed nebu workflow skill.",
        "- This router only suggests skills and should coexist cleanly with other plugins, including nebu-ctx.",
      ]

      if (skillPreview) {
        lines.push(`- Installed nebu-skills: ${skillPreview}`)
      }

      if (sessionState.needsCodeReview) {
        lines.push(
          "- Code was edited in this session. Before `nebu-verification` or a done/handoff claim, treat `nebu-code-review` as the default next skill unless the diff is truly tiny and a self-review is enough.",
        )
        lines.push(
          "- If the user says `done`, `ready`, `finished`, `handoff`, or Dutch equivalents like `klaar`, bias routing toward `nebu-code-review` before `nebu-verification`.",
        )
      }

      if (sessionState.shouldCaptureImprovement) {
        lines.push(
          "- Review, verification, or wrap-up happened in this session. Before ending cold, consider whether a reusable workflow gap was exposed and route toward `nebu-skill-improvement` when there is a concrete improvement to capture.",
        )
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
      if (resolveToolID(input) !== "skill" || !skillPreview) return

      output.description = `${output.description} Prefer this tool when the request matches an installed nebu workflow skill. Installed nebu-skills: ${skillPreview}`
    },
  }
}

module.exports = nebuSkillsRouterPlugin
module.exports.default = nebuSkillsRouterPlugin
