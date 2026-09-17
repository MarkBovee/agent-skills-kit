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
    // Handle the useState callback.
    useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
    // Handle the useEffect callback.
    useEffect: (effect) => { effect() },
    // Handle the useRef callback.
    useRef: (current) => ({ current }),
    // Handle the useCallback callback.
    useCallback: (fn) => fn,
    // Handle the createElement callback.
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  }
  const context = {
    // Handle the window callback.
    window: { __ModuleLoader__: { load: (definition) => { moduleDefinition = definition } } },
    document: {
      // Handle the head callback.
      head: { appendChild: () => {} },
      // Handle the querySelector callback.
      querySelector: () => null,
      // Handle the createElement callback.
      createElement: () => ({ dataset: {} }),
    },
  }
  vm.runInNewContext(fs.readFileSync(widgetPath, "utf8"), context, { filename: widgetPath })
  // Execute the plugin callback.
  const plugin = moduleDefinition.factory((name) => name === "react" ? react : undefined)
  plugin.apply({
    slots: {
      // Handle the inject callback.
      inject: (_slot, register) => register(),
      // Handle the register callback.
      register: (_definition, render) => { registered = render },
    },
    sessions: {
      // Handle the binding callback.
      binding: (sessionId) => sessionId === "missing" ? undefined : ({ session: { projections: { faceOf: () => ({ getSnapshot: () => sessionId === "second" ? secondSnapshot : snapshot, subscribe: () => () => {} }) } } }),
    },
  })
  return registered
}

// Run widget presentation checks and reject accidental routing logic.
function main() {
  const source = fs.readFileSync(widgetPath, "utf8")
  const renderer = loadWidget({
    activeSkills: [{ skill: "develop", label: "Develop", current: true }, { skill: "debugging", label: "Debugging", current: false }],
    pending: [{ flag: "needsCodeReview", skill: "code-review", label: "Code review needed", action: "skill(name: 'code-review')" }],
  })
  const visible = textOf(renderer({ session: { sessionId: "test" } }))
  check("renders active skills", visible.includes("ACTIVE SKILLS") && visible.includes("Develop") && visible.includes("Debugging"))
  check("no longer renders a confidence meter", !visible.includes("CONFIDENCE") && !visible.includes("%"))
  check("does not render workflow", !visible.includes("WORKFLOW") && !visible.includes("Plan"))
  check("renders review pending", visible.includes("PENDING") && visible.includes("Code review needed") && visible.includes("skill(name: 'code-review')"))
  const emptyVisible = textOf(loadWidget({})({ session: { sessionId: "empty" } }))
  check("renders safe empty state", emptyVisible.includes("Not matched"))
  check("hides pending section when no obligations", !emptyVisible.includes("PENDING"))
  const sessionRenderer = loadWidget({ activeSkills: [{ label: "Develop", current: true }] }, { activeSkills: [{ label: "Debugging", current: true }] })
  textOf(sessionRenderer({ session: { sessionId: "first" } }))
  check("missing session projection does not retain prior state", textOf(sessionRenderer({ session: { sessionId: "missing" } })) === "")
  // Test whether any item satisfies the local predicate.
  check("does not perform routing", !["cascadeRoute", "buildWorkflowState", "pendingReviewRequirements", "matchingPhrases", "confidence"].some((name) => source.includes(name)))

  if (failures > 0) {
    console.error(`\ncheck-panel-widget: ${failures} failure(s).`)
    process.exitCode = 1
    return
  }
  console.log("\ncheck-panel-widget: all checks passed.")
}

main()
