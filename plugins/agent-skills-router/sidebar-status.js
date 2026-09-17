// Normalize the live OpenCode V2 tool history into the sidebar's compact status shape.

import routerCore from "../../core/router-core.js"

const { isAskSkillName } = routerCore

// Accept only router status records that are safe for presentation.
export function readStatus(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value
}

// Translate native ASK skill identifiers back to the canonical router skill name.
function canonicalSkillName(value) {
  if (typeof value !== "string" || !value) return null
  const skill = value.startsWith("ask-") ? value.slice(4) : value
  return isAskSkillName(skill) ? skill : null
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
      const skill = canonicalSkillName(part.state.input?.id ?? part.state.input?.name)
      if (!skill || seen.has(skill)) continue
      seen.add(skill)
      entries.push({ skill, label: skillLabel(skill), current: entries.length === 0 })
    }
  }
  return entries
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
export function pendingItems(status) {
  if (!Array.isArray(status?.pending)) return []
  return status.pending
    // Map each item through the local transformation.
    .map((entry) => entry?.label)
    // Keep items that satisfy the local predicate.
    .filter((label) => typeof label === "string" && label.length > 0)
}
