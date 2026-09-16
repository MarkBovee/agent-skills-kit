/** @jsxImportSource @opentui/solid */

import { createMemo, Show } from "solid-js"
import { Plugin, type Context } from "@opencode/plugin/tui"

// OpenCode TUI face for the ASK router package. It renders only the status
// snapshot published by the server router through supported prompt metadata.

type ActiveSkillEntry = {
  skill?: unknown
  label?: unknown
  current?: unknown
}

type PendingEntry = {
  label?: unknown
}

type AskStatus = {
  activeSkills?: unknown
  pending?: unknown
}

// Validate router output at the UI boundary without deriving any status values.
function readStatus(value: unknown): AskStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as AskStatus
}

// Read the router-owned status from OpenCode's reactive session store.
function sessionStatus(api: Context, sessionID: string): AskStatus | null {
  return readStatus(api.data.session.get(sessionID)?.metadata?.askKit)
}

// Extract router-owned active skills once, protecting the panel from repeated
// records retained by a stale or duplicated session update.
function activeSkillEntries(status: AskStatus | null): ActiveSkillEntry[] {
  if (!Array.isArray(status?.activeSkills)) return []
  const seen = new Set<string>()
  return (status.activeSkills as ActiveSkillEntry[]).filter((entry) => {
    const label = entry?.label
    if (typeof label !== "string" || !label) return false
    const skill = typeof entry.skill === "string" && entry.skill ? entry.skill : label
    if (seen.has(skill)) return false
    seen.add(skill)
    return true
  })
}

// Extract router-owned pending obligation labels for compact sidebar rendering.
function pendingItems(status: AskStatus | null): string[] {
  if (!Array.isArray(status?.pending)) return []
  return (status?.pending as PendingEntry[])
    .map((entry) => entry?.label)
    .filter((label): label is string => typeof label === "string" && label.length > 0)
}

// Format all active entries into one text node so OpenTUI replaces the list
// atomically when session metadata changes instead of retaining stale children.
function activeSkillText(entries: ActiveSkillEntry[]): string {
  return entries.map((entry) => `${entry.current === true ? "●" : "○"} ${entry.label}`).join("\n")
}

// Format pending obligations into one stable text node for the same update path.
function pendingText(items: string[]): string {
  return items.map((label) => `→ ${label}`).join("\n")
}

// Present a section header in one shared style so both blocks read as one system.
function SectionHeader(props: { title: string; muted: unknown }) {
  return <text fg={props.muted}><b>{props.title}</b></text>
}

// Render ASK's compact sidebar panel from reactive session metadata.
function StatusPanel(props: { api: Context; sessionID: string }) {
  const theme = () => props.api.theme
  const status = createMemo(() => sessionStatus(props.api, props.sessionID))
  const activeSkills = createMemo(() => activeSkillEntries(status()))
  const pending = createMemo(() => pendingItems(status()))

  return (
    <Show when={status()}>
      <box flexDirection="column" gap={1} paddingTop={1} paddingBottom={1}>
        <text fg={theme().primary}><b>Agent Skills Kit</b></text>
        <box flexDirection="column">
          <SectionHeader title="ACTIVE SKILLS" muted={theme().textMuted} />
          <Show when={activeSkills().length > 0} fallback={<text fg={theme().textMuted}>No skill loaded</text>}>
            <text fg={theme().text}>{activeSkillText(activeSkills())}</text>
          </Show>
        </box>
        <Show when={pending().length > 0}>
          <box flexDirection="column">
            <SectionHeader title="PENDING" muted={theme().textMuted} />
            <text fg={theme().warning}>{pendingText(pending())}</text>
          </box>
        </Show>
      </box>
    </Show>
  )
}

// Register the sidebar slot using OpenCode V2's reactive TUI API.
export default Plugin.define({
  id: "agent-skills-router",
  setup(api) {
    api.ui.slot({
      append: "sidebar.content",
      render: ({ sessionID }) => <StatusPanel api={api} sessionID={sessionID} />,
    })
  },
})
