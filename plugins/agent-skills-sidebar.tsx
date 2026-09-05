// agent-skills-sidebar - OpenCode TUI plugin that renders a read-only status
// block into the right-hand `sidebar_content` slot (alongside the built-in
// Context/MCP blocks). Shows the last loaded kit skill, review reminders, and
// the skill catalog. Router suggestions are only a fallback before a load.
// Display-only: no focus, keyboard, or mouse handling. Ships as a Solid/opentui
// JSX plugin (`.tsx`) because OpenCode's TUI plugin API renders slot components
// as JSX; the host runtime supplies @opentui/solid + @opencode-ai/plugin/tui.

/** @jsxImportSource @opentui/solid */
import { createMemo, For, Show } from "solid-js"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import vm from "node:vm"
import path from "node:path"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"

// Locate core/router-core.js across every known layout the file ships in:
// repo source (plugins/), the installed OpenCode plugins dir (./core), and the
// checkout dev copy (.opencode/plugins/). Mirrors the dsh router's resolver.
//
// router-core.js is plain CommonJS, but the opencode TUI runtime treats `.js`
// as ESM: require() throws "async module is unsupported" and import() yields an
// empty namespace, so neither reaches its module.exports. Execute the source in
// a sandboxed VM context as CJS instead, reading the populated exports object.
function resolveRouterCore() {
  const candidates = [
    new URL("./core/router-core.js", import.meta.url).pathname,
    new URL("../core/router-core.js", import.meta.url).pathname,
    new URL("../../core/router-core.js", import.meta.url).pathname,
  ]
  for (const candidate of candidates) {
    try {
      const file = candidate
      const code = readFileSync(file, "utf8")
      const module = { exports: {} }
      const sandbox = {
        module,
        exports: module.exports,
        require: createRequire(file),
        __filename: file,
        __dirname: path.dirname(file),
        console,
        process,
        Buffer,
        setTimeout,
        clearTimeout,
        setImmediate,
        URL,
        URLSearchParams,
      }
      vm.runInNewContext(code, sandbox, { filename: file })
      return module.exports as typeof import("../core/router-core")
    } catch { /* try next layout */ }
  }
  throw new Error(
    "agent-skills-sidebar: cannot find router-core.js in any known layout "
    + `(tried ${candidates.join(", ")})`,
  )
}

const routerCore = resolveRouterCore()
const { routingHintLines, cascadeRoute, CODE_EDIT_TOOL_IDS } = routerCore

// Stage colors mirroring the README platform matrix. Keyed by skill name so the
// small catalog markers share one source of truth. Names use theme text colors
// instead: the matrix hex colors are not readable on every terminal theme.
const STAGE_COLORS: Record<string, string> = {
  spec: "#7C5CFF", intake: "#7C5CFF",
  debugging: "#e94560", develop: "#e94560",
  "code-review": "#2ecc71", verification: "#2ecc71",
  improve: "#f39c12", "session-review": "#f39c12",
  "agent-workflows": "#1abc9c", "write-skill": "#1abc9c",
  "ui-ux": "#e91e8c", "design-review": "#e91e8c",
  "text-writing": "#8b5cf6",
}
// Build the 14-skill surface: the 12 decision-tree rows from router-core plus
// the companion skills design-review and gh-inbox that get their own commands.
const SKILLS = [
  // Extract canonical names from the shared routing rows.
  ...routingHintLines().map((line) => line.split("→").pop()?.trim()).filter(Boolean),
  "design-review",
  "gh-inbox",
]

// Minimal routing stubs, not execution metadata or evidence of a skill load.
const SKILL_STUBS = SKILLS.map((name) => ({ name, description: "", triggers: [] }))

const SKILL_LABELS = {
  "agent-workflows": "Agent Workflows",
  "code-review": "Code Review",
  debugging: "Debugging",
  "design-review": "Design Review",
  develop: "Develop",
  "gh-inbox": "GH Inbox",
  improve: "Improve",
  intake: "Intake",
  "session-review": "Session Review",
  spec: "Spec",
  "text-writing": "Text Writing",
  "ui-ux": "UI/UX",
  verification: "Verification",
  "write-skill": "Write Skill",
}

// Normalize host-provided skill names to the kit's lowercase canonical IDs.
function normalizeSkillName(value) {
  if (typeof value !== "string") return ""
  return value.trim().toLowerCase().replace(/^ask-/, "")
}

// Render canonical skill IDs as stable, readable labels in the widget.
function skillLabel(name) {
  return SKILL_LABELS[name] || name
}

