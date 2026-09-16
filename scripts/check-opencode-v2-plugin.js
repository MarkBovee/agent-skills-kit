// Verify the exported router definition and its OpenCode V2 hook registrations.
import { readFile } from "node:fs/promises"

const { default: plugin } = await import("../plugins/agent-skills-router/server.mjs")
const { mergeActiveSkills } = await import("../plugins/agent-skills-router/sidebar-status.js")

if (plugin.id !== "agent-skills-router" || typeof plugin.setup !== "function") {
  throw new Error("router does not export an OpenCode V2 definition")
}

const hooks = { session: {}, tool: {} }
let stopped = false
const context = {
  session: { hook: async (name, callback) => { hooks.session[name] = callback } },
  tool: { hook: async (name, callback) => { hooks.tool[name] = callback } },
  event: {
    subscribe: async function* ({ signal }) {
      while (!signal.aborted && !stopped) await new Promise((resolve) => setTimeout(resolve, 1))
    },
  },
  storage: { set: async () => {} },
}

const cleanup = await plugin.setup(context)
if (typeof hooks.session.prompt !== "function"
  || typeof hooks.tool["execute.before"] !== "function"
  || typeof hooks.tool["execute.after"] !== "function") {
  throw new Error("router did not register required OpenCode V2 hooks")
}

const prompt = { sessionID: "test", prompt: { text: "test" } }
await hooks.session.prompt(prompt)
if (prompt.prompt.text !== "test") throw new Error("prompt hook made router guidance visible in prompt text")
if (!prompt.metadata?.askKit || !Array.isArray(prompt.metadata.askKit.activeSkills)) {
  throw new Error("prompt hook did not publish router status through supported metadata")
}
const contextEvent = { sessionID: "test", system: [] }
await hooks.session.context(contextEvent)
if (!contextEvent.system.some((part) => part.text?.includes("Agent Skills Kit"))) {
  throw new Error("context hook did not inject router guidance into the hidden system context")
}

await hooks.tool["execute.after"]({
  sessionID: "test",
  tool: "skill",
  input: { name: "spec" },
  status: "completed",
  result: { args: { name: "spec" } },
})
const followUp = { sessionID: "test", prompt: { text: "follow up" } }
await hooks.session.prompt(followUp)
if (followUp.prompt.text !== "follow up") throw new Error("follow-up router guidance leaked into prompt text")
if (!followUp.metadata?.askKit?.activeSkills?.some((entry) => entry.skill === "spec" && entry.current === true)) {
  throw new Error("V2 tool adapter dropped skill input before publishing router status")
}

await hooks.tool["execute.after"]({
  sessionID: "test",
  tool: "skill",
  input: { id: "ask-code-review" },
  status: "completed",
  result: {},
})
const skillIDFollowUp = { sessionID: "test", prompt: { text: "show status" } }
await hooks.session.prompt(skillIDFollowUp)
if (!skillIDFollowUp.metadata?.askKit?.activeSkills?.some((entry) => entry.skill === "code-review" && entry.current === true)) {
  throw new Error("V2 tool adapter did not normalize the native ASK skill ID")
}

const liveSkills = mergeActiveSkills(
  { activeSkills: [], pending: [] },
  [{
    type: "assistant",
    content: [{ type: "tool", name: "skill", state: { status: "completed", input: { id: "ask-code-review" } } }],
  }],
)
if (JSON.stringify(liveSkills) !== JSON.stringify([{ skill: "code-review", label: "Code Review", current: true }])) {
  throw new Error("V2 TUI did not recover a completed native skill tool call")
}

const mergedSkills = mergeActiveSkills(
  { activeSkills: [{ skill: "spec", label: "Spec", current: true }], pending: [] },
  [{
    type: "assistant",
    content: [{ type: "tool", name: "skill", state: { status: "completed", input: { id: "ask-code-review" } } }],
  }],
)
if (JSON.stringify(mergedSkills) !== JSON.stringify([
  { skill: "code-review", label: "Code Review", current: true },
  { skill: "spec", label: "Spec", current: false },
])) {
  throw new Error("V2 TUI did not keep exactly one current skill after a live tool call")
}

const tuiSource = await readFile(new URL("../plugins/agent-skills-router/tui.tsx", import.meta.url), "utf8")
const sidebarColors = [
  'title: "#7dd3fc"',
  'section: "#fbbf24"',
  'active: "#86efac"',
  'muted: "#a8a29e"',
  'pending: "#fbbf24"',
]
if (!tuiSource.includes("const COLORS = {") || sidebarColors.some((color) => !tuiSource.includes(color))) {
  throw new Error("OpenCode TUI sidebar does not define its stable color palette")
}
if (tuiSource.includes("props.api.theme")) {
  throw new Error("OpenCode TUI sidebar uses an invalid theme token source that falls back to white")
}

stopped = true
await cleanup()
console.log("OpenCode V2 plugin checks passed.")
