#!/usr/bin/env node

const {
  buildWorkflowState,
  buildRoutingStatus,
  classifyWorkflowRisk,
  createEmptySessionState,
  parseWorkflowEvidence,
  recordWorkflowEvidence,
  requiredWorkflowPhases,
  cascadeRoute,
  workflowHintLines,
} = require("../core/router-core")

let failures = 0

// Record one lifecycle assertion and keep running so CI reports all drift.
function check(label, condition) {
  if (condition) {
    console.log(`OK: ${label}`)
    return
  }

  failures += 1
  console.error(`FAIL: ${label}`)
}

// Verify risk classification maps to proportional lifecycle requirements.
function checkRiskProfiles() {
  check("small prompt is small risk", classifyWorkflowRisk("fix typo in docs") === "small")
  check("normal prompt is normal risk", classifyWorkflowRisk("add a focused parser feature") === "normal")
  check("requirements prompt requires spec", classifyWorkflowRisk("write requirements specification") === "spec-required")
  check("architecture prompt is significant risk", classifyWorkflowRisk("change architecture ownership") === "significant")
  check("release prompt is release-sensitive", classifyWorkflowRisk("prepare release candidate") === "release-sensitive")
  check("small flow has execute and validate", JSON.stringify(requiredWorkflowPhases("small")) === JSON.stringify(["EXECUTE", "VALIDATE"]))
  check("release flow has audit and release gate", requiredWorkflowPhases("release-sensitive").includes("AUDIT") && requiredWorkflowPhases("release-sensitive").includes("RELEASE_GATE"))
  check("spec flow places spec before plan", JSON.stringify(requiredWorkflowPhases("spec-required").slice(0, 3)) === JSON.stringify(["INTAKE", "SPEC", "PLAN"]))
  check("release flow can include conditional spec", requiredWorkflowPhases("release-sensitive", "new external contract").includes("SPEC")
    && requiredWorkflowPhases("release-sensitive", "new external contract").includes("RELEASE_GATE"))
}

