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

const SKILL_KAZEN = "kaizen"
const SKILL_KICKOFF = "kickoff"
const SKILL_CODE_REVIEW = "code-review"
const SKILL_VERIFICATION = "verification"
const SKILL_DEBUGGING = "debugging"
const SKILL_IMPROVE = "improve"
const SKILL_UI_UX = "ui-ux"
const SKILL_GITHUB_ISSUES = "github-issues"
const SKILL_AGENT_WORKFLOWS = "agent-workflows"
const SKILL_WRITING = "writing-nebu-skills"

const VALID_EXECUTION_TIERS = new Set(["light", "standard", "heavy", "deep"])
const VALID_DELEGATION_MODES = new Set(["auto", "prefer-subagent", "owner-only"])

// Cascade step signal phrases — ordered by priority (first match wins).
// Each set corresponds to one skill. Phrases are matched case-insensitively
// against the user query. Order is the cascade priority: debugging before
// improve before ui-ux, etc. Session state can override (e.g. needsCodeReview
// boosts code-review when a completion phrase is also present).

const BUG_PHRASES = [
  "bug", "failing test", "broken build", "debug", "debuggen", "error",
  "start debugging", "start investigating", "fout opsporen", "crash",
  "stack trace", "race condition", "memory leak", "not working",
  "doesn't work", "broke", "regression",
]

const IMPROVE_PHRASES = [
  "improve", "audit", "tech debt", "tech debt audit", "audit codebase",
  "improve codebase", "direction",
  "audit and plan", "refactor this", "refactoren", "code cleanup",
  "opschonen", "simplify this code", "vereenvoudigen",
  "remove over-engineering", "deduplicate logic", "restructure this code",
  "reduce complexity", "untangle this", "clean architecture mess",
  "clean up", "debt", "code smell",
]

const UI_PHRASES = [
  "design a ui", "redesign this page", "improve ux", "polish the frontend",
  "landing page design", "dashboard design", "mobile app ui", "design system",
  "ui review", "redesign the frontend", "improve this page", "ux",
  "user interface", "frontend design", "visual design", "css polish",
]

const ISSUE_PHRASES = [
  "create issue", "github issue", "file issue", "gh issue create",
  "bug report", "open issue", "create ticket",
]

const AGENT_PHRASES = [
  "multi-agent", "parallel work", "agent coordination", "task handoff",
  "subagent delegation", "version bump", "bump version", "release notes",
  "changelog", "change log", "release prep", "tag release",
  "versie bump", "bump de versie", "parallelize",
]

const WRITING_PHRASES = [
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

// Return the default per-session routing state.
function createEmptySessionState() {
  return {
    matchedSkills: [],
    needsCodeReview: false,
    shouldCaptureImprovement: false,
    executionProfile: null,
  }
}

// Remove falsy values and duplicates while preserving original order.
function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

// Check whether the normalized query contains any one of the supplied phrases.
function hasPhraseSignal(query, phrases) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return false
  return phrases.some((phrase) => normalized.includes(phrase))
}

// Strip matching surrounding quotes from simple YAML scalar values.
function stripQuotes(value) {
  return value.replace(/^['"]|['"]$/g, "").trim()
}

// Parse the small YAML frontmatter subset used by skill files.
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

// Collapse multiline text into a bounded single-line preview.
function toSingleLine(text, maxLength = 120) {
  const singleLine = text.replace(/\s+/g, " ").trim()
  if (singleLine.length <= maxLength) return singleLine
  return `${singleLine.slice(0, maxLength - 3).trim()}...`
}

// Normalize frontmatter fields that may arrive as either string or string array.
function normalizeStringList(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean)
  if (typeof value === "string") return [value.trim()].filter(Boolean)
  return []
}

// Parse a loose boolean frontmatter value.
function parseBooleanField(value) {
  if (value === true || value === false) return value
  if (typeof value !== "string") return false
  return value.trim().toLowerCase() === "true"
}

// Parse execution tier from frontmatter and fall back safely.
function parseExecutionTier(value, fallback = "standard") {
  if (typeof value !== "string") return fallback
  const normalized = value.trim().toLowerCase()
  return VALID_EXECUTION_TIERS.has(normalized) ? normalized : fallback
}

// Parse delegation mode from frontmatter and fall back safely.
function parseDelegationMode(value, fallback = "auto") {
  if (typeof value !== "string") return fallback
  const normalized = value.trim().toLowerCase()
  return VALID_DELEGATION_MODES.has(normalized) ? normalized : fallback
}

// Check whether a file-system path exists.
async function pathExists(target) {
  try { await fs.access(target); return true } catch { return false }
}

// Recursively discover skill entrypoints below a configured skills root.
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

// Load installed skills, parse frontmatter, and precompute match metadata.
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

    skills.push({
      name, description, triggers, isDefault, executionTier, delegationDefault, filePath,
    })
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name))
}

