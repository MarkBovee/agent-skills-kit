const fs = require("node:fs/promises")
const path = require("node:path")

const DEFAULT_MAX_HINTS = 4
const DEFAULT_MAX_LISTED_SKILLS = 8
const INTERACTION_GUARD_THRESHOLD = 5
const MAX_SESSION_CACHE = 100
const CODE_EDIT_TOOL_IDS = new Set(["edit", "write", "apply_patch"])

const SKILL_DEVELOP = "develop"
const SKILL_INTAKE = "intake"
const SKILL_SPEC = "spec"
const SKILL_CODE_REVIEW = "code-review"
const SKILL_VERIFICATION = "verification"
const SKILL_DEBUGGING = "debugging"
const SKILL_IMPROVE = "improve"
const SKILL_DESIGN = "design"
const SKILL_DESIGN_REVIEW = "design-review"
const SKILL_SESSION_REVIEW = "session-review"
const SKILL_AGENT_WORKFLOWS = "agent-workflows"
const SKILL_WRITE_SKILL = "write-skill"
const SKILL_TEXT_WRITING = "text-writing"
const SKILL_RESEARCH = "research"
const SKILL_DEEP_RESEARCH = "deep-research"
const SKILL_OBSERVABILITY = "observability"
const REVIEW_COMPLETION_MARKER = "ASK_REVIEW_COMPLETE"
const VALID_EXECUTION_TIERS = new Set(["light", "standard", "deep"])
const VALID_DELEGATION_MODES = new Set(["auto", "prefer-subagent", "owner-only"])
const WORKFLOW_PHASES = ["INTAKE", "RESEARCH", "SPEC", "PLAN", "PLAN_CHECK", "EXECUTE", "VALIDATE", "REVIEW", "ITERATE", "AUDIT", "RELEASE_GATE", "DONE", "BLOCKED"]
const WORKFLOW_RISK_LEVELS = new Set(["small", "normal", "spec-required", "significant", "release-sensitive"])
const SPEC_REQUIRED_PHRASES = ["specify requirements", "requirements spec", "requirements specification", "design brief", "decision register", "requirements traceability", "spec before build", "behavior-changing", "behavior changing", "new external contract", "new external contracts", "acceptance criteria unclear", "unclear acceptance criteria"]
const RELEASE_RISK_PHRASES = ["release candidate", "production readiness", "ready to ship", "ready to merge", "release-sensitive"]
const SIGNIFICANT_RISK_PHRASES = ["architecture", "architectural", "migration", "ownership", "routing change", "multi-module", "backwards compatibility", "cross-cutting", "significant refactor"]
const SMALL_RISK_PHRASES = ["typo", "documentation-only", "docs only", "rename variable", "version bump", "changelog tweak"]
const LARGE_BRIEF_PHRASES = [
  "large multi-issue brief", "multiple issues", "all issues", "maximum compatibility",
  "end-to-end implementation", "merge and release", "release-sensitive brief",
]
const DEEP_RESEARCH_PHRASES = [
  "deep research", "exhaustive research", "comprehensive investigation",
  "complex technical investigation", "complex research", "contested research",
  "high-stakes research", "high stakes research", "complex contested high-stakes question",
  "complex compatibility question", "complex compatibility issue", "complex question", "multiple sources",
  "multi-source research", "multi source research", "conflicting evidence",
  "full compatibility investigation", "compare competing implementations",
  "compare local and upstream implementations", "investigate protocol behavior",
  "protocol behavior exhaustively",
  "investigate historical changes", "determine protocol behaviour",
  "research everything relevant", "investigate open issues", "open issues comprehensively", "compare against upstream",
]
const EXPLICIT_DEEP_RESEARCH_PHRASES = [
  "deep research", "exhaustive research", "comprehensive investigation",
  "complex technical investigation", "complex research", "contested research",
  "high-stakes research", "high stakes research", "research everything relevant",
  "open issues comprehensively", "multi-source research", "multi source research", "multiple sources", "complex question",
  "conflicting evidence",
]
const COMPARATIVE_DEEP_RESEARCH_PHRASES = DEEP_RESEARCH_PHRASES.filter(
  (phrase) => !EXPLICIT_DEEP_RESEARCH_PHRASES.includes(phrase),
)
const RESEARCH_PHRASES = [
  "research this", "research question", "find evidence", "compare sources",
  "investigate current state", "look into this technology", "research documentation",
]

