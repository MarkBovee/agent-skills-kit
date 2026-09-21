#!/usr/bin/env node
// Validates plugins/agent-skills-router.dsh.mjs against core/router-core.js:
// export shape, config defaults, event wiring, decision-tree drift (every row
// must come verbatim from routingHintLines()), the per-skill slash-command
// surface (names, descriptions, steer handler), routing/state smoke behavior,
// and strict-mode tool gating. Exits non-zero on any failure.

"use strict"

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { createRequire } = require("node:module")
const { pathToFileURL } = require("node:url")

const repoRoot = path.resolve(__dirname, "..")
const pluginSourcePath = path.join(repoRoot, "plugins", "agent-skills-router.dsh.mjs")

// Companion skills whose command description must equal commands/<name>.md;
// decision-tree-derived commands are drift-proof by construction.
const COMMAND_DRIFT_SOURCES = [
  ["design-review"],
  ["gh-inbox"],
]

let failures = 0

// Record one assertion outcome and keep going so one run reports everything.
function check(label, ok, detail) {
  if (ok) {
    console.log(`  ok    ${label}`)
  } else {
    failures += 1
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

// Record whether one function throws, for schema boundary assertions.
function throws(fn) {
  try {
    fn()
    return false
  } catch {
    return true
  }
}

// Run this script's complete validation workflow.
async function main() {
  const routerCore = createRequire(__filename)(path.join(repoRoot, "core", "router-core.js"))

  // The plugin must stay dependency-free: its source contains no bare
  // specifiers and therefore loads out-of-tree as-is, exactly like the
  // installed preset row does inside dsh.
  const source = fs.readFileSync(pluginSourcePath, "utf8")
  const prototypeSource = fs.readFileSync(path.join(repoRoot, "plugins", "dsh-panel-prototype", "host.js"), "utf8")

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "ask-dsh-plugin-"))
  const pluginCopy = path.join(workDir, "plugins", "ask-kit-router.mjs")
  fs.mkdirSync(path.join(workDir, "plugins"), { recursive: true })
  fs.mkdirSync(path.join(workDir, "vendor"), { recursive: true })
  fs.writeFileSync(pluginCopy, source)
  // Mirror the installed preset layout so the vendor fallback resolves.
  fs.copyFileSync(path.join(repoRoot, "core", "router-core.js"), path.join(workDir, "vendor", "router-core.js"))

  try {
    const mod = await import(pathToFileURL(pluginCopy).href)

    check("exports name/inject/apply", typeof mod.name === "string" && Array.isArray(mod.inject) && typeof mod.apply === "function")
    check("hard-injects systemPrompt", mod.inject.includes("systemPrompt"))
    check("stays dependency-free (no Config schema export)", mod.Config === undefined)
    check("prototype tracks native patch edits", prototypeSource.includes("new Set(['edit', 'write', 'patch', 'apply_patch'])"))

    const listeners = new Map()
    const commands = []
    const projections = []
    const ctx = {
      // Handle the on callback.
      on: (name2, fn) => { if (!listeners.has(name2)) listeners.set(name2, []); listeners.get(name2).push(fn) },
      // Capture the lazy commands injection so the slash-command surface is
      // testable without a live Cordis tree.
      inject: (services, fn) => {
        if (services.length === 1 && services[0] === "commands") {
          // Execute this callback within the surrounding workflow.
          fn({ commands: { register: (definition) => commands.push(definition) } })
        }
        // Capture the lazy sessionProjections injection so the panel state
        // bridge is testable without a live registry.
        if (services.length === 1 && services[0] === "sessionProjections") {
          // Execute this callback within the surrounding workflow.
          fn({ sessionProjections: { register: (definition) => projections.push(definition) } })
        }
      },
    }
    mod.apply(ctx, { blockUntilSkillLoaded: true })
    for (const expected of ["agent/inbox/inserted", "tools/pre-execute", "tools/result", "system-prompt/assemble"]) {
      check(`registers ${expected}`, listeners.has(expected))
    }

    // Slash-command surface: one command per kit skill, names unique and
    // grammar-clean, descriptions derived from the decision-tree rows plus the
    // companion table (which must not drift from commands/<name>.md).
    const hintNames = routerCore.routingHintLines().map((line) => line.split("→").pop().trim())
    const expectedNames = [...hintNames, "design-review", "gh-inbox"]
    check("registers one command per kit skill", commands.length === expectedNames.length,
      `got ${commands.length}, want ${expectedNames.length}`)
    // Test whether any item satisfies the local predicate.
    check("command names match kit skills", expectedNames.every((n) => commands.some((c) => c.name === n))
      // Map each item through the local transformation.
      && new Set(commands.map((c) => c.name)).size === commands.length)
    // Test whether any item satisfies the local predicate.
    check("command surface includes research workflows", commands.some((c) => c.name === "research")
      // Test whether any item satisfies the local predicate.
      && commands.some((c) => c.name === "deep-research"))
    check("command names are lowercase grammar-clean",
      // Verify every item satisfies the local condition.
      commands.every((c) => /^[a-z0-9][a-z0-9_-]*$/.test(c.name)))
    for (const [skill] of COMMAND_DRIFT_SOURCES) {
      // Find the first item that matches the local condition.
      const def = commands.find((c) => c.name === skill)
      const md = fs.readFileSync(path.join(repoRoot, "commands", `${skill}.md`), "utf8")
      const match = md.match(/^description:\s*(.+)$/m)
      check(`companion description matches commands/${skill}.md`, Boolean(def && match && def.description === match[1].trim()),
        def ? `"${def.description}"` : "missing definition")
    }
    if (commands.length > 0) {
      // Guarded lookups: a vanished command must FAIL cleanly, not crash main.
      const debugging = commands.find((c) => c.name === "debugging")
      // Find the first item that matches the local condition.
      const spec = commands.find((c) => c.name === "spec")
      check("behavior-test commands exist", Boolean(debugging && spec))
      if (debugging && spec) {
        const steered = []
        const result = debugging.handler({
          // Handle the agent callback.
          agent: { steer: (msg) => steered.push(msg) },
          rawInput: "login crash bij start",
        })
        const msg = steered[0]
        const steeredText = msg?.content?.[0]?.text ?? ""
        check("handler steers a load-the-skill prompt", steered.length === 1
          && steeredText.includes("'debugging'") && steeredText.includes("Apply it to: login crash bij start"))
        // The loop forwards inbox items verbatim into the model request, so the
        // steered value must be a full user message, not a bare string.
        check("steered payload is a proper user message", Boolean(msg) && typeof msg === "object"
          && msg.role === "user" && typeof msg.id === "string" && msg.id.length > 0
          && Array.isArray(msg.content) && msg.content[0]?.type === "text"
          && typeof msg.source?.kind === "string")
        check("handler reports success", result && result.kind === "success" && result.text.includes("debugging"))
        const bare = spec.handler({
          // Handle the agent callback.
          agent: { steer: (msg2) => steered.push(msg2) },
          rawInput: "   ",
        })
        check("bare invocation omits focus clause", steered.length === 2
          && !steered[1].content[0].text.includes("Apply it to:") && bare.kind === "success")
        const failed = debugging.handler({
          // Handle the agent callback.
          agent: { steer: () => { throw new Error("boom") } },
          rawInput: "",
        })
        check("handler reports error when steer throws", failed.kind === "error" && failed.text.includes("boom"))
      }
    }

    // Strict-mode gate denies bash before any skill load, allows after one.
    const pre = listeners.get("tools/pre-execute")[0]
    const assemble = listeners.get("system-prompt/assemble")[0]
    const agent = { id: "gate-check" }
    // Execute the denied callback.
    const denied = await pre({ name: "bash", agent }, async () => ({ kind: "allow" }))
    check("strict gate denies before skill load", denied && denied.kind === "deny")
    const foreignSkillAgent = { id: "foreign-skill-gate-check" }
    listeners.get("tools/result")[0](
      { name: "skill", agent: foreignSkillAgent, arguments: { name: "azure-deploy" } },
      { isError: false },
    )
    // Execute the foreign denied callback.
    const foreignDenied = await pre({ name: "bash", agent: foreignSkillAgent }, async () => ({ kind: "allow" }))
    check("strict gate ignores non-ASK skill loads", foreignDenied && foreignDenied.kind === "deny")
    const deniedPatchAgent = { id: "denied-patch-gate-check" }
    // Simulate the host refusing an edit before any ASK skill was loaded.
    const deniedPatch = await pre({ name: "patch", agent: deniedPatchAgent }, async () => ({ kind: "allow" }))
    // Render the rejected session to prove no review obligation was persisted.
    const deniedPatchAssembly = await assemble({ sections: [] }, { agent: deniedPatchAgent }, async () => ({ sections: [] }))
    // Extract the router-owned section from the rejected session snapshot.
    const deniedPatchText = deniedPatchAssembly.sections.find((entry) => entry.name === "ask-kit:router")?.text || ""
    check("strict gate denies patch without creating review debt", deniedPatch?.kind === "deny" && !deniedPatchText.includes("→ Code edited"))
    listeners.get("tools/result")[0](
      { name: "skill", agent, arguments: { name: "deep-research" } },
      { isError: false, output: "ASK_WORKFLOW_PASS phase=RESEARCH" },
    )
    // Execute the allowed callback.
    const allowed = await pre({ name: "bash", agent }, async () => ({ kind: "allow" }))
    check("strict gate allows after marker-bearing skill load", allowed && allowed.kind === "allow")

    // Beslisboom drift: every canonical router-core row appears verbatim.
    const inbox = listeners.get("agent/inbox/inserted")[0]
    // Execute the deep research state callback.
    const deepResearchState = await assemble({ sections: [] }, { agent }, async () => ({ sections: [] }))
    // Find the first item that matches the local condition.
    const deepResearchText = deepResearchState.sections.find((entry) => entry.name === "ask-kit:router")?.text || ""
    check("skill marker example does not bypass deep-research load tracking", deepResearchText.includes("Active: deep-research"))
    inbox({ agent, message: { text: "er is een bug, crash bij start" } })
    // Execute the assembly callback.
    const assembly = await assemble({ sections: [] }, { agent }, async () => ({ sections: [] }))
    // Find the first item that matches the local condition.
    const section = assembly.sections.find((entry) => entry.name === "ask-kit:router")
    check("injects ask-kit:router section", Boolean(section))
    if (section) {
      const hintLines = routerCore.routingHintLines()
      for (const line of hintLines) {
        const isDevelopFallback = line.endsWith("→ develop")
        const expected = !isDevelopFallback
        check(`decision-tree row derives from router-core (${line.split("→").pop().trim()})`, section.text.includes(line) === expected)
      }
    }

    // Develop remains visible only as a user-facing fallback before a specific
    // match or loaded skill exists; it is still the internal route fallback.
    const freshAgent = { id: "fresh-overview" }
    // Execute the fresh assembly callback.
    const freshAssembly = await assemble({ sections: [] }, { agent: freshAgent }, async () => ({ sections: [] }))
    // Find the first item that matches the local condition.
    const freshSection = freshAssembly.sections.find((entry) => entry.name === "ask-kit:router")
    check("empty session shows develop fallback", Boolean(freshSection) && freshSection.text.includes("Normal software work (default) → develop"))
    check("specific match hides develop fallback", Boolean(section) && !section.text.includes("Normal software work (default) → develop"))

    // Routing smoke: a Dutch debugging prompt lands on debugging.
    const agent2 = { id: "route-check" }
    inbox({ agent: agent2, message: { text: "fout opsporen: waarom werkt de login niet" } })
    // Execute the routed callback.
    const routed = await assemble({ sections: [] }, { agent: agent2 }, async () => ({ sections: [] }))
    // Find the first item that matches the local condition.
    const routedSection = routed.sections.find((entry) => entry.name === "ask-kit:router")
    check("cascade routes Dutch bug phrase to debugging", Boolean(routedSection) && routedSection.text.includes("Active: debugging"))
    check("dsh exposes lifecycle risk and phase", Boolean(routedSection)
      && routedSection.text.includes("Workflow:") && routedSection.text.includes("risk=normal"))

    // Tool-injected contexts (leading tool-result blocks) must not flip routing.
    const agentCtx = { id: "ctx-check" }
    inbox({ agent: agentCtx, message: { content: [{ type: "tool-result", toolCallId: "t1", content: [] }, { type: "text", text: "er is een bug" }] } })
    // Execute the ctx assembly callback.
    const ctxAssembly = await assemble({ sections: [] }, { agent: agentCtx }, async () => ({ sections: [] }))
    // Find the first item that matches the local condition.
    const ctxSection = ctxAssembly.sections.find((entry) => entry.name === "ask-kit:router")
    check("tool-injected context does not route", Boolean(ctxSection) && !ctxSection.text.includes("Active:"))

    // Review-debt machinery mirrors router-core's own nudge wording.
    const agent3 = { id: "flip-check" }
    listeners.get("tools/result")[0]({ name: "skill", agent: agent3, arguments: { name: "develop" } }, { isError: false })
    // Execute this callback within the surrounding workflow.
    await pre({ name: "patch", agent: agent3, diffIdentity: "HEAD" }, async () => ({ kind: "allow" }))
    // Execute the flagged callback.
    const flagged = await assemble({ sections: [] }, { agent: agent3 }, async () => ({ sections: [] }))
    // Find the first item that matches the local condition.
    const flaggedText = flagged.sections.find((entry) => entry.name === "ask-kit:router").text
    const coreDebtOverview = routerCore.reviewNudgeLines({
      needsCodeReview: true, needsDesignReview: false,
      shouldCaptureImprovement: false, interactionCountSinceSkillLoad: 0, skillsLoadedCount: 1,
    }, (name) => `\`skill(name: '${name}')\``).join("\n")
    // Keep items that satisfy the local predicate.
    for (const line of coreDebtOverview.split("\n").filter((l) => l.startsWith("→"))) {
      check(`nudge derives from router-core (${line.slice(0, 40)}…)`, flaggedText.includes(line))
    }
    listeners.get("tools/result")[0]({ name: "skill", agent: agent3, arguments: { name: "code-review" } }, { isError: false })
    // Execute the cleared callback.
    const cleared = await assemble({ sections: [] }, { agent: agent3 }, async () => ({ sections: [] }))
    // Find the first item that matches the local condition.
    const clearedText = cleared.sections.find((entry) => entry.name === "ask-kit:router").text
      check("code-review load preserves review nudge", clearedText.includes("→ Code edited"))
    check("code-review load arms improvement capture", clearedText.includes("→ Improvement found?"))
    listeners.get("tools/result")[0]({ name: "skill", agent: agent3, arguments: { name: "session-review" } }, { isError: false })
    // Execute the improvement cleared callback.
    const improvementCleared = await assemble({ sections: [] }, { agent: agent3 }, async () => ({ sections: [] }))
    // Find the first item that matches the local condition.
    const improvementClearedText = improvementCleared.sections.find((entry) => entry.name === "ask-kit:router").text
    check("session-review load clears improvement nudge", !improvementClearedText.includes("→ Improvement found?"))

    // Delegated review completion clears parent debt through its explicit handoff marker.
    const delegatedAgent = { id: "delegated-review-check" }
    listeners.get("tools/result")[0]({ name: "skill", agent: delegatedAgent, arguments: { name: "develop" } }, { isError: false })
    // Execute this callback within the surrounding workflow.
    await pre({ name: "edit", agent: delegatedAgent, diffIdentity: "HEAD" }, async () => ({ kind: "allow" }))
    // Execute the delegated before callback.
    const delegatedBefore = await assemble({ sections: [] }, { agent: delegatedAgent }, async () => ({ sections: [] }))
    // Find the first item that matches the local condition.
    check("delegated review starts with code-review nudge", delegatedBefore.sections.find((entry) => entry.name === "ask-kit:router").text.includes("→ Code edited"))
    inbox({ agent: delegatedAgent, message: { text: "quoted marker ASK_REVIEW_COMPLETE" } })
    // Execute the quoted marker callback.
    const quotedMarker = await assemble({ sections: [] }, { agent: delegatedAgent }, async () => ({ sections: [] }))
    // Find the first item that matches the local condition.
    check("user marker quote does not clear parent nudge", quotedMarker.sections.find((entry) => entry.name === "ask-kit:router").text.includes("→ Code edited"))
    listeners.get("tools/result")[0](
      { name: "task", agent: delegatedAgent },
      { isError: false, output: "ASK_WORKFLOW_PASS phase=REVIEW\nreview-generation: 1\nreview-scope: REVIEW\nreview-reference: HEAD\nreview-completed-at: 2026-09-16T12:00:00Z\nreview-result: PASS\nASK_REVIEW_COMPLETE" },
    )
    // Execute the delegated after callback.
    const delegatedAfter = await assemble({ sections: [] }, { agent: delegatedAgent }, async () => ({ sections: [] }))
    // Find the first item that matches the local condition.
    check("delegated review completion clears parent nudge", !delegatedAfter.sections.find((entry) => entry.name === "ask-kit:router").text.includes("→ Code edited"))
    // Execute this callback within the surrounding workflow.
    await pre({ name: "edit", agent: delegatedAgent, diffIdentity: "HEAD" }, async () => ({ kind: "allow" }))
    listeners.get("tools/result")[0](
      { name: "task", agent: delegatedAgent },
      { isError: false, output: "ASK_WORKFLOW_PASS phase=REVIEW\nreview-generation: 2\nreview-scope: REVIEW\nreview-reference: HEAD\nreview-completed-at: 2026-09-16T12:00:00Z\nreview-result: PASS\nASK_REVIEW_COMPLETE" },
    )
    // Execute the combined delegated after callback.
    const combinedDelegatedAfter = await assemble({ sections: [] }, { agent: delegatedAgent }, async () => ({ sections: [] }))
    // Find the first item that matches the local condition.
    check("combined review evidence and marker clear parent nudge", !combinedDelegatedAfter.sections.find((entry) => entry.name === "ask-kit:router").text.includes("→ Code edited"))
    // Execute this callback within the surrounding workflow.
    await pre({ name: "edit", agent: delegatedAgent, diffIdentity: "HEAD" }, async () => ({ kind: "allow" }))
    listeners.get("tools/result")[0](
      { name: "task", agent: delegatedAgent },
      { isError: false, output: "ASK_WORKFLOW_FINDINGS phase=REVIEW\nreview-generation: 3\nreview-scope: REVIEW\nreview-reference: HEAD\nreview-completed-at: 2026-09-16T12:00:00Z\nreview-result: PASS\nASK_REVIEW_COMPLETE" },
    )
    // Execute the failed review after callback.
    const failedReviewAfter = await assemble({ sections: [] }, { agent: delegatedAgent }, async () => ({ sections: [] }))
      // Find the first item that matches the local condition.
      check("non-passing review marker keeps parent nudge", failedReviewAfter.sections.find((entry) => entry.name === "ask-kit:router").text.includes("→ Code edited"))
      listeners.get("tools/result")[0](
        { name: "task", agent: delegatedAgent },
        { isError: false, output: "ASK_WORKFLOW_PASS phase=AUDIT\nreview-generation: 3\nreview-scope: final-diff\nreview-reference: HEAD\nreview-completed-at: 2026-09-16T12:00:00Z\nreview-result: PASS\nASK_REVIEW_COMPLETE" },
      )
      // Execute the final diff audit after callback.
      const finalDiffAuditAfter = await assemble({ sections: [] }, { agent: delegatedAgent }, async () => ({ sections: [] }))
      // Find the first item that matches the local condition.
      check("audit of final diff clears parent nudge", !finalDiffAuditAfter.sections.find((entry) => entry.name === "ask-kit:router").text.includes("→ Code edited"))
      // Execute this callback within the surrounding workflow.
      await pre({ name: "edit", agent: delegatedAgent, diffIdentity: "HEAD" }, async () => ({ kind: "allow" }))
    // Execute the delegated rearmed callback.
    const delegatedRearmed = await assemble({ sections: [] }, { agent: delegatedAgent }, async () => ({ sections: [] }))
    // Find the first item that matches the local condition.
    check("edit after delegated review re-arms nudge", delegatedRearmed.sections.find((entry) => entry.name === "ask-kit:router").text.includes("→ Code edited"))

    // Wrap-up steering: a completion phrase with pending review debt steers
    // the agent toward the matching review skill (once per episode) instead
    // of silently clearing the nudge — the chip stays until the review loads.
    const steered = []
    // Execute the steer agent callback.
    const steerAgent = { id: "steer-check", steer: (msg) => steered.push(msg) }
    listeners.get("tools/result")[0]({ name: "skill", agent: steerAgent, arguments: { name: "develop" } }, { isError: false })
    // Execute this callback within the surrounding workflow.
    await pre({ name: "edit", agent: steerAgent, diffIdentity: "HEAD" }, async () => ({ kind: "allow" }))
    inbox({ agent: steerAgent, message: { text: "ik ben klaar" } })
    const firstSteerText = steered[0]?.content?.[0]?.text ?? ""
    check("completion steers code-review once", steered.length === 1 && firstSteerText.includes("'code-review'"))
    inbox({ agent: steerAgent, message: { text: "nogmaals klaar" } })
    check("repeat completion does not re-steer", steered.length === 1)
    // Execute the steered assembly callback.
    const steeredAssembly = await assemble({ sections: [] }, { agent: steerAgent }, async () => ({ sections: [] }))
    // Find the first item that matches the local condition.
    const steeredText = steeredAssembly.sections.find((entry) => entry.name === "ask-kit:router").text
    check("completion keeps review nudge armed", steeredText.includes("→ Code edited"))
    listeners.get("tools/result")[0]({ name: "skill", agent: steerAgent, arguments: { name: "code-review" } }, { isError: false })
    // Execute the after steer review callback.
    const afterSteerReview = await assemble({ sections: [] }, { agent: steerAgent }, async () => ({ sections: [] }))
    // Find the first item that matches the local condition.
    const afterSteerReviewText = afterSteerReview.sections.find((entry) => entry.name === "ask-kit:router").text
     check("code-review load preserves review debt", afterSteerReviewText.includes("→ Code edited"))
    check("code-review load arms improvement after steer", afterSteerReviewText.includes("→ Improvement found?"))
     listeners.get("tools/result")[0]({ name: "task", agent: steerAgent }, { isError: false, output: "ASK_WORKFLOW_PASS phase=REVIEW\nreview-generation: 1\nreview-scope: REVIEW\nreview-reference: HEAD\nreview-completed-at: 2026-09-16T12:00:00Z\nreview-result: PASS\nASK_REVIEW_COMPLETE" })
     inbox({ agent: steerAgent, message: { text: "klaar" } })
    const secondSteerText = steered[1]?.content?.[0]?.text ?? ""
    check("completion steers session-review once", steered.length === 2 && secondSteerText.includes("'session-review'"))
    // write-skill resolves improvement intent, so a fresh improvement episode
    // later can steer toward session-review again.
    const steeredWrite = []
    // Execute the write agent callback.
    const writeAgent = { id: "steer-check3", steer: (msg) => steeredWrite.push(msg) }
    listeners.get("tools/result")[0]({ name: "skill", agent: writeAgent, arguments: { name: "verification" } }, { isError: false })
    inbox({ agent: writeAgent, message: { text: "klaar" } })
    check("improvement steers session-review before write-skill", steeredWrite.length === 1)
    listeners.get("tools/result")[0]({ name: "skill", agent: writeAgent, arguments: { name: "write-skill" } }, { isError: false })
    listeners.get("tools/result")[0]({ name: "skill", agent: writeAgent, arguments: { name: "verification" } }, { isError: false })
    inbox({ agent: writeAgent, message: { text: "klaar" } })
    check("write-skill resets session-review steer guard", steeredWrite.length === 2)
    // Design debt: loading design arms design-review, completion steers it.
    const designSteered = []
    // Execute the design agent callback.
    const designAgent = { id: "steer-check2", steer: (msg) => designSteered.push(msg) }
    listeners.get("tools/result")[0]({ name: "skill", agent: designAgent, arguments: { name: "design" } }, { isError: false })
    inbox({ agent: designAgent, message: { text: "done" } })
    const designSteerText = designSteered[0]?.content?.[0]?.text ?? ""
    check("completion steers design-review once", designSteered.length === 1 && designSteerText.includes("'design-review'"))

    // Panel state bridge (dsh-panel-widget): mutations append whole-value
    // ask-kit/state events and the askKit projection unit folds them.
    check("registers askKit projection unit", projections.length === 1
      && projections[0].key === "askKit" && typeof projections[0].apply === "function")
    if (projections.length === 1) {
      const unit = projections[0]
      const appended = []
      // Execute the bridge agent callback.
      const bridgeAgent = { id: "bridge-check", session: { append: (type, data) => appended.push({ type, data }) } }
      listeners.get("tools/result")[0]({ name: "skill", agent: bridgeAgent, arguments: { name: "develop" } }, { isError: false })
      // Before any real routing decision a permitted mutation preserves the
      // loaded skill and has no predicted workflow route.
      await pre({ name: "edit", agent: bridgeAgent, diffIdentity: "HEAD" }, async () => ({ kind: "allow" }))
      const neutralView = appended.at(-1)?.data
      // Verify the explicit skill load is retained without fabricating a workflow route.
      const neutralHasDevelop = neutralView?.activeSkills.some((entry) => entry.skill === "develop")
      check("pre-route panel view carries no predicted workflow", Boolean(neutralView)
          && neutralHasDevelop && !("workflow" in neutralView))
      // A real prompt establishes the route, then the skill load updates it.
      inbox({ agent: bridgeAgent, message: { text: "design a ui for the dashboard" } })
      listeners.get("tools/result")[0]({ name: "skill", agent: bridgeAgent, arguments: { name: "design" } }, { isError: false })
      check("mutations append whole-value panel events", appended.length >= 3
        // Verify every item satisfies the local condition.
        && appended.every((event) => event.type === "ask-kit/state"))
      let state = unit.init()
      for (const event of appended) state = unit.apply(state, event)
      check("fold lands on the last whole value", state !== null && state.needsDesignReview === true
        && Array.isArray(state.loadedSkills) && state.loadedSkills.includes("design"))
       // Test whether any item satisfies the local predicate.
       check("panel event exposes router-owned active skill", state.activeSkills.some((entry) => entry.skill === "design" && entry.current))
       check("panel event exposes both review obligations", Array.isArray(state.pending)
         // Test whether any item satisfies the local predicate.
         && state.pending.some((entry) => entry.skill === "code-review")
         // Test whether any item satisfies the local predicate.
         && state.pending.some((entry) => entry.skill === "design-review"))
       // Test whether any item satisfies the local predicate.
       check("panel event exposes active skills without workflow", state.activeSkills.some((entry) => entry.skill === "design" && entry.current)
         && !("workflow" in state))
      // Loading the obligation's skill clears it from the live snapshot.
      listeners.get("tools/result")[0]({ name: "skill", agent: bridgeAgent, arguments: { name: "design-review" } }, { isError: false })
      state = unit.apply(state, appended.at(-1))
      // Test whether any item satisfies the local predicate.
      check("completed design review clears its pending obligation", !state.pending.some((entry) => entry.skill === "design-review"))
       listeners.get("tools/result")[0]({ name: "skill", agent: bridgeAgent, arguments: { name: "code-review" } }, { isError: false })
       state = unit.apply(state, appended.at(-1))
       // Test whether any item satisfies the local predicate.
       check("code-review load preserves review debt", state.pending.some((entry) => entry.skill === "code-review"))
       listeners.get("tools/result")[0](
         { name: "task", agent: bridgeAgent },
         { isError: false, output: "ASK_WORKFLOW_PASS phase=REVIEW\nreview-generation: 1\nreview-scope: REVIEW\nreview-reference: HEAD\nreview-completed-at: 2026-09-16T12:00:00Z\nreview-result: PASS\nASK_REVIEW_COMPLETE" },
       )
       state = unit.apply(state, appended.at(-1))
       // Test whether any item satisfies the local predicate.
       check("completed code review clears review debt", !state.pending.some((entry) => entry.skill === "code-review"))
      listeners.get("tools/result")[0]({ name: "skill", agent: bridgeAgent, arguments: { name: "session-review" } }, { isError: false })
      state = unit.apply(state, appended.at(-1))
      check("capturing the improvement leaves no pending obligations", state.pending.length === 0)
      check("schema accepts the folded view", unit.schema.parse(state) === state)
      check("schema accepts null (pre-first-event)", unit.schema.parse(null) === null)
      // Execute this callback within the surrounding workflow.
      check("schema rejects non-object views", throws(() => unit.schema.parse(42)))
      check("non-panel events leave state untouched",
        unit.apply(state, { type: "todo/write", data: {} }) === state)
      check("malformed payload cannot poison the fold",
        unit.apply(state, { type: "ask-kit/state", data: { loadedSkills: "nope" } }) === state)
      // The edit flip publishes only on false→true so repeat edits stay quiet.
      const dedupeAppended = []
      // Execute the dedupe agent callback.
      const dedupeAgent = { id: "dedupe-check", session: { append: (type, data) => dedupeAppended.push({ type, data }) } }
      listeners.get("tools/result")[0]({ name: "skill", agent: dedupeAgent, arguments: { name: "develop" } }, { isError: false })
      // Execute this callback within the surrounding workflow.
      await pre({ name: "edit", agent: dedupeAgent, diffIdentity: "HEAD" }, async () => ({ kind: "allow" }))
      const afterFirstEdit = dedupeAppended.length
      // Execute this callback within the surrounding workflow.
      await pre({ name: "edit", agent: dedupeAgent, diffIdentity: "HEAD" }, async () => ({ kind: "allow" }))
      check("repeat code edit publishes new review generation", dedupeAppended.length === afterFirstEdit + 1)
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }

  // Repo-layout import: the same file must also load straight from the
  // checkout, where router-core resolves via ../core instead of ../vendor.
  const repoMod = await import(pathToFileURL(pluginSourcePath).href)
  check("repo-checkout layout imports", typeof repoMod.apply === "function")

  if (failures > 0) {
    console.error(`\ncheck-dsh-plugin: ${failures} failure(s).`)
    process.exit(1)
  }
  console.log("\ncheck-dsh-plugin: all checks passed.")
}

// Handle the local asynchronous failure.
main().catch((error) => {
  console.error(`check-dsh-plugin crashed: ${error && error.stack || error}`)
  process.exit(1)
})