// Resolve one skill by name.
function findSkill(skills, name) {
  return skills.find((skill) => skill.name === name)
}

// Map execution tier to the preferred host/model tier.
function agentTierForExecutionTier(executionTier) {
  switch (executionTier) {
    case "light": return "mini"
    case "heavy": return "high"
    case "deep": return "xhigh"
    default: return "default"
  }
}

// Build the execution profile from the matched skill and query signal overrides.
function buildExecutionProfile(matchedSkill, query) {
  if (!matchedSkill) return null

  let executionTier = matchedSkill.executionTier || "standard"
  let delegationMode = matchedSkill.delegationDefault || "auto"

  if (executionTier === "light" && delegationMode === "auto") delegationMode = "prefer-subagent"
  if (executionTier === "deep" && delegationMode === "auto") delegationMode = "owner-only"

  return {
    executionTier,
    agentTier: agentTierForExecutionTier(executionTier),
    delegationMode,
    matchedSkill: matchedSkill.name,
  }
}

// Deterministic cascade router. Checks signal phrases in priority order;
// the first matching step wins. Session state influences code-review routing.
//
// Cascade order:
//   1. GitHub issue        → nebu-github-issues
//   2. Bug/error           → nebu-debugging
//   3. Audit/improve/refac → nebu-improve
//   3. UI/UX               → nebu-ui-ux
//   4. GitHub issue        → nebu-github-issues
//   5. Multi-agent/release → nebu-agent-workflows
//   6. Skill writing       → nebu-writing-nebu-skills
//   7. Explicit review     → nebu-code-review
//   8. Code edited + done  → nebu-code-review (+ nebu-verification)
//   9. Completion          → nebu-verification
//  10. Ambiguity/planning  → nebu-kickoff
//  11. Default             → nebu-kaizen
function cascadeRoute(query, skills, sessionState) {
  const q = query.trim().toLowerCase()
  if (!q) {
    const fallback = findSkill(skills, SKILL_KAZEN)
    return {
      matchedSkills: fallback ? [fallback] : [],
      executionProfile: buildExecutionProfile(fallback, ""),
    }
  }

  // 1. GitHub issue → github-issues
  if (hasPhraseSignal(q, ISSUE_PHRASES)) {
    const skill = findSkill(skills, SKILL_GITHUB_ISSUES)
    if (skill) return { matchedSkills: [skill], executionProfile: buildExecutionProfile(skill, q) }
  }

  // 2. Bug/error → debugging
  if (hasPhraseSignal(q, BUG_PHRASES)) {
    const skill = findSkill(skills, SKILL_DEBUGGING)
    if (skill) return { matchedSkills: [skill], executionProfile: buildExecutionProfile(skill, q) }
  }

  // 3. Audit/improve/refactor → improve
  if (hasPhraseSignal(q, IMPROVE_PHRASES)) {
    const skill = findSkill(skills, SKILL_IMPROVE)
    if (skill) return { matchedSkills: [skill], executionProfile: buildExecutionProfile(skill, q) }
  }

  // 3. UI/UX → ui-ux
  if (hasPhraseSignal(q, UI_PHRASES)) {
    const skill = findSkill(skills, SKILL_UI_UX)
    if (skill) return { matchedSkills: [skill], executionProfile: buildExecutionProfile(skill, q) }
  }

  // 4. Multi-agent / release chores → agent-workflows
  if (hasPhraseSignal(q, AGENT_PHRASES)) {
    const skill = findSkill(skills, SKILL_AGENT_WORKFLOWS)
    if (skill) return { matchedSkills: [skill], executionProfile: buildExecutionProfile(skill, q) }
  }

  // 5. Skill writing → writing-nebu-skills
  if (hasPhraseSignal(q, WRITING_PHRASES)) {
    const skill = findSkill(skills, SKILL_WRITING)
    if (skill) return { matchedSkills: [skill], executionProfile: buildExecutionProfile(skill, q) }
  }

  // 6. Explicit review request → code-review (independent of session state)
  if (hasPhraseSignal(q, REVIEW_PHRASES)) {
    const skill = findSkill(skills, SKILL_CODE_REVIEW)
    if (skill) return { matchedSkills: [skill], executionProfile: buildExecutionProfile(skill, q) }
  }

  // 7. Code was edited + completion signal → code-review (+ verification)
  if (sessionState.needsCodeReview && hasPhraseSignal(q, COMPLETION_PHRASES)) {
    const primary = findSkill(skills, SKILL_CODE_REVIEW)
    const secondary = findSkill(skills, SKILL_VERIFICATION)
    if (primary) {
      const matches = secondary ? [primary, secondary] : [primary]
      return { matchedSkills: matches, executionProfile: buildExecutionProfile(primary, q) }
    }
  }

  // 8. Completion → verification
  if (hasPhraseSignal(q, COMPLETION_PHRASES)) {
    const skill = findSkill(skills, SKILL_VERIFICATION)
    if (skill) return { matchedSkills: [skill], executionProfile: buildExecutionProfile(skill, q) }
  }

  // 9. Ambiguity/planning → kickoff
  if (hasPhraseSignal(q, AMBIGUITY_PHRASES)) {
    const skill = findSkill(skills, SKILL_KICKOFF)
    if (skill) return { matchedSkills: [skill], executionProfile: buildExecutionProfile(skill, q) }
  }

  // 10. Default → kaizen
  const fallback = findSkill(skills, SKILL_KAZEN)
  return {
    matchedSkills: fallback ? [fallback] : [],
    executionProfile: buildExecutionProfile(fallback, q),
  }
}