const OBSERVABILITY_PHRASES = [
  "observability", "instrumentation", "add logging", "structured logging",
  "log levels", "add metrics", "adding metrics", "metrics dashboard", "set up metrics",
  "set up tracing", "distributed tracing", "opentelemetry",
  "set up alerting", "alerting on", "alert rule", "runbook",
  "telemetry setup", "app telemetry", "monitor this feature",
  "production visibility", "how do we observe", "what is working in production",
  "monitoring alerts", "instrument this",
]

const CODE_WORK_TOOL_IDS = new Set(["edit", "write", "apply_patch"])
const RECENT_TOOL_MAX = 20

const IMPROVE_PHRASES = [
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
  "slow startup", "timeout", "hanging", "hangt", "crash loop",
  "None", "target_temp", "malfunction", "storing",
]
const DESIGN_PHRASES = [
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
  "code reviewen", "check de wijziging", "review changes",
  "second look", "bekijk de diff", "controleer de code",
  "code check", "diff review", "PR review",
]
const COMPLETION_PHRASES = [
  "done", "finished", "ready", "handoff", "hand off", "wrap up",
  "claim success", "klaar", "gereed", "afronden", "afgerond",
  "task complete", "finishing work", "workspace done", "inleveren",
  "all done", "good to go",
  "verify", "verifiëren", "prove", "controleren of het werkt",
  "bewijzen dat het werkt",
  "test de fix", "check of het werkt", "validate", "valideren",
  "cleanup", "clean up",
]
const SPEC_PHRASES = [
  "specify requirements", "requirements spec", "requirements specification",
  "requirements capture", "requirements engineering", "design brief",
  "decision register", "requirements traceability", "traceable requirements",
  "validation gate", "readiness gate", "handover package", "spec before build",
  "truth spine", "requirements-driven", "formalize requirements",
]

// Signal phrases for human-first writing. Chosen to avoid colliding with
// develop triggers (write/rewrite) and write-skill phrases (create skill).
const TEXT_WRITING_PHRASES = [
  "anti-slop", "make this sound human", "sound human", "not read like ai",
  "read like ai", "not ai", "write a tweet", "draft email", "draft an email",
  "write an email", "cover letter", "linkedin post", "blog post", "newsletter",
  "copywriting", "schrijf als mens", "niet ai", "menselijk laten klinken",
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
  "sequencing risk",
  "staged refactor", "stages", "service by service",
  "dependency chain", "sequential steps",
  "per service", "per laag", "stap voor stap",
  "start planning", "start with a plan",
  "werk voorplannen", "uncertain", "unsure", "which approach",
  "cross-cutting", "cross cutting", "scope is unclear",
  "requirements are unclear", "what should we do next", "what next",
]

