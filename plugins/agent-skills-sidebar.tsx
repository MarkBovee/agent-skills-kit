// agent-skills-sidebar - OpenCode TUI plugin that renders a read-only status
// block into the right-hand `sidebar_content` slot (alongside the built-in
// Context/MCP blocks). Shows the active skill + stage color, review debt, and
// the suggested execution profile, all derived live from core/router-core.js.
// Display-only: no focus, keyboard, or mouse handling. Ships as a Solid/opentui
// JSX plugin (`.tsx`) because OpenCode's TUI plugin API renders slot components
// as JSX; the host runtime supplies @opentui/solid + @opencode-ai/plugin/tui.

/** @jsxImportSource @opentui/solid */
import { createMemo, For, Show } from "solid-js"
import { createRequire } from "node:module"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"

const require = createRequire(import.meta.url)

// Locate core/router-core.js across every known layout the file ships in:
// repo source (plugins/), the installed OpenCode plugins dir (./core), and the
// checkout dev copy (.opencode/plugins/). Mirrors the dsh router's resolver.
function resolveRouterCore() {
  const candidates = [
    new URL("./core/router-core.js", import.meta.url).pathname,
    new URL("../core/router-core.js", import.meta.url).pathname,
    new URL("../../core/router-core.js", import.meta.url).pathname,
  ]
  for (const candidate of candidates) {
    try { return require(candidate) } catch { /* try next layout */ }
  }
  throw new Error(
    "agent-skills-sidebar: cannot find router-core.js in any known layout "
    + `(tried ${candidates.join(", ")})`,
  )
}

const routerCore = resolveRouterCore()
const { routingHintLines, buildExecutionProfile, cascadeRoute } = routerCore

// Stage colors mirroring the README platform matrix. Keyed by skill name so the
// Active Stage chip and the skill list share one source of truth.
const STAGE_COLORS = {
  spec: "#7C5CFF", intake: "#7C5CFF",
  debugging: "#e94560", develop: "#e94560",
  "code-review": "#2ecc71", verification: "#2ecc71",
  improve: "#f39c12", "session-review": "#f39c12",
  "agent-workflows": "#1abc9c", "write-skill": "#1abc9c",
  "ui-ux": "#e91e8c", "design-review": "#e91e8c",
  "text-writing": "#8b5cf6",
}
const STAGE_LABELS = {
  spec: "Start", intake: "Start",
  debugging: "Execute", develop: "Execute",
  "code-review": "Validate", verification: "Validate",
  improve: "Improve", "session-review": "Improve",
  "agent-workflows": "Coordinate", "write-skill": "Coordinate",
  "ui-ux": "Product", "design-review": "Product",
  "text-writing": "Write",
}

// Build the 14-skill surface: the 12 decision-tree rows from router-core plus
// the companion skills design-review and gh-inbox that get their own commands.
const SKILLS = [
  ...routingHintLines().map((line) => line.split("→").pop()?.trim()).filter(Boolean),
  "design-review",
  "gh-inbox",
]

// Minimal skill stubs so cascadeRoute can match names without a filesystem scan.
const SKILL_STUBS = SKILLS.map((name) => ({ name, description: "", triggers: [] }))

// Extract the latest plain-text user prompt from a session so routing reflects
// what the user is actually asking; empty string when none is found yet.
function latestUserText(api, sessionID) {
  const messages = api.state.session.messages(sessionID) || []
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message?.role !== "user") continue
    const parts = api.state.part(message.id) || []
    const text = parts
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join(" ")
    if (text.trim()) return text
  }
  return ""
}

// Scan every tool call in the session: a code-edit tool (edit/write/apply_patch)
// arms review debt, a subsequent review skill load clears it. Best-effort and
// defensive about part shapes so an unknown shape degrades to "no debt".
function detectReviewDebt(api, sessionID) {
  const messages = api.state.session.messages(sessionID) || []
  let debt = false
  for (const message of messages) {
    const parts = api.state.part(message?.id) || []
    for (const part of parts) {
      if (part?.type !== "tool") continue
      const tool = part.tool || part.name || ""
      if (["edit", "write", "apply_patch"].includes(tool)) { debt = true; continue }
      if (tool !== "skill") continue
      const input = part.input || part.args || {}
      const loaded = input?.name || input?.skill || ""
      if (["code-review", "verification"].includes(loaded)) debt = false
    }
  }
  return debt
}

// Sidebar block component: Active Stage, review-debt nudge, execution profile,
// and the 14-skill list, all reactive to the current session.
function View(props) {
  const theme = () => props.api.theme.current
  const query = createMemo(() => latestUserText(props.api, props.session_id))
  const route = createMemo(() => {
    const text = query()
    return text.trim() ? cascadeRoute(text, SKILL_STUBS, {}) : null
  })
  const active = createMemo(() => route()?.matchedSkills?.[0]?.name || "none")
  const profile = createMemo(() => {
    const hit = route()
    return hit?.matchedSkills?.[0] ? buildExecutionProfile(hit.matchedSkills[0], query()) : null
  })
  const debt = createMemo(() => detectReviewDebt(props.api, props.session_id))
  const color = (name) => STAGE_COLORS[name] || theme().textMuted
  const stageLabel = (name) => STAGE_LABELS[name] || "Tool"

  return (
    <box
      border
      borderColor={theme().border}
      backgroundColor={theme().backgroundElement}
      paddingTop={1} paddingBottom={1} paddingLeft={1} paddingRight={1}
      flexDirection="column" gap={1}
    >
      <text fg={theme().text}><b>Agent Skills Kit</b></text>

      <box flexDirection="column" gap={0}>
        <text fg={theme().textMuted}><b>Active Stage</b></text>
        <text fg={color(active())}>● {active()}</text>
        <Show when={active() !== "none"} fallback={<text fg={theme().textMuted}>waiting for a prompt</text>}>
          <text fg={theme().textMuted}>stage: {stageLabel(active())}</text>
        </Show>
      </box>

      <box flexDirection="column" gap={0}>
        <text fg={theme().textMuted}><b>Debt</b></text>
        <Show when={debt()} fallback={<text fg={STAGE_COLORS["code-review"]}>✓ no review debt</text>}>
          <text fg={STAGE_COLORS["debugging"]}>⚠️ Review Debt actief</text>
        </Show>
      </box>

      <box flexDirection="column" gap={0}>
        <text fg={theme().textMuted}><b>Execution Profile</b></text>
        <Show when={profile()} fallback={<text fg={theme().textMuted}>task=— · agent=—</text>}>
          <text fg={theme().textMuted}>
            task={profile().executionTier} · agent={profile().agentTier} · {profile().delegationMode}
          </text>
        </Show>
      </box>

      <box flexDirection="column" gap={0}>
        <text fg={theme().textMuted}><b>Skills</b></text>
        <For each={SKILLS}>
          {(name) => <text fg={color(name)}>  {name}</text>}
        </For>
      </box>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 200,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "agent-skills-sidebar",
  tui,
}

export default plugin