// Trim session cache to the configured size by evicting oldest entries.
function trimSessionCache(cache, maxEntries) {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value
    if (!oldestKey) return
    cache.delete(oldestKey)
  }
}

// Merge updates into one session state record and refresh its recency.
function setSessionState(cache, sessionID, updates) {
  if (!sessionID) return null
  const current = cache.get(sessionID) || createEmptySessionState()
  const next = { ...current, ...updates }
  cache.delete(sessionID)
  cache.set(sessionID, next)
  trimSessionCache(cache, MAX_SESSION_CACHE)
  return next
}

// Read cached session state or fall back to default empty state.
function getSessionState(cache, sessionID) {
  if (!sessionID) return createEmptySessionState()
  return cache.get(sessionID) || createEmptySessionState()
}

module.exports = {
  // Constants
  CODE_EDIT_TOOL_IDS,
  DEFAULT_MAX_HINTS,
  DEFAULT_MAX_LISTED_SKILLS,
  VALID_DELEGATION_MODES,
  VALID_EXECUTION_TIERS,

  // Skill name constants
  SKILL_AGENT_WORKFLOWS,
  SKILL_CODE_REVIEW,
  SKILL_DEBUGGING,
  SKILL_GITHUB_ISSUES,
  SKILL_IMPROVE,
  SKILL_KAZEN,
  SKILL_KICKOFF,
  SKILL_UI_UX,
  SKILL_VERIFICATION,
  SKILL_WRITING,

  // Cascade router (replaces score + findMatches + apply* routing)
  cascadeRoute,

  // Execution profile
  buildExecutionProfile,

  // Skill loader
  loadSkills,

  // Session state
  createEmptySessionState,
  getSessionState,
  setSessionState,

  // Utilities
  findSkill,
  toSingleLine,
  normalizeStringList,
  parseBooleanField,
  parseFrontmatter,
  unique,
}
