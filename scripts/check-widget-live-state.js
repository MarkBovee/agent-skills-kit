#!/usr/bin/env node

// Proves the ASK status widget is a live view of router-core state, not a
// prediction. It starts neutral (no active skill, no workflow route, no
// fabricated values) and follows real routing decisions, workflow progression,
// active-skill changes, and review-obligation set/clear transitions across a
// single running session — for both the OpenCode server snapshot and the dsh
// projection widget — with no stale state left behind.

"use strict"

const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const { pathToFileURL } = require("node:url")

const repoRoot = path.resolve(__dirname, "..")
const widgetPath = path.join(repoRoot, "plugins", "dsh-panel-widget", "client.js")
const serverPath = path.join(repoRoot, "plugins", "agent-skills-router", "server.mjs")
const dshPath = path.join(repoRoot, "plugins", "agent-skills-router.dsh.mjs")

let failures = 0

// Record one assertion outcome and keep going so a run reports every drift.
function check(label, ok, detail) {
  if (ok) {
    console.log(`  ok    ${label}`)
    return
  }
  failures += 1
  console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
}

// Wait one macrotask round so the OpenCode plugin's queued persistence lands.
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 5))
}

// Flatten a React test-double tree into visible text for compact UI assertions.
function textOf(node) {
  if (node === null || node === undefined || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  return textOf(node.children)
}

// Minimal synchronous React runtime: enough hooks to mount the widget once and
// re-render it when the projection store notifies, proving live updates without
// a browser.
function createRuntime() {
  const hooks = []
  const effectQueue = []
  let cursor = 0
  let rendering = false
  let dirty = false
  let component = null
  let tree = null

  const sameDeps = (left, right) =>
    Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((v, i) => Object.is(v, right[i]))

  // Read or initialize one hook slot by position across renders.
  function slot() {
    const index = cursor++
    if (hooks[index] === undefined) hooks[index] = {}
    return hooks[index]
  }

  // Store a value in the current hook slot and schedule a re-render.
  function useState(initial) {
    const hook = slot()
    if (!("value" in hook)) hook.value = typeof initial === "function" ? initial() : initial
    const setValue = (next) => {
      hook.value = typeof next === "function" ? next(hook.value) : next
      requestRender()
    }
    return [hook.value, setValue]
  }

  // Stable mutable ref slot, matching React's useRef contract for the widget.
  function useRef(current) {
    const hook = slot()
    if (!("current" in hook)) hook.current = current
    return hook
  }

  // Memoize a callback until its dependency list changes by identity.
  function useCallback(fn, deps) {
    const hook = slot()
    if (!Array.isArray(hook.deps) || !sameDeps(hook.deps, deps)) {
      hook.fn = fn
      hook.deps = deps
    }
    return hook.fn
  }

  // Queue an effect when its dependency list changes, cleaning up the prior run.
  function useEffect(effect, deps) {
    const hook = slot()
    if (!Array.isArray(hook.deps) || !sameDeps(hook.deps, deps)) {
      if (typeof hook.cleanup === "function") hook.cleanup()
      hook.deps = deps
      hook.cleanup = undefined
      effectQueue.push({ hook, effect })
    }
  }

  // Build the shallow element shape the widget's imperative createElement uses.
  function createElement(type, props, ...children) {
    return { type, props: props || {}, children }
  }

  // Drain queued effects; setState during an effect marks the tree dirty.
  function flushEffects() {
    while (effectQueue.length > 0) {
      const { hook, effect } = effectQueue.shift()
      hook.cleanup = effect()
    }
  }

  // Render until stable so effect-driven state updates settle in one pass.
  function renderNow() {
    let guard = 0
    do {
      dirty = false
      rendering = true
      cursor = 0
      effectQueue.length = 0
      tree = component()
      flushEffects()
      rendering = false
      guard += 1
    } while (dirty && guard < 100)
    return tree
  }

  // Coalesce a state update into a synchronous re-render outside an active render.
  function requestRender() {
    if (rendering) {
      dirty = true
      return
    }
    renderNow()
  }

  return { runtime: { useState, useEffect, useRef, useCallback, createElement }, mount: (fn) => { component = fn; return renderNow } }
}

// Build a subscribable projection store and the `face` the widget observes.
function createStore(initial) {
  let value = initial
  const subscribers = new Set()
  return {
    face: {
      getSnapshot: () => value,
      subscribe: (notify) => {
        subscribers.add(notify)
        return () => subscribers.delete(notify)
      },
    },
    set(next) {
      value = next
      for (const notify of subscribers) notify()
    },
  }
}

// Load the shipped widget bundle against a fake React runtime and sessions face.
function loadWidget(runtime, sessionsService) {
  let moduleDefinition
  let registered
  const context = {
    window: { __ModuleLoader__: { load: (definition) => { moduleDefinition = definition } } },
    document: {
      head: { appendChild: () => {} },
      querySelector: () => null,
      createElement: () => ({ dataset: {} }),
    },
  }
  vm.runInNewContext(fs.readFileSync(widgetPath, "utf8"), context, { filename: widgetPath })
  moduleDefinition.factory((name) => (name === "react" ? runtime : undefined)).apply({
    slots: {
      inject: (_slot, register) => register(),
      register: (_definition, render) => { registered = render },
    },
    sessions: sessionsService,
  })
  return registered
}

// Drive the real OpenCode plugin through one session and capture every askKit
// snapshot it persists, proving the snapshot tracks live router-core state.
async function openCodeLifecycle() {
  const { AgentSkillsRouter } = await import(pathToFileURL(serverPath).href)
  const snapshots = []
  let metadata = {}
  const plugin = await AgentSkillsRouter({
    client: {
      session: {
        get: async () => ({ data: { metadata } }),
        update: async (input) => {
          metadata = input.body.metadata
          snapshots.push(input.body.metadata.askKit)
        },
      },
    },
  })
  const sessionID = "live-session"

  await plugin.event({ event: { type: "session.created", properties: { info: { id: sessionID } } } })
  await flush()
  const neutral = snapshots.at(-1)
  check("opencode starts neutral: no skill, no route, no obligations",
    neutral.activeSkill === null && neutral.workflow === null && neutral.pending.length === 0)
  check("opencode exposes no confidence field", !("confidence" in neutral) && !("confidenceDisplay" in neutral))

  await plugin["chat.message"]({ sessionID }, { parts: [{ type: "text", text: "fix this bug in the parser" }] })
  await flush()
  const routed = snapshots.at(-1)
  check("opencode follows the routing decision to debugging", routed.activeSkill === "debugging" && routed.activeSkillLabel === "Debugging")
  check("opencode route comes from the real workflow", Array.isArray(routed.workflow?.route)
    && routed.workflow.route.some((entry) => entry.state === "active"))

  await plugin["tool.execute.after"]({ tool: "task", sessionID }, { output: "ASK_WORKFLOW_PASS phase=PLAN" })
  await flush()
  const progressed = snapshots.at(-1)
  check("opencode follows workflow progression",
    progressed.workflow.completedGates.includes("PLAN")
    && progressed.workflow.route.some((entry) => entry.phase === "PLAN" && entry.state === "completed"))

  await plugin["tool.execute.after"]({ tool: "skill", sessionID }, { args: { name: "spec" } })
  await flush()
  const skillChanged = snapshots.at(-1)
  check("opencode reflects the active-skill change", skillChanged.activeSkill === "spec" && skillChanged.activeSkillLabel === "Spec")
  check("opencode active skill is not stale", skillChanged.activeSkill !== "debugging")

  await plugin["tool.execute.after"]({ tool: "edit", sessionID }, {})
  await flush()
  check("opencode surfaces a code-review obligation", snapshots.at(-1).pending.some((entry) => entry.skill === "code-review"))

  await plugin["tool.execute.after"]({ tool: "skill", sessionID }, { args: { name: "code-review" } })
  await flush()
  const reviewed = snapshots.at(-1)
  check("opencode clears the code-review obligation when its skill loads",
    !reviewed.pending.some((entry) => entry.skill === "code-review"))
  check("opencode arms improvement capture after review", reviewed.pending.some((entry) => entry.skill === "session-review"))

  await plugin["tool.execute.after"]({ tool: "skill", sessionID }, { args: { name: "session-review" } })
  await flush()
  check("opencode clears the last obligation", snapshots.at(-1).pending.length === 0)
  check("every persisted snapshot is whole and self-contained",
    snapshots.every((snapshot) => "activeSkill" in snapshot && "workflow" in snapshot && Array.isArray(snapshot.pending)))
}

// Wire the real dsh router row to a subscribable projection store, render the
// shipped widget, and prove it follows every appended ask-kit/state event.
async function dshWidgetLifecycle() {
  const dsh = await import(pathToFileURL(dshPath).href)
  const listeners = new Map()
  let projectionUnit
  const ctx = {
    on: (name, fn) => { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn) },
    inject: (services, fn) => {
      if (services.length === 1 && services[0] === "sessionProjections") {
        fn({ sessionProjections: { register: (definition) => { projectionUnit = definition } } })
      }
      if (services.length === 1 && services[0] === "commands") {
        fn({ commands: { register: () => {} } })
      }
    },
  }
  dsh.apply(ctx, {})
  const inbox = listeners.get("agent/inbox/inserted")[0]
  const pre = listeners.get("tools/pre-execute")[0]
  const result = listeners.get("tools/result")[0]

  const store = createStore(undefined)
  const { runtime, mount } = createRuntime()
  const sessionsService = {
    binding: (sessionId) => (sessionId === "live"
      ? { session: { projections: { faceOf: (key) => (key === "askKit" ? store.face : undefined) } } }
      : undefined),
  }
  const renderer = loadWidget(runtime, sessionsService)
  const render = mount(() => renderer({ session: { sessionId: "live" } }))
  check("dsh widget hides before any routing event", textOf(render()) === "")

  const appended = []
  const agent = { id: "live", session: { append: (type, data) => appended.push({ type, data }) } }
  // Fold every whole-value event through the real projection unit.
  function pump() {
    let state = projectionUnit.init()
    for (const event of appended) state = projectionUnit.apply(state, event)
    store.set(state)
  }

  await pre({ name: "edit", agent }, async () => ({ kind: "allow" }))
  pump()
  const neutral = textOf(render())
  check("dsh widget renders a neutral panel before routing",
    neutral.includes("Not matched") && neutral.includes("No workflow"))
  check("dsh widget surfaces the real review obligation without a predicted route",
    neutral.includes("PENDING") && neutral.includes("Code review"))
  check("dsh widget never renders a confidence meter", !neutral.includes("CONFIDENCE") && !neutral.includes("%"))

  inbox({ agent, message: { text: "fix this bug in the parser" } })
  pump()
  const routed = textOf(render())
  check("dsh widget follows the routing decision", routed.includes("Bug") || routed.includes("Debugging"))
  check("dsh widget renders the real route", routed.includes("●") && routed.includes("Plan"))

  result({ name: "skill", agent, arguments: { name: "code-review" } }, { isError: false })
  pump()
  const reviewed = textOf(render())
  check("dsh widget clears the review obligation", !reviewed.includes("Code review"))
  check("dsh widget shows the next obligation", reviewed.includes("Capture improvement"))

  result({ name: "skill", agent, arguments: { name: "session-review" } }, { isError: false })
  pump()
  const cleared = textOf(render())
  check("dsh widget hides the pending section when clear", !cleared.includes("PENDING"))

  result({ name: "task", agent }, { isError: false, output: "ASK_WORKFLOW_PASS phase=PLAN" })
  pump()
  const progressed = textOf(render())
  check("dsh widget follows workflow progression", progressed.includes("● Plan"))

  inbox({ agent, message: { text: "design a ui for the dashboard" } })
  pump()
  const skillChanged = textOf(render())
  check("dsh widget follows the active-skill change", skillChanged.includes("Ui Ux") && !skillChanged.includes("Debugging"))
}

async function main() {
  await openCodeLifecycle()
  await dshWidgetLifecycle()

  if (failures > 0) {
    console.error(`\ncheck-widget-live-state: ${failures} failure(s).`)
    process.exitCode = 1
    return
  }
  console.log("\ncheck-widget-live-state: all checks passed.")
}

main().catch((error) => {
  console.error(`check-widget-live-state crashed: ${error && error.stack || error}`)
  process.exit(1)
})
