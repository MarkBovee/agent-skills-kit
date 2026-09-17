/** @jsxImportSource @opentui/solid */

import { createMemo, Show } from "solid-js"
import { Plugin, type Context } from "@opencode/plugin/tui"
import { mergeActiveSkills, pendingItems, readStatus } from "./sidebar-status.js"

// OpenCode TUI face for the ASK router package. It renders only the status
// snapshot published by the server router through supported prompt metadata.

type ActiveSkillEntry = {
  skill?: unknown
  label?: unknown
  current?: unknown
}

type AskStatus = {
  activeSkills?: unknown
  pending?: unknown
}

// Read prompt metadata first; completed V2 skill calls are merged separately below.
function sessionStatus(api: Context, sessionID: string): AskStatus | null {
  const messages = api.data.session.message.list(sessionID)
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const status = readStatus(messages[index]?.metadata?.askKit)
    if (status) return status as AskStatus
  }
  return readStatus(api.data.session.get(sessionID)?.metadata?.askKit) as AskStatus | null
}

// Format all active entries into one text node so OpenTUI replaces the list
// atomically when session metadata changes instead of retaining stale children.
function activeSkillText(entries: ActiveSkillEntry[]): string {
  // Map each item through the local transformation.
  return entries.map((entry) => `${entry.current === true ? "●" : "○"} ${entry.label}`).join("\n")
}

// Format pending obligations into one stable text node for the same update path.
function pendingText(items: string[]): string {
  // Map each item through the local transformation.
  return items.map((label) => `→ ${label}`).join("\n")
}

// Present a section header in one shared style so both blocks read as one system.
function SectionHeader(props: { title: string; color: unknown }) {
  return <text fg={props.color}><b>{props.title}</b></text>
}

// Render ASK's compact sidebar panel from reactive session metadata.
function StatusPanel(props: { api: Context; sessionID: string }) {
  // Execute the status callback.
  const status = createMemo(() => sessionStatus(props.api, props.sessionID))
  // Execute the messages callback.
  const messages = createMemo(() => props.api.data.session.message.list(props.sessionID))
  // Execute the active skills callback.
  const activeSkills = createMemo(() => mergeActiveSkills(status(), messages()) as ActiveSkillEntry[])
  // Execute the pending callback.
  const pending = createMemo(() => pendingItems(status(), messages()))

  return (
    <Show when={status()}>
      <box flexDirection="column" gap={1} paddingTop={1} paddingBottom={1}>
        <text fg={props.api.theme.text.action.primary.default}><b>Agent Skills Kit</b></text>
        <box flexDirection="column">
          <SectionHeader title="ACTIVE SKILLS" color={props.api.theme.text.default} />
          <Show when={activeSkills().length > 0} fallback={<text fg={props.api.theme.text.subdued}>No skill loaded</text>}>
            <text fg={props.api.theme.text.feedback.success.default}>{activeSkillText(activeSkills())}</text>
          </Show>
        </box>
        <Show when={pending().length > 0}>
          <box flexDirection="column">
            <SectionHeader title="PENDING" color={props.api.theme.text.default} />
            <text fg={props.api.theme.text.feedback.warning.default}>{pendingText(pending())}</text>
          </box>
        </Show>
      </box>
    </Show>
  )
}

// Register the sidebar slot using OpenCode V2's reactive TUI API.
export default Plugin.define({
  id: "agent-skills-router",
  // Execute this callback within the surrounding workflow.
  setup(api) {
    api.ui.slot({
      append: "sidebar.content",
      // Handle the render callback.
      render: ({ sessionID }) => <StatusPanel api={api} sessionID={sessionID} />,
    })
  },
})
