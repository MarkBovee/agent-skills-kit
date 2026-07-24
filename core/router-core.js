const fs = require("node:fs/promises")
const path = require("node:path")

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "for", "from",
  "help", "how", "i", "if", "in", "into", "is", "it", "me", "my", "of", "on",
  "or", "should", "that", "the", "this", "to", "use", "user", "using", "when",
  "with", "you", "your",
])

const DEFAULT_MAX_HINTS = 4
const DEFAULT_MAX_LISTED_SKILLS = 8
const MAX_SESSION_CACHE = 100
const CODE_EDIT_TOOL_IDS = new Set(["edit", "write", "apply_patch"])

const SKILL_DEVELOP = "develop"
const SKILL_INTAKE = "intake"
const SKILL_CODE_REVIEW = "code-review"
const SKILL_VERIFICATION = "verification"
const SKILL_DEBUGGING = "debugging"
const SKILL_REFACTOR = "refactor"
const SKILL_UI_UX = "ui-ux"
const SKILL_SESSION_REVIEW = "session-review"
const SKILL_AGENT_WORKFLOWS = "agent-workflows"
const SKILL_WRITE_SKILL = "write-skill"
const VALID_EXECUTION_TIERS = new Set(["light", "standard", "heavy", "deep"])
const VALID_DELEGATION_MODES = new Set(["auto", "prefer-subagent", "owner-only"])

const REFACTOR_PHRASES = [
  "improve", "audit", "tech debt", "tech debt audit", "audit codebase",
  "improve codebase", "direction", "audit and plan", "refactor this",
  "refactoren", "code cleanup", "opschonen", "simplify this code",
  "vereenvoudigen", "remove over-engineering", "deduplicate logic",
  "restructure this code", "reduce complexity", "untangle this",
  "clean architecture mess", "clean up", "debt", "code smell",
]

// Signal phrases per skill. Case-insensitive match. Order = cascade priority.
const BUG_PHRASES = [
  "bug", "failing test", "broken build", "debug", "debuggen", "error",
  "start debugging", "start investigating", "fout opsporen", "crash",
  "stack trace", "race condition", "memory leak", "not working",
  "doesn't work", "broke", "regression",
]
const UI_PHRASES = [
  "design a ui", "redesign this page", "improve ux", "polish the frontend",
  "landing page design", "dashboard design", "mobile app ui", "design system",
  "ui review", "redesign the frontend", "improve this page", "ux",
  "user interface", "frontend design", "visual design", "css polish",
]
const SESSION_REVIEW_PHRASES = [
  "retrospective", "retro", "reflect on session", "how did i use skills",
  "file an issue", "create issue", "github issue",
  "file issue", "gh issue create", "open issue", "create ticket",
]
const AGENT_PHRASES = [
  "multi-agent", "parallel work", "agent coordination", "task handoff",
  "subagent delegation", "parallelize",
]
const WRITE_SKILL_PHRASES = [
  "create skill", "revise skill", "skill design", "trigger-focused",
  "write skills", "improve skills", "skill improvement", "skill gap",
  "workflow improvement", "routing gap", "missing guardrail",
  "prompt pack improvement", "reusable improvement", "agent missed",
  "auto improvement", "new skill", "write a skill", "author skill",
]
const REVIEW_PHRASES = [
  "review", "nakijken", "diff", "pull request", "code review",
  "fresh eyes", "start reviewing", "review deze wijziging",
  "after code changes", "after coding", "before claiming done",
  "code reviewen",
]
const COMPLETION_PHRASES = [
  "done", "finished", "ready", "handoff", "hand off", "wrap up",
  "claim success", "klaar", "gereed", "afronden", "afgerond",
  "task complete", "finishing work", "workspace done", "inleveren",
  "all done", "good to go",
  "verify", "verifiëren", "prove", "controleren of het werkt",
  "bewijzen dat het werkt",
]
const AMBIGUITY_PHRASES = [
  "brainstorm", "brainstormen", "fuzzy idea", "design tradeoff",
  "unsure what to build", "product direction", "idee uitwerken",
  "ambiguous", "unclear scope", "behavior-changing work",
  "fuzzy requirements", "what should we build", "wat moeten we bouwen",
  "wat moeten we maken", "best approach", "how should we approach",
  "not sure where to start", "start by clarifying", "start with questions",
  "ik weet niet waar te beginnen", "hoe pakken we dit aan",
  "plan", "plannen", "multi-file work", "multi-phase work", "migration",
  "sequencing risk", "start planning", "start with a plan",
  "werk voorplannen", "uncertain", "unsure", "which approach",
  "cross-cutting", "cross cutting", "scope is unclear",
  "requirements are unclear", "what should we do next", "what next",
]

function createEmptySessionState() {
  return { matchedSkills: [], needsCodeReview: false, shouldCaptureImprovement: false, executionProfile: null }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function hasPhraseSignal(query, phrases) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return false
  return phrases.some((phrase) => normalized.includes(phrase))
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
      if (!Array.isArray(result[currentListKey])) result[currentListKey] = []
      result[currentListKey].push(stripQuotes(listItem[1]))
      continue
    }
    const keyValue = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!keyValue) continue
    const [, key, rawValue] = keyValue
    if (!rawValue) { currentListKey = key; result[key] = []; continue }
    currentListKey = null
    result[key] = stripQuotes(rawValue)
  }
  return result
}

function stripFrontmatter(content) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
}

function toSingleLine(text, maxLength = 120) {
  const singleLine = text.replace(/\s+/g, " ").trim()
  if (singleLine.length <= maxLength) return singleLine
  return `${singleLine.slice(0, maxLength - 3).trim()}...`
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean)
  if (typeof value === "string") return [value.trim()].filter(Boolean)
  return []
}

