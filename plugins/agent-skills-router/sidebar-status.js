// Normalize the live OpenCode V2 tool history into the sidebar's compact status shape.

// Keep this ESM-only runtime boundary independent from the router's CommonJS core.
// OpenCode's TUI loader does not synthesize CommonJS named exports.
export const ASK_SKILL_NAMES = new Set([
  "agent-workflows", "code-review", "debugging", "deep-research", "design",
  "design-review", "develop", "gh-inbox", "improve", "intake", "observability",
  "research", "session-review", "spec", "text-writing", "verification", "write-skill",
])

const CODE_EDIT_TOOL_NAMES = new Set(["edit", "write", "patch", "apply_patch"])

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

  for (const message of messages) {
    if (!Array.isArray(message?.content)) continue
    for (const part of message.content) {
      if (part?.type !== "tool" || part.state?.status !== "completed") continue
      const toolName = typeof part.name === "string" ? part.name : ""
      const input = toolInput(part)
      if (CODE_EDIT_TOOL_NAMES.has(toolName)) {
        hasRelevantHistory = true
        needsCodeReview = true
        reviewGeneration += 1
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
        }
        continue
      }
      if (toolName !== "task") continue
      const output = toolOutputText(part)
      if (!/ASK_WORKFLOW_PASS\b/.test(output) || !/ASK_REVIEW_COMPLETE\b/.test(output)) continue
      if (!/phase=(?:REVIEW|AUDIT)\b/.test(output) || !/review-result:\s*PASS\b/.test(output)) continue
      const generation = Number(output.match(/review-generation:\s*(\d+)/)?.[1] || 0)
      if (generation === reviewGeneration) needsCodeReview = false
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
