// Verify the exported router definition and its OpenCode V2 hook registrations.
const { default: plugin } = await import("../plugins/agent-skills-router/server.mjs")

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
if (!prompt.prompt.text.includes("Agent Skills Kit")) throw new Error("prompt hook did not inject router")
if (!prompt.metadata?.askKit || !Array.isArray(prompt.metadata.askKit.activeSkills)) {
  throw new Error("prompt hook did not publish router status through supported metadata")
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
if (!followUp.metadata?.askKit?.activeSkills?.some((entry) => entry.skill === "spec" && entry.current === true)) {
  throw new Error("V2 tool adapter dropped skill input before publishing router status")
}

stopped = true
await cleanup()
console.log("OpenCode V2 plugin checks passed.")