function parseBooleanField(value) {
  if (value === true || value === false) return value
  if (typeof value !== "string") return false
  return value.trim().toLowerCase() === "true"
}

function parseExecutionTier(value, fallback = "standard") {
  if (typeof value !== "string") return fallback
  const normalized = value.trim().toLowerCase()
  return VALID_EXECUTION_TIERS.has(normalized) ? normalized : fallback
}

function parseDelegationMode(value, fallback = "auto") {
  if (typeof value !== "string") return fallback
  const normalized = value.trim().toLowerCase()
  return VALID_DELEGATION_MODES.has(normalized) ? normalized : fallback
}

async function pathExists(target) {
  try { await fs.access(target); return true } catch { return false }
}

async function findSkillFiles(root) {
  const results = []
  const entries = await fs.readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name)
    if (entry.isDirectory()) { results.push(...(await findSkillFiles(entryPath))); continue }
    if (entry.isFile() && entry.name === "SKILL.md") results.push(entryPath)
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
    const isDefault = parseBooleanField(frontmatter.default)
    const executionTier = parseExecutionTier(frontmatter.execution_tier)
    const delegationDefault = parseDelegationMode(frontmatter.delegation_default)
    if (!name || !description) continue
    skills.push({ name, description, triggers, isDefault, executionTier, delegationDefault, filePath })
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name))
}

function findSkill(skills, name) {
  return skills.find((skill) => skill.name === name)
}

function agentTierForExecutionTier(executionTier) {
  switch (executionTier) {
    case "light": return "mini"
    case "heavy": return "high"
    case "deep": return "xhigh"
    default: return "default"
  }
}

function buildExecutionProfile(matchedSkill, query) {
  if (!matchedSkill) return null
  let executionTier = matchedSkill.executionTier || "standard"
  let delegationMode = matchedSkill.delegationDefault || "auto"
  if (executionTier === "light" && delegationMode === "auto") delegationMode = "prefer-subagent"
  if (executionTier === "deep" && delegationMode === "auto") delegationMode = "owner-only"
  return { executionTier, agentTier: agentTierForExecutionTier(executionTier), delegationMode, matchedSkill: matchedSkill.name }
}

function cascadeRoute(query, skills, sessionState) {
  const q = query.trim().toLowerCase()
  if (!q) {
    const fallback = findSkill(skills, SKILL_DEVELOP)
    return { matchedSkills: fallback ? [fallback] : [], executionProfile: buildExecutionProfile(fallback, "") }
  }
  const tryRoute = (phrases, name) => {
    if (!hasPhraseSignal(q, phrases)) return null
    const skill = findSkill(skills, name)
    return skill ? { matchedSkills: [skill], executionProfile: buildExecutionProfile(skill, q) } : null
  }
  return (
    tryRoute(AMBIGUITY_PHRASES, SKILL_INTAKE) ||           // 1. Start
    tryRoute(BUG_PHRASES, SKILL_DEBUGGING) ||               // 2. Execute
    tryRoute(REVIEW_PHRASES, SKILL_CODE_REVIEW) ||          // 3. Validate
    (sessionState.needsCodeReview && (() => {
      if (!hasPhraseSignal(q, COMPLETION_PHRASES)) return null
      const primary = findSkill(skills, SKILL_CODE_REVIEW)
      if (!primary) return null
      const secondary = findSkill(skills, SKILL_VERIFICATION)
      return { matchedSkills: secondary ? [primary, secondary] : [primary], executionProfile: buildExecutionProfile(primary, q) }
    })()) ||
    tryRoute(COMPLETION_PHRASES, SKILL_VERIFICATION) ||     // 4. Validate
    tryRoute(REFACTOR_PHRASES, SKILL_REFACTOR) ||           // 5. Improve
    tryRoute(SESSION_REVIEW_PHRASES, SKILL_SESSION_REVIEW) ||         // 6. Improve
    tryRoute(AGENT_PHRASES, SKILL_AGENT_WORKFLOWS) ||       // 7. Coordinate
    tryRoute(WRITE_SKILL_PHRASES, SKILL_WRITE_SKILL) ||     // 8. Coordinate
    tryRoute(UI_PHRASES, SKILL_UI_UX) ||                    // 9. Product
    (() => {
      const fallback = findSkill(skills, SKILL_DEVELOP)
      return { matchedSkills: fallback ? [fallback] : [], executionProfile: buildExecutionProfile(fallback, q) }
    })()                                                     // 10. Execute (default)
  )
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
  const current = cache.get(sessionID) || createEmptySessionState()
  const next = { ...current, ...updates }
  cache.delete(sessionID)
  cache.set(sessionID, next)
  trimSessionCache(cache, MAX_SESSION_CACHE)
  return next
}

function getSessionState(cache, sessionID) {
  if (!sessionID) return createEmptySessionState()
  return cache.get(sessionID) || createEmptySessionState()
}

module.exports = {
  CODE_EDIT_TOOL_IDS, DEFAULT_MAX_HINTS, DEFAULT_MAX_LISTED_SKILLS,
  VALID_DELEGATION_MODES, VALID_EXECUTION_TIERS,
  SKILL_AGENT_WORKFLOWS, SKILL_CODE_REVIEW, SKILL_DEBUGGING,
  SKILL_SESSION_REVIEW, SKILL_REFACTOR, SKILL_DEVELOP, SKILL_INTAKE, SKILL_UI_UX,
  SKILL_VERIFICATION, SKILL_WRITE_SKILL,
  cascadeRoute, buildExecutionProfile, loadSkills,
  createEmptySessionState, getSessionState, setSessionState,
  findSkill, stripFrontmatter, toSingleLine, normalizeStringList,
  parseBooleanField, parseFrontmatter, unique,
}
