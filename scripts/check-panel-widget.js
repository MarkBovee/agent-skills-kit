#!/usr/bin/env node

// Execute the shipped browser bundle against minimal host doubles. This proves
// the widget presents an askKit snapshot and contains no router semantics.

const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const widgetPath = path.resolve(__dirname, "..", "plugins", "dsh-panel-widget", "client.js")
let failures = 0

// Record one assertion outcome and keep running so CI reports all widget drift.
function check(label, ok) {
  if (ok) {
    console.log(`OK: ${label}`)
    return
  }
  failures += 1
  console.error(`FAIL: ${label}`)
}

// Flatten a React test-double tree into visible text for compact UI assertions.
function textOf(node) {
  if (node === null || node === undefined || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  return (node.children || []).map(textOf).join("")
}

// Load the lazy browser module and capture the registered slot renderer.
function loadWidget(snapshot, secondSnapshot) {
  let moduleDefinition
  let registered
  const react = {
    useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
    useEffect: (effect) => { effect() },
    useRef: (current) => ({ current }),
    useCallback: (fn) => fn,
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  }
  const context = {
    window: { __ModuleLoader__: { load: (definition) => { moduleDefinition = definition } } },
    document: {
      head: { appendChild: () => {} },
      querySelector: () => null,
      createElement: () => ({ dataset: {} }),
    },
  }
  vm.runInNewContext(fs.readFileSync(widgetPath, "utf8"), context, { filename: widgetPath })
  const plugin = moduleDefinition.factory((name) => name === "react" ? react : undefined)
  plugin.apply({
    slots: {
      inject: (_slot, register) => register(),
      register: (_definition, render) => { registered = render },
    },
    sessions: {
      binding: (sessionId) => sessionId === "missing" ? undefined : ({ session: { projections: { faceOf: () => ({ getSnapshot: () => sessionId === "second" ? secondSnapshot : snapshot, subscribe: () => () => {} }) } } }),
    },
  })
  return registered
}

// Run widget presentation checks and reject accidental routing logic.
function main() {
  const source = fs.readFileSync(widgetPath, "utf8")
  const renderer = loadWidget({
    activeSkill: "develop",
    activeSkillLabel: "Develop",
    confidence: 0.88,
    confidenceDisplay: { percent: 88, meter: "██████████████████░░" },
    workflow: { route: [{ phase: "PLAN", state: "completed" }, { phase: "EXECUTE", state: "active" }, { phase: "VALIDATE", state: "pending" }] },
  })
  const visible = textOf(renderer({ session: { sessionId: "test" } }))
  check("renders active skill", visible.includes("ACTIVE SKILL") && visible.includes("Develop"))
  check("renders router confidence", visible.includes("CONFIDENCE") && visible.includes("88%"))
  check("renders workflow route", visible.includes("● Plan") && visible.includes("● Execute") && visible.includes("○ Validate"))
  check("renders safe empty state", textOf(loadWidget({})({ session: { sessionId: "empty" } })).includes("Not matched"))
  const terminal = textOf(loadWidget({ activeSkillLabel: "Develop", workflow: { route: [{ phase: "BLOCKED", state: "active" }] } })({ session: { sessionId: "terminal" } }))
  check("renders terminal workflow state", terminal.includes("● Blocked"))
  const sessionRenderer = loadWidget({ activeSkillLabel: "Develop" }, { activeSkillLabel: "Debugging" })
  textOf(sessionRenderer({ session: { sessionId: "first" } }))
  check("missing session projection does not retain prior state", textOf(sessionRenderer({ session: { sessionId: "missing" } })) === "")
  check("does not perform routing", !["cascadeRoute", "buildWorkflowState", "routingConfidence", "matchingPhrases"].some((name) => source.includes(name)))

  if (failures > 0) {
    console.error(`\ncheck-panel-widget: ${failures} failure(s).`)
    process.exitCode = 1
    return
  }
  console.log("\ncheck-panel-widget: all checks passed.")
}

main()