// Return completed tool metadata only when host state is complete and usable.
function completedToolState(part) {
  if (part?.type !== "tool" || part?.state?.status !== "completed") return null
  const { input, time } = part.state
  if (!time || typeof time.start !== "number" || typeof time.end !== "number") return null
  return { input: input || {}, start: time.start, end: time.end }
}

// Read prompt, successful kit loads and edit/review timing in one session pass.
// A review started before an edit finished cannot resolve that edit's reminder.
/** @param {TuiPluginApi} api @param {string} sessionID */
function readSidebarSession(api, sessionID) {
  const messages = api.state.session.messages(sessionID) || []
  const loadedSkills = new Set()
  let query = ""
  let lastLoaded = ""
  let lastLoadEnd = -Infinity
  let lastEditEnd = -Infinity
  let lastReviewStart = -Infinity
  for (const message of messages) {
    const parts = api.state.part(message.id) || []
    const promptParts = []
    for (const part of parts) {
      if (message.role === "user" && part.type === "text") promptParts.push(part.text)
      if (message.role !== "assistant") continue
      const state = completedToolState(part)
      if (!state) continue
      const { input, start, end } = state
      if (CODE_EDIT_TOOL_IDS.has(part.tool)) {
        lastEditEnd = Math.max(lastEditEnd, end)
        continue
      }
      if (part.tool !== "skill") continue
      const name = normalizeSkillName(input.name)
      if (!SKILLS.includes(name)) continue
      loadedSkills.add(name)
      if (end >= lastLoadEnd) {
        lastLoaded = name
        lastLoadEnd = end
      }
      if (name === "code-review" || name === "verification") {
        lastReviewStart = Math.max(lastReviewStart, start)
      }
    }
    if (message.role === "user") query = promptParts.join(" ").trim()
  }
  return { query, loadedSkills, lastLoaded, needsReview: lastEditEnd > lastReviewStart }
}

// Keep observed session state prominent and the full catalog quietly scannable.
function View(props: { api: TuiPluginApi; session_id: string }) {
  // Read theme tokens reactively so switching themes never leaves stale colors.
  const theme = () => props.api.theme.current
  // Recompute from this session's reactive messages and tool parts only.
  const session = createMemo(() => readSidebarSession(props.api, props.session_id))
  // A route is a suggestion, never proof that the agent loaded that skill.
  const suggested = createMemo(() => {
    const { query, lastLoaded } = session()
    return !lastLoaded && query ? cascadeRoute(query, SKILL_STUBS, {}).matchedSkills[0]?.name : ""
  })
  // Prefer an observed kit load over the prompt's heuristic match.
  const selected = createMemo(() => session().lastLoaded || suggested())

  return (
    <box paddingTop={1} paddingBottom={1} flexDirection="column" gap={1}>
      {/* Header: inherit the host sidebar surface, without another frame. */}
      <text fg={theme().text}><b>Agent Skills Kit</b></text>

      {/* Session status: observed load or explicitly labelled suggestion. */}
      <box flexDirection="column" gap={0}>
        <Show when={selected()} fallback={<text fg={theme().textMuted}>Waiting for a prompt</text>}>
          <text fg={theme().textMuted}>{session().lastLoaded ? "Last loaded" : "Suggested"}</text>
          <text fg={theme().text}><b>{session().lastLoaded ? "> " : "? "}{skillLabel(selected())}</b></text>
        </Show>
        <Show when={session().needsReview} fallback={<text fg={theme().textMuted}>No review pending</text>}>
          <text fg={theme().warning}>! code-review needed</text>
        </Show>
      </box>

      {/* Catalog: color stays in one small marker column, not entire names. */}
      <box flexDirection="column" gap={0}>
        <text fg={theme().text}><b>Skills</b></text>
        <For each={SKILLS}>
          {/* Markers distinguish the latest load, previous loads and suggestions. */}
          {(name) => (
            <box flexDirection="row">
              <text width={2} flexShrink={0} fg={STAGE_COLORS[name] || theme().textMuted}>
                {name === session().lastLoaded ? ">" : session().loadedSkills.has(name) ? "✓" : name === suggested() ? "?" : "·"}
              </text>
              <text fg={theme().text}>
                <Show when={name === session().lastLoaded} fallback={skillLabel(name)}><b>{skillLabel(name)}</b></Show>
              </text>
            </box>
          )}
        </For>
        <text fg={theme().textMuted}>{session().lastLoaded ? "> loaded   · seen" : "? suggested   · not loaded"}</text>
      </box>
      {/* End status block. */}
    </box>
  )
}

// Register a read-only component in the host's existing sidebar stack.
const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 200,
    slots: {
      // Let session switches update the view through reactive slot props.
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
