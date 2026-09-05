#!/usr/bin/env node

// Exercise the sidebar's real session reader without adding a JSX runtime to CI.
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const { routingHintLines, CODE_EDIT_TOOL_IDS } = require("../core/router-core")

const source = fs.readFileSync(path.join(__dirname, "../plugins/agent-skills-sidebar.tsx"), "utf8")
const reader = source.slice(source.indexOf("// Build the 14-skill surface"), source.indexOf("// Keep observed session state"))
const { readSidebarSession, SKILLS } = vm.runInNewContext(`${reader}\n({ readSidebarSession, SKILLS })`, {
  routingHintLines, CODE_EDIT_TOOL_IDS,
})

// Match the OpenCode SDK's tool-part state shape, including execution timestamps.
function tool({ name = "skill", skill = "develop", status = "completed", start = 1, end = 2 } = {}) {
  return { type: "tool", tool: name, state: { status, input: { name: skill }, time: { start, end } } }
}

// Provide per-session message and part lookups as exposed by the TUI API.
function fixture(sessions) {
  return { state: {
    session: {
      // Preserve message order while allowing independent session switches.
      messages: (id) => sessions[id] || [],
    },
    // Find only the requested message's parts, as the host store does.
    part: (id) => Object.values(sessions).flat().find((message) => message.id === id)?.parts || [],
  } }
}

// Keep test snapshots focused on visible state rather than VM object prototypes.
function snapshot(session) {
  return { ...session, loadedSkills: Array.from(session.loadedSkills) }
}

const empty = { query: "", loadedSkills: [], lastLoaded: "", needsReview: false }
assert.equal(SKILLS.length, 14)
assert.equal(new Set(SKILLS).size, 14)
assert.deepEqual(snapshot(readSidebarSession(fixture({}), "empty")), empty)

const api = fixture({
  first: [
    { id: "u1", role: "user", parts: [{ type: "text", text: "fix the parser" }] },
     { id: "a1", role: "assistant", parts: [tool({ skill: "ASK-DEVELOP" }), tool({ name: "edit", start: 3, end: 4 })] },
  ],
  second: [{ id: "u2", role: "user", parts: [{ type: "text", text: "design" }, { type: "text", text: "a sidebar" }] }],
})
assert.deepEqual(snapshot(readSidebarSession(api, "first")), {
  query: "fix the parser", loadedSkills: ["develop"], lastLoaded: "develop", needsReview: true,
})
assert.deepEqual(snapshot(readSidebarSession(api, "second")), { ...empty, query: "design a sidebar" })
assert.deepEqual(snapshot(readSidebarSession(api, "first")), {
  query: "fix the parser", loadedSkills: ["develop"], lastLoaded: "develop", needsReview: true,
})

const prompts = fixture({ test: [
  { id: "old", role: "user", parts: [{ type: "text", text: "old request" }] },
  { id: "reply", role: "assistant", parts: [{ type: "text", text: "not a request" }] },
  { id: "latest", role: "user", parts: [{ type: "text", text: "new request" }, tool({ name: "edit" })] },
] })
assert.deepEqual(snapshot(readSidebarSession(prompts, "test")), { ...empty, query: "new request" })

// Drive tool-state transitions through the same lookup on every read.
function scan(parts) {
  return readSidebarSession(fixture({ test: [{ id: "a", role: "assistant", parts }] }), "test")
}

for (const status of ["pending", "running", "error"]) {
  assert.deepEqual(snapshot(scan([tool({ status })])), empty)
  assert.equal(scan([tool({ name: "edit", status })]).needsReview, false)
  assert.equal(scan([tool({ name: "edit" }), tool({ skill: "code-review", status, start: 3, end: 4 })]).needsReview, true)
}
for (const name of ["edit", "write", "apply_patch"]) {
  const edit = tool({ name, start: 3, end: 4 })
  assert.equal(scan([edit]).needsReview, true)
  for (const skill of ["code-review", "verification", "ask-code-review"]) {
    assert.equal(scan([edit, tool({ skill, start: 5, end: 6 })]).needsReview, false)
    assert.equal(scan([tool({ skill }), edit]).needsReview, true)
    assert.equal(scan([edit, tool({ skill, start: 1, end: 5 })]).needsReview, true)
    assert.equal(scan([edit, tool({ skill, start: 5, end: 6 }), tool({ name, start: 7, end: 8 })]).needsReview, true)
  }
}

const laterLoad = tool({ skill: "code-review", start: 5, end: 6 })
assert.equal(scan([laterLoad, tool()]).lastLoaded, "code-review", "completion order wins over part order")
assert.deepEqual(snapshot(scan([tool(), tool({ skill: "ask-develop" }), tool({ skill: "external-skill" })])), {
  ...empty, loadedSkills: ["develop"], lastLoaded: "develop",
})
assert.equal(scan([tool({ skill: "gh-inbox" })]).lastLoaded, "gh-inbox")
assert.equal(scan([tool({ skill: "design-review" })]).lastLoaded, "design-review")
assert.deepEqual(snapshot(scan([tool({ skill: 42 })])), empty)

const evolving = tool({ status: "running", skill: "code-review", start: 3, end: 4 })
const parts = [tool({ name: "edit" }), evolving]
assert.equal(scan(parts).needsReview, true)
evolving.state.status = "completed"
assert.equal(scan(parts).needsReview, false)
evolving.state.status = "error"
assert.equal(scan(parts).needsReview, true)
assert.equal(scan(parts).loadedSkills.size, 0)

console.log("Sidebar session checks passed (14 skills, prompts, sessions, tool states, review timing).")