// Verify explicit evidence markers produce pass, finding, and blocked states.
function checkEvidenceContract() {
  check("pass marker parses phase", parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=VALIDATE")?.status === "PASS")
  check("finding marker parses phase", parseWorkflowEvidence("ASK_WORKFLOW_FINDINGS phase=AUDIT")?.phase === "AUDIT")
  check("missing marker is not evidence", parseWorkflowEvidence("tests passed") === null)
  check("marker without phase is not evidence", parseWorkflowEvidence("ASK_WORKFLOW_PASS") === null)

  const workflow = buildWorkflowState("prepare release candidate")
  const passed = recordWorkflowEvidence(workflow, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=VALIDATE"), "validation")
  check("pass completes validate gate", passed.completedGates.includes("VALIDATE") && passed.releaseStatus === "PENDING")

  const found = recordWorkflowEvidence(passed, parseWorkflowEvidence("ASK_WORKFLOW_FINDINGS phase=AUDIT"), "audit")
  check("findings move workflow to iterate", found.phase === "ITERATE" && found.unresolvedFindings.length === 1)

  const blocked = recordWorkflowEvidence(workflow, parseWorkflowEvidence("ASK_WORKFLOW_BLOCKED phase=AUDIT"), "audit")
  check("blocked evidence blocks release", blocked.phase === "BLOCKED" && blocked.releaseStatus === "BLOCKED")

  const releaseReady = { ...workflow, completedGates: [...workflow.requiredPhases.filter((phase) => phase !== "RELEASE_GATE")] }
  const released = recordWorkflowEvidence(releaseReady, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=RELEASE_GATE"), "release-gate")
  check("release gate pass reaches done", released.phase === "DONE" && released.releaseStatus === "RELEASE")

  const changedRisk = buildWorkflowState("fix typo in docs", released)
  check("risk change resets prior evidence", changedRisk.completedGates.length === 0 && changedRisk.releaseStatus === "NOT_REQUIRED")
}

// Verify the router-facing status contains risk, phase, gates, and evidence.
function checkStatusHints() {
  const lines = workflowHintLines(buildWorkflowState("prepare release candidate"))
  check("status reports phase and risk", lines[0].includes("Workflow:") && lines[0].includes("risk=release-sensitive"))
  check("status reports evidence and release", lines[1].includes("subagents=0") && lines[1].includes("release=PENDING"))
}

// Verify the panel snapshot exposes the actual routed skill, pending review
// obligations, and explicit workflow states without asking consumers to
// recreate router logic.
function checkRoutingStatus() {
  const skills = ["develop", "debugging", "code-review", "verification", "spec", "intake"].map((name) => ({ name }))
  const state = createEmptySessionState()
  const ambiguousRoute = cascadeRoute("debug this bug and review the diff", skills, state)
  const ambiguousWorkflow = buildWorkflowState("debug this bug and review the diff", state)
  const ambiguous = buildRoutingStatus(ambiguousRoute, { ...state, workflow: ambiguousWorkflow })
  const noMatch = buildRoutingStatus(cascadeRoute("", [], state), state)

  check("status exposes the cascade-selected active skill", ambiguous.activeSkill === "debugging" && ambiguous.activeSkillLabel === "Debugging")
  check("no route exposes no fabricated skill or workflow", noMatch.activeSkill === null && noMatch.workflow === null)
  check("fresh status carries no pending obligations", noMatch.pending.length === 0)

  const reviewDebt = buildRoutingStatus(null, { ...state, needsCodeReview: true, needsDesignReview: true, shouldCaptureImprovement: true })
  check("pending obligations expose code, design, and improvement skills", reviewDebt.pending.map((entry) => entry.skill).join(",") === "code-review,design-review,session-review")
  check("cleared flags leave no pending obligations", buildRoutingStatus(null, { ...state, needsCodeReview: false }).pending.length === 0)

  const workflowCases = [
    ["fix typo in docs", "small"],
    ["add a focused parser feature", "normal"],
    ["write requirements specification", "spec-required"],
    ["change architecture ownership", "significant"],
    ["prepare release candidate", "release-sensitive"],
  ]
  for (const [prompt, risk] of workflowCases) {
    const workflow = buildWorkflowState(prompt)
    const status = buildRoutingStatus(null, { workflow })
    check(`${risk} status exposes its required route`, status.workflow.route.length === workflow.requiredPhases.length
      && status.workflow.route[0]?.state === "active")
  }

  const workflow = buildWorkflowState("add a focused parser feature")
  const completed = { ...workflow, phase: "EXECUTE", completedGates: ["PLAN"] }
  const route = buildRoutingStatus(null, { workflow: completed }).workflow.route
  check("workflow route preserves completed active and pending states", route[0]?.state === "completed"
    && route[1]?.state === "active" && route[2]?.state === "pending")

  const release = buildWorkflowState("prepare release candidate")
  const continuedRelease = buildWorkflowState("run the checks", { workflow: { ...release, phase: "VALIDATE", completedGates: ["INTAKE", "PLAN", "PLAN_CHECK", "EXECUTE"] } })
  check("follow-up prompt preserves workflow risk and evidence", continuedRelease.risk === "release-sensitive"
    && continuedRelease.phase === "VALIDATE" && continuedRelease.completedGates.includes("EXECUTE"))
  const blockedRoute = buildRoutingStatus(null, { workflow: { ...release, phase: "BLOCKED" } }).workflow.route
  const doneRoute = buildRoutingStatus(null, { workflow: { ...release, phase: "DONE", completedGates: release.requiredPhases } }).workflow.route
  check("terminal blocked workflow retains an active route marker", blockedRoute.at(-1)?.phase === "BLOCKED" && blockedRoute.at(-1)?.state === "active")
  check("completed workflow retains an active done marker", doneRoute.at(-1)?.phase === "DONE" && doneRoute.at(-1)?.state === "active")
}

// Run lifecycle checks and return a failing process status on drift.
function main() {
  checkRiskProfiles()
  checkEvidenceContract()
  checkStatusHints()
  checkRoutingStatus()
  if (failures > 0) {
    console.error(`\ncheck-workflow-lifecycle: ${failures} failure(s).`)
    process.exitCode = 1
    return
  }
  console.log("\nWorkflow lifecycle checks passed.")
}

main()
