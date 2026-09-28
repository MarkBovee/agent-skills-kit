// Normalize the live OpenCode V2 tool history into the sidebar's compact status shape.

// Keep this ESM-only runtime boundary independent from the router's CommonJS core.
// OpenCode's TUI loader does not synthesize CommonJS named exports.
export const ASK_SKILL_NAMES = new Set([
  "agent-workflows", "code-review", "debugging", "deep-research", "design",
  "design-review", "develop", "gh-inbox", "improve", "intake", "observability",
  "research", "session-review", "spec", "text-writing", "verification", "write-skill",
])

const CODE_EDIT_TOOL_NAMES = new Set(["edit", "write", "patch", "apply_patch"])
const SPEC_WORKFLOW_PHRASES = [
  "specify requirements", "requirements spec", "requirements specification", "design brief",
  "decision register", "requirements traceability", "spec before build", "behavior-changing",
  "behavior changing", "new external contract", "new external contracts", "acceptance criteria unclear",
  "unclear acceptance criteria",
]
const SMALL_WORKFLOW_PHRASES = [
  "typo", "documentation-only", "docs only", "rename variable", "version bump", "changelog tweak",
  "small local fix", "small local bug fix", "small bug fix", "small fix", "quick fix", "tiny fix",
  "small change", "small adjustment", "minor adjustment",
]
const RELEASE_WORKFLOW_PHRASES = [
  "release candidate", "production readiness", "ready to ship", "ready to merge", "release-sensitive",
]
const LARGE_WORKFLOW_PHRASES = [
  "large multi-issue brief", "multiple issues", "all issues", "maximum compatibility",
  "end-to-end implementation", "merge and release", "release-sensitive brief",
]
const DEEP_RESEARCH_WORKFLOW_PHRASES = [
  "deep research", "exhaustive research", "comprehensive investigation",
  "complex technical investigation", "complex research", "contested research",
  "high-stakes research", "high stakes research", "complex contested high-stakes question",
  "complex compatibility question", "complex compatibility issue", "complex question", "multiple sources",
  "multi-source research", "multi source research", "conflicting evidence",
  "full compatibility investigation", "compare competing implementations",
  "compare local and upstream implementations", "investigate protocol behavior",
  "protocol behavior exhaustively", "investigate historical changes",
  "determine protocol behaviour", "research everything relevant", "investigate open issues",
  "open issues comprehensively", "compare against upstream",
]
const SIGNIFICANT_WORKFLOW_PHRASES = [
  "architecture", "architectural", "migration", "ownership", "routing change", "multi-module",
  "backwards compatibility", "cross-cutting", "significant refactor", "security", "authentication",
  "authorization", "credential", "password", "token", "secret handling", "access control",
  "permission check", "sql injection", "injection", "xss", "cross-site scripting", "csrf",
  "race condition", "buffer overflow", "side-channel", "privilege escalation", "encryption",
  "cryptography", "privacy", "sensitive data", "data leak", "data exfiltration", "data loss",
  "data corruption", "input validation", "path traversal", "remote code execution", "bypass",
  "vulnerability", "exploit", "auth", "oauth", "ssl", "tls", "crypto", "login",
  "session management", "api key", "api secret", "schema change", "database schema",
  "db column removal", "ssrf", "rce", "idor", "xxe",
]

// Match whole risk phrases like the shared router, not substrings in longer words.
function hasWorkflowPhraseSignal(promptText, phrases) {
  const normalized = promptText.trim().toLowerCase()
  if (!normalized) return false
  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    try {
      if (new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(normalized)) return true
    } catch {
      if (normalized.includes(phrase)) return true
    }
  }
  return false
}

// Accept only router status records that are safe for presentation.
export function readStatus(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value
}

// Translate native ASK skill identifiers back to the canonical router skill name.
function canonicalSkillName(value) {
  if (typeof value !== "string" || !value) return null
  const skill = value.startsWith("ask-") ? value.slice(4) : value
  return ASK_SKILL_NAMES.has(skill) ? skill : null
}

