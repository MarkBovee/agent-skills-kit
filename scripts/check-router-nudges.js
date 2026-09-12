#!/usr/bin/env node

// Drive the OpenCode router plugin through scripted hook sequences and assert
// the exact nudge behavior (decision-tree audit, auto-match, blocked-tool hint,
// needsCodeReview / needsDesignReview set-and-clear paths). Exits non-zero on
// any failure so CI catches routing regressions without a manual session test.

const {
  COMPLETION_PHRASES,
  buildRoutingStatus,
  getSessionState,
  routingHintLines,
} = require("../core/router-core")

const PLUGIN_PATH = require("node:path").resolve(__dirname, "..", "plugins", "agent-skills-router.mjs")
const SKILLS_PATH = require("node:path").resolve(__dirname, "..", "skills")

let failedChecks = 0

// Record one assertion result and keep going so a run reports every failure.
function check(label, condition, detail) {
  if (condition) {
    console.log(`OK: ${label}`)
    return
  }

  failedChecks += 1
  console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ""}`)
}

async function main() {
  process.env.ASK_SKILLS_DIR = SKILLS_PATH
  const { AgentSkillsRouter } = await import(PLUGIN_PATH)
  const plugin = await AgentSkillsRouter()
  await plugin.event({ event: { type: "session.created", properties: { info: { id: "default" } } } })

  // Fresh session: first prompt injects the skill catalog audit plus decision tree.
  const auditAppend = await plugin["tui.prompt.append"]({ prompt: "start hier" })
  const auditText = auditAppend?.append || ""
  check("first prompt contains session audit header", auditText.includes("FIRST ACTION: scan the decision tree"))
  check("first prompt contains kit overview", auditText.includes("╌ Agent Skills Kit ╌"))
  check("first prompt exposes normal lifecycle status", auditText.includes("Workflow: PLAN | risk=normal"))

  // Blocked-tool guard: bash before any skill load returns the derived hint rows.
  const blocked = await plugin["tool.execute.before"]({ tool: "bash" })
  const blockedError = typeof blocked?.tool_error === "string" ? blocked.tool_error : ""
  check("blocked-tool message asks for a skill load", blockedError.includes("Load a skill first"))
  const expectedHint = routingHintLines().join("\n")
  check(
    "blocked-tool hint matches routingHintLines() exactly",
    blockedError.endsWith(expectedHint),
    `expected suffix:\n${expectedHint}`,
  )

  // Auto-match nudge: a debugging-shaped prompt proposes the matching skill.
  const matchAppend = await plugin["tui.prompt.append"]({ prompt: "fix this bug in the parser" })
  check(
    "auto-match nudge proposes debugging",
    (matchAppend?.append || "").includes("Match: debugging"),
  )
  const deepResearchAppend = await plugin["tui.prompt.append"]({ prompt: "perform exhaustive research and compare against upstream" })
  check(
    "auto-match nudge proposes deep-research",
    (deepResearchAppend?.append || "").includes("Match: deep-research"),
  )
  const specPlugin = await (await import(PLUGIN_PATH)).AgentSkillsRouter()
  await specPlugin.event({ event: { type: "session.created", properties: { info: { id: "spec" } } } })
  const specAppend = await specPlugin["tui.prompt.append"]({ sessionID: "spec", prompt: "write requirements specification for this feature" })
  check(
    "spec prompt exposes spec gate",
    (specAppend?.append || "").includes("risk=spec-required")
      && (specAppend?.append || "").includes("TODO:SPEC"),
  )
  const releaseAppend = await plugin["tui.prompt.append"]({ prompt: "prepare release candidate" })
  check(
    "release prompt exposes release-sensitive lifecycle",
    (releaseAppend?.append || "").includes("risk=release-sensitive")
      && (releaseAppend?.append || "").includes("RELEASE_GATE"),
  )

  // Interaction guard: use a fresh plugin so unrelated routing assertions do
  // not change the exact interaction count this check is proving.
  const guardPlugin = await (await import(PLUGIN_PATH)).AgentSkillsRouter()
  await guardPlugin.event({ event: { type: "session.created", properties: { info: { id: "default" } } } })
  await guardPlugin["tui.prompt.append"]({ prompt: "guard start" })
  for (let interaction = 0; interaction < 3; interaction += 1) {
    const append = await guardPlugin["tui.prompt.append"]({ prompt: `routine interaction ${interaction}` })
    check(
      `interaction guard stays quiet before five actions (${interaction + 2})`,
      !(append?.append || "").includes("Working through 5 actions"),
    )
  }
  const guardAppend = await guardPlugin["tui.prompt.append"]({ prompt: "fifth routine interaction" })
  check(
    "interaction guard uses five actions without tools",
    (guardAppend?.append || "").includes("Working through 5 actions"),
  )

  // A successful skill load resets the interaction guard.
  await guardPlugin["tool.execute.after"]({ tool: "skill" }, { args: { name: "develop" } })
  const afterSkillLoad = await guardPlugin["tui.prompt.append"]({ prompt: "reset check" })
  check(
    "skill load resets interaction guard",
    !(afterSkillLoad?.append || "").includes("Working through 5 actions"),
  )
  await guardPlugin["tool.execute.after"]({ tool: "skill" }, { args: { name: "write-skill" } })
  const openCodeStatus = getSessionState(new Map(), "missing")
  const emptyStatus = buildRoutingStatus(null, openCodeStatus)
  check("empty session routing state is safe", emptyStatus.activeSkills.length === 0
    && openCodeStatus.workflow === null && !("confidence" in emptyStatus))

  // Code-edit tracking: an edit tool sets the code-review nudge.
  await plugin["tool.execute.after"]({ tool: "edit" }, {})
  const afterEdit = await plugin["tui.prompt.append"]({ prompt: "volgende stap" })
  check(
    "code edit sets code-review nudge",
    (afterEdit?.append || "").includes("`skill(name: 'code-review')`"),
  )

  // Design gate: loading design arms the design-review nudge until it is loaded.
  await plugin["tool.execute.after"]({ tool: "skill" }, { args: { name: "design" } })
  const afterDesign = await plugin["tui.prompt.append"]({ prompt: "check de pagina" })
  check(
    "design load sets design-review nudge",
    (afterDesign?.append || "").includes("`skill(name: 'design-review')`"),
  )
  await plugin["tool.execute.after"]({ tool: "skill" }, { args: { name: "design-review" } })
  const afterDesignReview = await plugin["tui.prompt.append"]({ prompt: "check de pagina" })
  check(
    "design-review load clears design-review nudge",
    !(afterDesignReview?.append || "").includes("design-review"),
  )

  // Completion wording does not replace an actual review.
  const completionWord = COMPLETION_PHRASES[0]
  await plugin["tool.execute.after"]({ tool: "write" }, {})
  const beforeCompletion = await plugin["tui.prompt.append"]({ prompt: "nog een ding" })
  check(
    "second edit keeps code-review nudge armed",
    (beforeCompletion?.append || "").includes("`skill(name: 'code-review')`"),
  )
  const afterCompletion = await plugin["tui.prompt.append"]({ prompt: `ik ben ${completionWord}` })
  const postCompletion = await plugin["tui.prompt.append"]({ prompt: "en nu verder" })
  const completionText = postCompletion?.append || ""
  check(
    "completion phrase keeps code-review nudge armed",
    completionText.includes("Code edited"),
  )

  // User text quoting a marker cannot clear review debt.
  await plugin["tool.execute.after"]({ tool: "edit" }, {})
  const markerQuote = await plugin["tui.prompt.append"]({ prompt: "documentation quotes ASK_REVIEW_COMPLETE" })
  check(
    "user marker quote does not clear code-review nudge",
    (markerQuote?.append || "").includes("Code edited"),
  )
  await plugin["tool.execute.after"]({ tool: "task" }, { output: "ASK_WORKFLOW_PASS phase=REVIEW\nASK_REVIEW_COMPLETE" })
  const delegatedReviewFollowUp = await plugin["tui.prompt.append"]({ prompt: "review handoff completed" })
  check("delegated review completion clears code-review nudge", !(delegatedReviewFollowUp?.append || "").includes("Code edited"))
  await plugin["tool.execute.after"]({ tool: "edit" }, {})
  await plugin["tool.execute.after"](
    { tool: "task" },
    { output: "ASK_WORKFLOW_PASS phase=REVIEW\nASK_REVIEW_COMPLETE" },
  )
  const combinedReviewFollowUp = await plugin["tui.prompt.append"]({ prompt: "combined review handoff completed" })
  check("combined review evidence and marker clear code-review nudge", !(combinedReviewFollowUp?.append || "").includes("Code edited"))
  await plugin["tool.execute.after"]({ tool: "edit" }, {})
  await plugin["tool.execute.after"](
    { tool: "task" },
    { output: "ASK_WORKFLOW_FINDINGS phase=REVIEW\nASK_REVIEW_COMPLETE" },
  )
  const failedReviewFollowUp = await plugin["tui.prompt.append"]({ prompt: "review has findings" })
  check("non-passing review marker keeps code-review nudge armed", (failedReviewFollowUp?.append || "").includes("Code edited"))
  await plugin["tool.execute.after"]({ tool: "edit" }, {})
  const editAfterDelegatedReview = await plugin["tui.prompt.append"]({ prompt: "new edit after delegated review" })
  check(
    "edit after delegated review re-arms code-review nudge",
    (editAfterDelegatedReview?.append || "").includes("Code edited"),
  )

  // Loading session-review files the improvement, so the capture hint clears.
  await plugin["tool.execute.after"]({ tool: "skill" }, { args: { name: "session-review" } })
  const afterSessionReview = await plugin["tui.prompt.append"]({ prompt: "en nu verder" })
  check(
    "session-review load clears improvement hint",
    !(afterSessionReview?.append || "").includes("`skill(name: 'session-review')`"),
  )

  const metadataUpdates = []
  const metadata = { preserved: true }
  const panelPlugin = await AgentSkillsRouter({
    client: {
      session: {
        get: async (input) => {
          if (input?.path?.id !== "panel-session") throw new Error("invalid session get arguments")
          return { data: { metadata } }
        },
        update: async (input) => {
          if (input?.path?.id !== "panel-session" || !input.body?.metadata?.askKit) throw new Error("invalid session update arguments")
          Object.assign(metadata, input.body.metadata)
          metadataUpdates.push(input)
        },
      },
    },
  })
  await panelPlugin.event({ event: { type: "session.created", properties: { info: { id: "panel-session" } } } })
  await new Promise((resolve) => setTimeout(resolve, 0))
  const emptyPanelMetadata = metadataUpdates.at(-1)?.body?.metadata
   check("new session persists neutral sidebar state without a predicted route", emptyPanelMetadata?.askKit?.activeSkills?.length === 0
     && !("workflow" in emptyPanelMetadata.askKit) && emptyPanelMetadata.askKit?.pending?.length === 0)
  await panelPlugin["tui.prompt.append"]({ sessionID: "panel-session", prompt: "fix this bug in the parser" })
  await new Promise((resolve) => setTimeout(resolve, 0))
  const panelMetadata = metadataUpdates.at(-1)?.body?.metadata
  check("route matches stay out of the canonical sidebar status", panelMetadata?.preserved === true
    && panelMetadata.askKit?.activeSkills?.length === 0
    && !("workflow" in panelMetadata.askKit))
  await panelPlugin["chat.message"](
    { sessionID: "panel-session" },
    { message: { role: "user" }, parts: [{ type: "text", text: "write requirements specification for this feature" }] },
  )
  await new Promise((resolve) => setTimeout(resolve, 0))
  const chatMetadata = metadataUpdates.at(-1)?.body?.metadata
  check("chat.message keeps unmatched skills out of the sidebar", chatMetadata?.askKit?.activeSkills?.length === 0)

  if (failedChecks > 0) {
    console.error(`\n${failedChecks} nudge check(s) failed.`)
    process.exitCode = 1
    return
  }

  console.log("\nAll router nudge checks passed.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