// A brand-new session has no route yet: the workflow stays null until a real
// routing decision (an actual prompt or comparable input) establishes one, so
// no surface can render a predicted default workflow before ASK decides.
function createEmptySessionState() {
  return {
    matchedSkills: [], needsCodeReview: false, shouldCaptureImprovement: false,
    needsDesignReview: false,
    executionProfile: null,
    toolCallCount: 0, interactionCountSinceSkillLoad: 0,
    recentToolIds: [], recentEditedPaths: [],
    hasDoneSessionAudit: false, skillsLoadedCount: 0,
    workflow: null,
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

// Detect the explicit handoff marker emitted when a delegated code review is complete.
function hasReviewCompletionSignal(value) {
  if (typeof value === "string") return value.includes(REVIEW_COMPLETION_MARKER)
  try {
    return JSON.stringify(value)?.includes(REVIEW_COMPLETION_MARKER) === true
  } catch {
    return false
  }
}

// Accept only a terminal delegated-review marker, not incidental documentation text.
function hasTerminalReviewCompletion(value) {
  const text = typeof value === "string" ? value : value?.output
  return typeof text === "string" && /(?:^|\n)ASK_REVIEW_COMPLETE\s*$/.test(text.trim())
}

function hasPhraseSignal(query, phrases) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return false
  return phrases.some((phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    try {
      return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(normalized)
    } catch {
      return normalized.includes(phrase)
    }
  })
}

// Count distinct phrase signals for one route so the cascade can tell whether a
// skill's triggers actually fired without changing priority-based selection.
function matchingPhrases(query, phrases) {
  const normalized = String(query || "").trim().toLowerCase()
  if (!normalized) return []
  return phrases.filter((phrase) => hasPhraseSignal(normalized, [phrase]))
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

// Classify prompt risk so workflow gates scale with impact instead of applying
// the release process to every small edit.
function classifyWorkflowRisk(query) {
  const normalized = String(query || "").trim().toLowerCase()
  if (!normalized) return "normal"
  if (hasPhraseSignal(normalized, RELEASE_RISK_PHRASES)) return "release-sensitive"
  if (hasPhraseSignal(normalized, LARGE_BRIEF_PHRASES)) return "significant"
  if (hasPhraseSignal(normalized, DEEP_RESEARCH_PHRASES)) return "significant"
  if (hasPhraseSignal(normalized, SPEC_REQUIRED_PHRASES)) return "spec-required"
  if (hasPhraseSignal(normalized, SIGNIFICANT_RISK_PHRASES)) return "significant"
  if (hasPhraseSignal(normalized, SMALL_RISK_PHRASES)) return "small"
  return "normal"
}

// Treat only an explicit lifecycle-risk signal as a new route selection. Plain
// follow-up prompts retain the current task's risk and accumulated evidence.
function hasWorkflowRiskSignal(query) {
  const normalized = String(query || "").trim().toLowerCase()
  return hasPhraseSignal(normalized, [...RELEASE_RISK_PHRASES, ...LARGE_BRIEF_PHRASES, ...DEEP_RESEARCH_PHRASES, ...SPEC_REQUIRED_PHRASES, ...SIGNIFICANT_RISK_PHRASES, ...SMALL_RISK_PHRASES])
}

// Rank risk levels so a follow-up cannot silently weaken an active release flow.
function workflowRiskRank(risk) {
  return ["small", "normal", "spec-required", "significant", "release-sensitive"].indexOf(risk)
}

// Select lifecycle gates for a risk level while keeping release decisions
// separate from implementation and ordinary validation.
function requiredWorkflowPhases(risk, query = "") {
  const phases = (() => {
    switch (risk) {
      case "small": return ["EXECUTE", "VALIDATE"]
      case "spec-required": return ["INTAKE", "SPEC", "PLAN", "PLAN_CHECK", "EXECUTE", "VALIDATE", "REVIEW"]
      case "significant": return ["INTAKE", "PLAN", "PLAN_CHECK", "EXECUTE", "VALIDATE", "REVIEW", "ITERATE", "AUDIT"]
      case "release-sensitive": return ["INTAKE", "PLAN", "PLAN_CHECK", "EXECUTE", "VALIDATE", "REVIEW", "ITERATE", "AUDIT", "RELEASE_GATE"]
      default: return ["PLAN", "EXECUTE", "VALIDATE", "REVIEW"]
    }
  })()
  if (risk !== "small" && hasPhraseSignal(String(query || ""), SPEC_REQUIRED_PHRASES) && !phases.includes("SPEC")) {
    phases.splice(1, 0, "SPEC")
  }
  return phases
}

// Build observable lifecycle state for router surfaces and subagent handoffs.
// Returns null when no routing decision exists yet: an empty input with no
// prior decision must stay neutral rather than adopt a generic default route.
function buildWorkflowState(query, previous = null) {
  const normalizedQuery = String(query || "").trim()
  const previousWorkflow = previous?.workflow || null
  if (!normalizedQuery && !previousWorkflow) return null
  const classifiedRisk = classifyWorkflowRisk(normalizedQuery)
  const risk = previousWorkflow?.risk && (!hasWorkflowRiskSignal(normalizedQuery)
    || workflowRiskRank(classifiedRisk) < workflowRiskRank(previousWorkflow.risk))
    ? previousWorkflow.risk
    : classifiedRisk
  const sameRisk = previousWorkflow?.risk === risk
  const previousRequiresSpec = sameRisk && previousWorkflow?.requiredPhases?.includes("SPEC")
  const requiredPhases = requiredWorkflowPhases(risk, previousRequiresSpec ? "new external contract" : normalizedQuery)
  return {
    risk,
    phase: sameRisk ? (previousWorkflow.phase || requiredPhases[0]) : requiredPhases[0],
    requiredPhases,
    completedGates: sameRisk && Array.isArray(previousWorkflow.completedGates) ? previousWorkflow.completedGates : [],
    subagents: sameRisk && Array.isArray(previousWorkflow.subagents) ? previousWorkflow.subagents : [],
    unresolvedFindings: sameRisk && Array.isArray(previousWorkflow.unresolvedFindings) ? previousWorkflow.unresolvedFindings : [],
    releaseStatus: sameRisk && previousWorkflow.releaseStatus
      ? previousWorkflow.releaseStatus
      : (risk === "release-sensitive" ? "PENDING" : "NOT_REQUIRED"),
  }
}

// Render concise lifecycle status for prompt and panel surfaces.
function workflowHintLines(workflow) {
  if (!workflow) return []
  const completed = new Set(workflow.completedGates || [])
  const gates = (workflow.requiredPhases || []).map((phase) => `${completed.has(phase) ? "PASS" : "TODO"}:${phase}`)
  const findings = (workflow.unresolvedFindings || []).length
  return [
    `Workflow: ${workflow.phase} | risk=${workflow.risk} | ${gates.join(" ")}`,
    `Evidence: subagents=${(workflow.subagents || []).length} | unresolved-findings=${findings} | release=${workflow.releaseStatus}`,
  ]
}

// Format the canonical skill identity for compact human-facing status surfaces.
function skillDisplayName(skillName) {
  if (typeof skillName !== "string" || !skillName.trim()) return null
  return skillName.trim().split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
}

// Describe the router's outstanding review obligations so a panel can show
// what ASK still needs and hide each item once its skill loads. The action is
// the exact tool call that satisfies the obligation; improvement capture is
// steered through the prompt surface, not the panel.
function pendingReviewRequirements(sessionState) {
  const pending = []
  if (sessionState?.needsCodeReview) pending.push({ flag: "needsCodeReview", skill: SKILL_CODE_REVIEW, label: "Code review needed", action: `skill(name: '${SKILL_CODE_REVIEW}')` })
  if (sessionState?.needsDesignReview) pending.push({ flag: "needsDesignReview", skill: SKILL_DESIGN_REVIEW, label: "Design review needed", action: `skill(name: '${SKILL_DESIGN_REVIEW}')` })
  return pending
}

// Build ordered active-skill facts for compact panels from actual skill loads.
// Route matches remain prompt-only guidance and never leak into the sidebar.
function activeSkillEntries(sessionState, activeSkill) {
  // Most recently loaded skills are closest context, so show them first after
  // the current skill instead of burying the immediately previous workflow.
  const loaded = [...(sessionState?.loadedSkills || [])].reverse().filter((skill) => typeof skill === "string" && skill.length > 0)
  const names = unique([activeSkill, ...loaded])
  return names.map((skill) => ({ skill, label: skillDisplayName(skill), current: skill === activeSkill }))
}

// Build the canonical status snapshot shared by prompt, event, and panel
// surfaces. Only a skill the agent actually loaded (or an explicit caller
// hand-off) appears here; route matches stay out of the sidebar entirely.
function buildRoutingStatus(route, sessionState, explicitSkill = "") {
  const activeSkill = explicitSkill
    || sessionState?.currentSkill
    || null
  return {
    activeSkills: activeSkillEntries(sessionState, activeSkill),
    pending: pendingReviewRequirements(sessionState),
  }
}

// Parse explicit subagent evidence without treating missing or malformed output
// as success; callers must handle BLOCKED and FAILED as non-passing results.
function parseWorkflowEvidence(value) {
  let text = typeof value === "string" ? value : ""
  if (!text) {
    try { text = JSON.stringify(value) || "" } catch { return null }
  }
  const match = text.match(/ASK_WORKFLOW_(PASS|FINDINGS|BLOCKED|FAILED)\b[^\n]*?\bphase=([A-Z_]+)/)
  if (!match) return null
  const phase = match[2] && WORKFLOW_PHASES.includes(match[2]) ? match[2] : null
  return { status: match[1], phase }
}

// Move lifecycle status to a skill-owned phase while preserving collected
// evidence and making unresolved findings explicit. A session with no route
// yet stays null rather than fabricating a partial workflow object.
function workflowForSkill(workflow, skillName) {
  if (!workflow) return workflow
  const phaseBySkill = {
    [SKILL_RESEARCH]: "RESEARCH",
    [SKILL_DEEP_RESEARCH]: "RESEARCH",
    [SKILL_SPEC]: "SPEC",
    [SKILL_INTAKE]: "INTAKE",
    [SKILL_DEVELOP]: "EXECUTE",
    [SKILL_VERIFICATION]: "VALIDATE",
    [SKILL_CODE_REVIEW]: "REVIEW",
    [SKILL_IMPROVE]: "AUDIT",
  }
  const phase = phaseBySkill[skillName]
  return phase && WORKFLOW_PHASES.includes(phase) ? { ...workflow, phase } : workflow
}

// Apply one structured subagent result to lifecycle state and advance only on
// explicit evidence; absent output never completes a gate. Without an
// established workflow there is nothing to advance, so the state stays null.
function recordWorkflowEvidence(workflow, evidence, role = "subagent") {
  if (!workflow || !evidence || !WORKFLOW_PHASES.includes(evidence.phase || workflow.phase)) return workflow
  const phase = evidence.phase || workflow.phase
  const requiredPhases = workflow.requiredPhases || []
  const phaseIndex = requiredPhases.indexOf(phase)
  const completedGates = new Set(workflow.completedGates || [])
  const unresolvedFindings = [...(workflow.unresolvedFindings || [])]
  // RESEARCH records optional evidence. Every mandatory gate needs its earlier
  // gates first, so a copied marker cannot promote a release prematurely.
  const resolvesFindings = phase === "ITERATE" && unresolvedFindings.length > 0
  const predecessorsComplete = phase === "RESEARCH" || resolvesFindings || (phaseIndex >= 0
    && requiredPhases.slice(0, phaseIndex).every((candidate) => completedGates.has(candidate)))
  if (!predecessorsComplete) return workflow
  let nextPhase = workflow.phase
  let releaseStatus = workflow.releaseStatus

  if (evidence.status === "PASS") {
    if (["AUDIT", "RELEASE_GATE"].includes(phase) && unresolvedFindings.length > 0) return workflow
    completedGates.add(phase)
    if (phase === "ITERATE") unresolvedFindings.length = 0
    const nextRequired = (workflow.requiredPhases || []).find((candidate) => !completedGates.has(candidate))
    nextPhase = nextRequired || "DONE"
    if (phase === "RELEASE_GATE") releaseStatus = "RELEASE"
  } else if (evidence.status === "FINDINGS") {
    unresolvedFindings.push({ role, phase, status: evidence.status })
    nextPhase = "ITERATE"
  } else {
    nextPhase = "BLOCKED"
    releaseStatus = "BLOCKED"
  }

  return {
    ...workflow,
    phase: nextPhase,
    completedGates: [...completedGates],
    subagents: [...(workflow.subagents || []), { role, phase, status: evidence.status }],
    unresolvedFindings,
    releaseStatus,
  }
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

const OVERVIEW_ROWS = [
  { label: "Deep research complex, contested, high-stakes questions", skill: SKILL_DEEP_RESEARCH },
  { label: "Research facts, sources, or current state",          skill: SKILL_RESEARCH },
  { label: "Specify requirements, build design brief",   skill: SKILL_SPEC },
  { label: "Clarify scope, plan ambiguous work",       skill: SKILL_INTAKE },
  { label: "Debug bug, crash, failing test, error",    skill: SKILL_DEBUGGING },
  { label: "Review code changes before handoff",       skill: SKILL_CODE_REVIEW },
  { label: "Verify claim, prove it works",             skill: SKILL_VERIFICATION },
  { label: "Audit, refactor, reduce tech debt",        skill: SKILL_IMPROVE },
  { label: "Reflect on session, file improvement",     skill: SKILL_SESSION_REVIEW },
  { label: "Coordinate multi-agent, parallel tasks",   skill: SKILL_AGENT_WORKFLOWS },
  { label: "Create or revise a skill",                 skill: SKILL_WRITE_SKILL },
  { label: "Design or polish UI/UX",                   skill: SKILL_DESIGN },
  { label: "Write text that reads human, not AI",      skill: SKILL_TEXT_WRITING },
  { label: "Instrument logging, metrics, tracing, alerting", skill: SKILL_OBSERVABILITY },
  { label: "Normal software work (default)",           skill: SKILL_DEVELOP },
]

// Render the canonical decision-tree rows as plain hint lines so every surface
// that mirrors the tree (plugin blocked-tool message, docs checks) derives
// from OVERVIEW_ROWS instead of keeping its own copy in sync.
function routingHintLines() {
  return OVERVIEW_ROWS.map((row) => `  ${row.label} → ${row.skill}`)
}

function buildSkillOverview(sessionState) {
  const interactionsSinceLoad = sessionState.interactionCountSinceSkillLoad || 0
  const skillsLoaded = (sessionState.skillsLoadedCount || 0) > 0
  const lines = [
    "╌ Agent Skills Kit ╌",
    skillsLoaded
      ? "Decision tree — load a different skill via `skill(name: '...')`:"
      : "Load matching skill *now* via `skill(name: '...')` before tools:",
    "",
  ]
  lines.push(...workflowHintLines(sessionState.workflow), "")
  // Keep internal develop fallback separate from actionable user suggestions.
  const hasSpecificMatch = (sessionState.matchedSkills || []).some(({ name }) => name !== SKILL_DEVELOP)
  const visibleRows = OVERVIEW_ROWS.filter((row) => row.skill !== SKILL_DEVELOP || (!skillsLoaded && !hasSpecificMatch))
  for (const row of visibleRows) {
    lines.push(`  ${row.label} → ${row.skill}`)
  }
  const matched = sessionState.matchedSkills || []
  if (matched.length > 0) {
    lines.push("")
    lines.push(`Active: ${matched.map(s => s.name).join("+")}${sessionState.executionProfile ? ` (${sessionState.executionProfile.executionTier}/${sessionState.executionProfile.delegationMode})` : ""}`)
  }
  if (sessionState.needsCodeReview) {
    lines.push("→ Code edited — `skill(name: 'code-review')` before claiming done")
  }
  if (sessionState.needsDesignReview) {
    lines.push("→ Design produced — `skill(name: 'design-review')` filters AI defaults before showing")
  }
  if (interactionsSinceLoad >= INTERACTION_GUARD_THRESHOLD && (sessionState.skillsLoadedCount || 0) === 0) {
    lines.push("→ Working through 5 actions without a loaded skill — `skill(name: 'develop')` sets workflow guardrails")
  }
  if (sessionState.shouldCaptureImprovement) {
    lines.push("→ Improvement found? `skill(name: 'session-review')` to file issue")
  }
  return lines.join("\n")
}

function cascadeRoute(query, skills, sessionState) {
  const q = query.trim().toLowerCase()
  if (!q) {
    const fallback = findSkill(skills, SKILL_DEVELOP)
    return { matchedSkills: fallback ? [fallback] : [], executionProfile: buildExecutionProfile(fallback, "") }
  }
  const tryRoute = (phrases, name) => {
    if (matchingPhrases(q, phrases).length === 0) return null
    const skill = findSkill(skills, name)
    if (!skill) return null
    return { matchedSkills: [skill], executionProfile: buildExecutionProfile(skill, q) }
  }
  return (
    tryRoute(BUG_PHRASES, SKILL_DEBUGGING) ||                  // 1. Execute
    tryRoute(IMPROVE_PHRASES, SKILL_IMPROVE) ||                // 2. Improve
    tryRoute(LARGE_BRIEF_PHRASES, SKILL_INTAKE) ||             // 3. Start (large brief)
    tryRoute(EXPLICIT_DEEP_RESEARCH_PHRASES, SKILL_DEEP_RESEARCH) || // 4. Research
    tryRoute(SPEC_PHRASES, SKILL_SPEC) ||                      // 5. Start (explicit spec)
    tryRoute(AMBIGUITY_PHRASES, SKILL_INTAKE) ||               // 6. Start
    tryRoute(COMPARATIVE_DEEP_RESEARCH_PHRASES, SKILL_DEEP_RESEARCH) || // 7. Research
    tryRoute(RESEARCH_PHRASES, SKILL_RESEARCH) ||              // 8. Research
    tryRoute(REVIEW_PHRASES, SKILL_CODE_REVIEW) ||             // 9. Validate
    (sessionState.needsCodeReview && (() => {
      if (!hasPhraseSignal(q, COMPLETION_PHRASES)) return null
      const primary = findSkill(skills, SKILL_CODE_REVIEW)
      if (!primary) return null
      const secondary = findSkill(skills, SKILL_VERIFICATION)
      return {
        matchedSkills: secondary ? [primary, secondary] : [primary],
        executionProfile: buildExecutionProfile(primary, q),
      }
    })()) ||
    tryRoute(COMPLETION_PHRASES, SKILL_VERIFICATION) ||        // 10. Validate
    tryRoute(SESSION_REVIEW_PHRASES, SKILL_SESSION_REVIEW) ||  // 11. Improve
    tryRoute(AGENT_PHRASES, SKILL_AGENT_WORKFLOWS) ||          // 12. Coordinate
    tryRoute(WRITE_SKILL_PHRASES, SKILL_WRITE_SKILL) ||        // 13. Coordinate
    tryRoute(DESIGN_PHRASES, SKILL_DESIGN) ||                  // 14. Product
    tryRoute(TEXT_WRITING_PHRASES, SKILL_TEXT_WRITING) ||      // 15. Product
    tryRoute(OBSERVABILITY_PHRASES, SKILL_OBSERVABILITY) ||    // 16. Operate
    (() => {                                                   // 17. Execute (default)
      const fallback = findSkill(skills, SKILL_DEVELOP)
      return { matchedSkills: fallback ? [fallback] : [], executionProfile: buildExecutionProfile(fallback, q) }
    })()
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
  CODE_EDIT_TOOL_IDS, CODE_WORK_TOOL_IDS, DEFAULT_MAX_HINTS, DEFAULT_MAX_LISTED_SKILLS,
  INTERACTION_GUARD_THRESHOLD, RECENT_TOOL_MAX,
  VALID_DELEGATION_MODES, VALID_EXECUTION_TIERS,
  WORKFLOW_PHASES, WORKFLOW_RISK_LEVELS,
  SKILL_AGENT_WORKFLOWS, SKILL_CODE_REVIEW, SKILL_DEBUGGING,
  SKILL_SESSION_REVIEW, SKILL_IMPROVE, SKILL_DEVELOP, SKILL_INTAKE, SKILL_DESIGN,
  SKILL_VERIFICATION, SKILL_WRITE_SKILL, SKILL_SPEC, COMPLETION_PHRASES, SKILL_DESIGN_REVIEW,
   SKILL_TEXT_WRITING, SKILL_RESEARCH, SKILL_DEEP_RESEARCH, SKILL_OBSERVABILITY, REVIEW_COMPLETION_MARKER, hasReviewCompletionSignal, hasTerminalReviewCompletion,
  buildSkillOverview, cascadeRoute, buildExecutionProfile, buildRoutingStatus, pendingReviewRequirements, activeSkillEntries, skillDisplayName, loadSkills,
  createEmptySessionState, getSessionState, setSessionState,
   findSkill, hasPhraseSignal, routingHintLines,
   classifyWorkflowRisk, hasWorkflowRiskSignal, workflowRiskRank, requiredWorkflowPhases, buildWorkflowState, workflowHintLines, parseWorkflowEvidence, workflowForSkill, recordWorkflowEvidence,
  stripFrontmatter, toSingleLine, normalizeStringList,
  parseBooleanField, parseFrontmatter, unique,
}