// Normalize native tool input so the sidebar accepts both OpenCode input shapes.
function toolInput(part) {
  const input = part?.state?.input
  if (input && typeof input === "object") return input
  if (typeof input !== "string") return null
  try {
    const parsed = JSON.parse(input)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

// Classify sidebar prompts with the same risk precedence as the shared router.
function classifyObservedWorkflowRisk(promptText) {
  const riskSignals = [
    { risk: "release-sensitive", phrases: RELEASE_WORKFLOW_PHRASES },
    { risk: "significant", phrases: LARGE_WORKFLOW_PHRASES },
    { risk: "significant", phrases: DEEP_RESEARCH_WORKFLOW_PHRASES },
    { risk: "significant", phrases: SIGNIFICANT_WORKFLOW_PHRASES },
    { risk: "spec-required", phrases: SPEC_WORKFLOW_PHRASES },
    { risk: "small", phrases: SMALL_WORKFLOW_PHRASES },
  ]
  for (const signal of riskSignals) {
    if (hasWorkflowPhraseSignal(promptText, signal.phrases)) return signal.risk
  }
  return null
}

// Format canonical skill names consistently with the server snapshot labels.
function skillLabel(skill) {
  // Map each item through the local transformation.
  return skill.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")
}

// Recover completed native skill calls that occurred after prompt metadata was recorded.
function loadedSkillEntries(messages) {
  if (!Array.isArray(messages)) return []
  const entries = []
  const seen = new Set()
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const content = messages[messageIndex]?.content
    if (!Array.isArray(content)) continue
    for (let contentIndex = content.length - 1; contentIndex >= 0; contentIndex -= 1) {
      const part = content[contentIndex]
      if (part?.type !== "tool" || part.name !== "skill" || part.state?.status !== "completed") continue
      const input = toolInput(part)
      const skill = canonicalSkillName(input?.id ?? input?.name)
      if (!skill || seen.has(skill)) continue
      seen.add(skill)
      entries.push({ skill, label: skillLabel(skill), current: entries.length === 0 })
    }
  }
  return entries
}

// Extract completed tool output text for review-evidence recognition.
function toolOutputText(part) {
  const candidates = [part?.state?.output, part?.state?.result, part?.state?.error]
  return candidates
    // Keep only textual tool results for marker matching.
    .filter((value) => typeof value === "string")
    .join("\n")
}

// Rebuild review obligations from completed native tool calls when metadata is stale.
function observedPendingItems(messages) {
  if (!Array.isArray(messages)) return null
  let hasRelevantHistory = false
  let needsCodeReview = false
  let needsDesignReview = false
  let reviewGeneration = 0
  let currentReviewReference = ""
  let currentDiffIdentity = ""
  let validatedDiffIdentity = ""
  let reviewedDiffIdentity = ""
  let reviewHasFindings = false
  let completedWorkflowPhases = new Set()
  let specWorkflowRequired = false
  let workflowRisk = null

  for (const message of messages) {
    if (!Array.isArray(message?.content)) continue
    const messageText = message.content
      // Keep only textual prompt content for workflow phrase detection.
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      // Normalize prompt fragments before matching workflow triggers.
      .map((part) => part.text.toLowerCase())
      .join(" ")
    if (messageText) {
      // Preserve a prompt-derived SPEC requirement across later edits.
      if (hasWorkflowPhraseSignal(messageText, SPEC_WORKFLOW_PHRASES)) specWorkflowRequired = true
      const observedRisk = classifyObservedWorkflowRisk(messageText)
      const workflowRiskRank = ["small", "normal", "spec-required", "significant", "release-sensitive"]
      if (workflowRisk === null) workflowRisk = observedRisk || "normal"
      else if (observedRisk && workflowRiskRank.indexOf(observedRisk) > workflowRiskRank.indexOf(workflowRisk)) {
        workflowRisk = observedRisk
      }
    }
    for (const part of message.content) {
      if (part?.type !== "tool" || part.state?.status !== "completed") continue
      const toolName = typeof part.name === "string" ? part.name : ""
      const input = toolInput(part)
      if (CODE_EDIT_TOOL_NAMES.has(toolName)) {
        hasRelevantHistory = true
        needsCodeReview = workflowRisk !== "small"
        reviewGeneration += 1
        const hostReference = input?.diffIdentity || input?.commit || ""
        currentReviewReference = hostReference
        currentDiffIdentity = hostReference ? `${hostReference}:edit-${reviewGeneration}` : ""
        validatedDiffIdentity = ""
        reviewedDiffIdentity = ""
        reviewHasFindings = false
        completedWorkflowPhases = new Set()
        continue
      }
      if (toolName === "skill") {
        const skill = canonicalSkillName(input?.id ?? input?.name)
        if (skill === "design") {
          hasRelevantHistory = true
          needsDesignReview = true
        } else if (skill === "design-review") {
          hasRelevantHistory = true
          needsDesignReview = false
        } else if (skill === "spec") {
          specWorkflowRequired = true
          validatedDiffIdentity = ""
        }
        continue
      }
      if (toolName !== "task") continue
      const output = toolOutputText(part)
      const generation = Number(output.match(/review-generation:\s*(\d+)/)?.[1] || 0)
      const diffIdentity = output.match(/\bdiff=([^\s]+)/)?.[1] || ""
      const phase = output.match(/\bphase=(SPEC|INTAKE|PLAN|PLAN_CHECK|EXECUTE|VALIDATE|REVIEW|ITERATE|AUDIT)\b/)?.[1] || ""
      const reviewReference = output.match(/review-reference:\s*([^\s]+)/)?.[1] || ""
      const completedAt = output.match(/review-completed-at:\s*([^\s]+)/)?.[1] || ""
      if (phase === "VALIDATE" && /ASK_WORKFLOW_PASS\b/.test(output)
        && currentDiffIdentity && diffIdentity === currentDiffIdentity) {
        completedWorkflowPhases.add(phase)
        const advancedPlanning = completedWorkflowPhases.has("INTAKE") || completedWorkflowPhases.has("PLAN_CHECK")
        const requiresSpec = specWorkflowRequired || completedWorkflowPhases.has("SPEC")
        const hasRequiredValidation = completedWorkflowPhases.has("PLAN")
          && completedWorkflowPhases.has("EXECUTE") && completedWorkflowPhases.has("VALIDATE")
          && (!advancedPlanning || (completedWorkflowPhases.has("INTAKE") && completedWorkflowPhases.has("PLAN_CHECK")))
          && (!requiresSpec || completedWorkflowPhases.has("SPEC"))
        if (hasRequiredValidation) validatedDiffIdentity = currentDiffIdentity
        continue
      }
      if (["SPEC", "INTAKE", "PLAN", "PLAN_CHECK", "EXECUTE"].includes(phase)
        && /ASK_WORKFLOW_PASS\b/.test(output) && currentDiffIdentity && diffIdentity === currentDiffIdentity) {
        completedWorkflowPhases.add(phase)
        if (phase === "SPEC") specWorkflowRequired = true
        if (["SPEC", "INTAKE", "PLAN_CHECK"].includes(phase)) validatedDiffIdentity = ""
        continue
      }
      if ((/ASK_WORKFLOW_FINDINGS\b/.test(output) || /ASK_WORKFLOW_(BLOCKED|FAILED)\b/.test(output))
        && currentDiffIdentity && diffIdentity === currentDiffIdentity) {
        reviewHasFindings = true
        if (phase === "REVIEW") reviewedDiffIdentity = ""
        if (phase === "VALIDATE") validatedDiffIdentity = ""
        needsCodeReview = workflowRisk !== "small"
        continue
      }
      if (phase === "ITERATE" && /ASK_WORKFLOW_PASS\b/.test(output)
        && currentDiffIdentity && diffIdentity === currentDiffIdentity) {
        reviewHasFindings = false
        validatedDiffIdentity = ""
        completedWorkflowPhases.delete("VALIDATE")
        continue
      }
      if (!/ASK_WORKFLOW_PASS\b/.test(output) || !/ASK_REVIEW_COMPLETE\b/.test(output)) continue
      if (!/review-result:\s*PASS\b/.test(output) || generation !== reviewGeneration
        || !currentDiffIdentity || diffIdentity !== currentDiffIdentity || !completedAt) continue
      if (phase === "REVIEW" && /review-scope:\s*REVIEW\b/.test(output)
        && reviewReference === currentReviewReference && !reviewHasFindings
        && validatedDiffIdentity === currentDiffIdentity) {
        reviewedDiffIdentity = currentDiffIdentity
        needsCodeReview = false
      }
      if (phase === "AUDIT" && /review-scope:\s*final-diff\b/.test(output)
        && reviewReference === currentReviewReference && !reviewHasFindings
        && reviewedDiffIdentity === currentDiffIdentity
        && validatedDiffIdentity === currentDiffIdentity) {
        needsCodeReview = false
      }
    }
  }

  return hasRelevantHistory ? { needsCodeReview, needsDesignReview } : null
}

// Discard malformed or duplicate active-skill records from a server snapshot.
function activeSkillEntries(status) {
  if (!Array.isArray(status?.activeSkills)) return []
  const seen = new Set()
  // Keep items that satisfy the local predicate.
  return status.activeSkills.filter((entry) => {
    const label = entry?.label
    if (typeof label !== "string" || !label) return false
    const skill = typeof entry.skill === "string" && entry.skill ? entry.skill : label
    if (seen.has(skill)) return false
    seen.add(skill)
    return true
  })
}

// Combine the prompt-time snapshot with newer, completed V2 skill tool calls.
export function mergeActiveSkills(status, messages) {
  const observed = loadedSkillEntries(messages)
  // Map each item through the local transformation.
  const snapshot = activeSkillEntries(status).map((entry) => observed.length > 0 ? { ...entry, current: false } : entry)
  // Execute the seen callback.
  const seen = new Set(observed.flatMap((entry) => typeof entry.skill === "string" ? [entry.skill] : []))
  // Keep items that satisfy the local predicate.
  return [...observed, ...snapshot.filter((entry) => typeof entry.skill !== "string" || !seen.has(entry.skill))]
}

// Extract safe pending-obligation labels from the latest server snapshot.
export function pendingItems(status, messages = []) {
  const observed = observedPendingItems(messages)
  const pending = observed
    ? [
      ...(observed.needsCodeReview ? [{ label: "Code review needed" }] : []),
      ...(observed.needsDesignReview ? [{ label: "Design review needed" }] : []),
    ]
    : (Array.isArray(status?.pending) ? status.pending : [])
  return pending
    // Map each item through the local transformation.
    .map((entry) => entry?.label)
    // Keep items that satisfy the local predicate.
    .filter((label) => typeof label === "string" && label.length > 0)
}
