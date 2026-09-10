/** @jsxImportSource @opentui/solid */

import { createMemo, For, Show } from "solid-js"
import type { TuiPluginApi, TuiPluginModule, TuiThemeCurrent } from "@opencode-ai/plugin/tui"

// OpenCode TUI face for the ASK router package. It renders only the status
// snapshot persisted by the server router in session metadata.

type RouteEntry = {
  phase?: unknown
  label?: unknown
  state?: unknown
}

type AskStatus = {
  activeSkillLabel?: unknown
  confidenceDisplay?: { meter?: unknown; percent?: unknown }
  workflow?: { route?: unknown }
}

// Validate router output at the UI boundary without deriving any status values.
function readStatus(value: unknown): AskStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as AskStatus
}

// Extract the router-owned route list without interpreting its semantics.
function routeEntries(status: AskStatus | null): RouteEntry[] {
  const route = status?.workflow?.route
  return Array.isArray(route) ? (route as RouteEntry[]) : []
}

// Present one router-owned workflow entry using its already calculated state.
function RouteLine(props: { entry: RouteEntry; muted: TuiThemeCurrent["textMuted"]; text: TuiThemeCurrent["text"] }) {
  const state = props.entry.state
  const label = typeof props.entry.label === "string" ? props.entry.label : props.entry.phase
  if (typeof label !== "string" || !["completed", "active", "pending"].includes(String(state))) return null
  return <text fg={state === "pending" ? props.muted : props.text}>{state === "pending" ? "○" : "●"} {label}</text>
}

// Render ASK's compact sidebar panel from persisted session metadata. Reads run
// through memos so the panel appears and updates as the router persists state.
function StatusPanel(props: { api: TuiPluginApi; sessionID: string }) {
  const theme = () => props.api.theme.current
  const status = createMemo(() => readStatus(props.api.state.session.get(props.sessionID)?.metadata?.askKit))
  const route = createMemo(() => routeEntries(status()))
  const confidence = createMemo(() => status()?.confidenceDisplay)
  const activeSkill = createMemo(() => status()?.activeSkillLabel)
  const confidenceText = createMemo(() => {
    const value = confidence()
    return typeof value?.meter === "string" && Number.isFinite(value?.percent as number)
      ? `${value?.meter} ${value?.percent}%`
      : "Unavailable"
  })

  return (
    <Show when={status()}>
      <box flexDirection="column" gap={1} paddingTop={1} paddingBottom={1} paddingLeft={1} paddingRight={1}>
        <text fg={theme().primary}><b>Agent Skills Kit</b></text>
        <text fg={theme().textMuted}>ACTIVE SKILL</text>
        <text fg={theme().text}>{typeof activeSkill() === "string" && activeSkill() ? activeSkill() : "Not matched"}</text>
        <text fg={theme().textMuted}>CONFIDENCE</text>
        <text fg={theme().text}>{confidenceText()}</text>
        <text fg={theme().textMuted}>ROUTING</text>
        <text fg={theme().textMuted}>──────────────</text>
        <box flexDirection="column">
          <Show when={route().length > 0} fallback={<text fg={theme().textMuted}>No workflow</text>}>
            <For each={route()}>{(entry) => <RouteLine entry={entry} muted={theme().textMuted} text={theme().text} />}</For>
          </Show>
        </box>
      </box>
    </Show>
  )
}

// Register the sidebar slot for every session in the running OpenCode TUI.
export async function tui(api: TuiPluginApi) {
  api.slots.register({
    order: 150,
    slots: {
      sidebar_content(_context: unknown, props: { session_id: string }) {
        return <StatusPanel api={api} sessionID={props.session_id} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = { id: "agent-skills-router", tui }

export default plugin
