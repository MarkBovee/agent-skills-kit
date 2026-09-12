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
  workflowForSkill,
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
  check("deep research prompt is significant risk", classifyWorkflowRisk("perform exhaustive research") === "significant")
  check("large multi-issue prompt is significant risk", classifyWorkflowRisk("multiple issues with maximum compatibility") === "significant")
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
  check("research marker parses phase", parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=RESEARCH")?.phase === "RESEARCH")
  check("finding marker parses phase", parseWorkflowEvidence("ASK_WORKFLOW_FINDINGS phase=AUDIT")?.phase === "AUDIT")
  check("missing marker is not evidence", parseWorkflowEvidence("tests passed") === null)
  check("marker without phase is not evidence", parseWorkflowEvidence("ASK_WORKFLOW_PASS") === null)

  const workflow = buildWorkflowState("prepare release candidate")
  const validationReady = { ...workflow, completedGates: ["INTAKE", "PLAN", "PLAN_CHECK", "EXECUTE"] }
  const passed = recordWorkflowEvidence(validationReady, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=VALIDATE"), "validation")
  check("pass completes validate gate", passed.completedGates.includes("VALIDATE") && passed.releaseStatus === "PENDING")

  const research = recordWorkflowEvidence(workflow, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=RESEARCH"), "research")
  check("optional research evidence records without becoming a required gate", research.completedGates.includes("RESEARCH") && research.phase === "INTAKE")
  check("research skills own research phase", workflowForSkill(workflow, "research")?.phase === "RESEARCH"
    && workflowForSkill(workflow, "deep-research")?.phase === "RESEARCH")

  const auditReady = { ...workflow, completedGates: workflow.requiredPhases.slice(0, workflow.requiredPhases.indexOf("AUDIT")) }
  const found = recordWorkflowEvidence(auditReady, parseWorkflowEvidence("ASK_WORKFLOW_FINDINGS phase=AUDIT"), "audit")
  check("findings move workflow to iterate", found.phase === "ITERATE" && found.unresolvedFindings.length === 1)
  const unresolvedAudit = recordWorkflowEvidence(found, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=AUDIT"), "audit")
  check("unresolved audit findings block audit completion", unresolvedAudit.phase === "ITERATE" && !unresolvedAudit.completedGates.includes("AUDIT"))
  const iterated = recordWorkflowEvidence(found, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=ITERATE"), "implementation")
  check("iterate evidence resolves findings before re-audit", iterated.unresolvedFindings.length === 0 && iterated.phase === "AUDIT")

  const blocked = recordWorkflowEvidence(auditReady, parseWorkflowEvidence("ASK_WORKFLOW_BLOCKED phase=AUDIT"), "audit")
  check("blocked evidence blocks release", blocked.phase === "BLOCKED" && blocked.releaseStatus === "BLOCKED")

  const releaseReady = { ...workflow, completedGates: [...workflow.requiredPhases.filter((phase) => phase !== "RELEASE_GATE")] }
  const released = recordWorkflowEvidence(releaseReady, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=RELEASE_GATE"), "release-gate")
  check("release gate pass reaches done", released.phase === "DONE" && released.releaseStatus === "RELEASE")
  const prematureRelease = recordWorkflowEvidence(workflow, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=RELEASE_GATE"), "release-gate")
  check("premature release evidence cannot bypass required gates", prematureRelease.releaseStatus === "PENDING"
    && !prematureRelease.completedGates.includes("RELEASE_GATE"))
  const untrustedValidation = recordWorkflowEvidence(validationReady, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=VALIDATE"), "command")
  check("workflow evidence remains explicit and phase-gated", untrustedValidation.completedGates.includes("VALIDATE"))

  const changedRisk = buildWorkflowState("fix typo in docs", { workflow: released })
  check("lower-risk follow-up cannot downgrade a release workflow", changedRisk.risk === "release-sensitive"
    && changedRisk.completedGates.includes("RELEASE_GATE"))

  const normalWorkflow = buildWorkflowState("research this API behavior")
  const escalatedResearch = buildWorkflowState("perform exhaustive research", { workflow: normalWorkflow })
  check("deep research follow-up escalates workflow risk", escalatedResearch.risk === "significant"
    && escalatedResearch.requiredPhases.includes("PLAN_CHECK") && escalatedResearch.requiredPhases.includes("AUDIT"))
  const contractRelease = buildWorkflowState("prepare release candidate with new external contract")
  const continuedContractRelease = buildWorkflowState("run validation", { workflow: contractRelease })
  check("conditional spec gate survives follow-up prompts", continuedContractRelease.requiredPhases.includes("SPEC"))
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

  check("route match stays out of sidebar skills", ambiguous.activeSkills.length === 0)
  const explicit = buildRoutingStatus(null, state, "debugging")
  const persisted = buildRoutingStatus(null, { ...state, currentSkill: "debugging", routing: explicit })
  check("status keeps active skill across later state updates", persisted.activeSkills.some((entry) => entry.skill === "debugging" && entry.current))
  const fallbackNoise = buildRoutingStatus(null, { ...state, currentSkill: "spec", matchedSkills: [{ name: "develop" }] })
  check("develop fallback never displaces a loaded skill", fallbackNoise.activeSkills.some((entry) => entry.skill === "spec" && entry.current)
    && !fallbackNoise.activeSkills.some((entry) => entry.skill === "develop"))
  check("no route exposes no fabricated skill", noMatch.activeSkills.length === 0 && !("workflow" in noMatch))
  check("fresh status carries no pending obligations", noMatch.pending.length === 0)

  const reviewDebt = buildRoutingStatus(null, { ...state, needsCodeReview: true, needsDesignReview: true, shouldCaptureImprovement: true })
  check("pending obligations expose code and design review only", reviewDebt.pending.map((entry) => entry.skill).join(",") === "code-review,design-review")
  check("pending obligations expose concrete load actions", reviewDebt.pending[0]?.action === "skill(name: 'code-review')" && reviewDebt.pending[1]?.action === "skill(name: 'design-review')")
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
    check(`${risk} status omits workflow presentation`, !("workflow" in status))
  }

  const release = buildWorkflowState("prepare release candidate")
  const continuedRelease = buildWorkflowState("run the checks", { workflow: { ...release, phase: "VALIDATE", completedGates: ["INTAKE", "PLAN", "PLAN_CHECK", "EXECUTE"] } })
  check("follow-up prompt preserves workflow risk and evidence", continuedRelease.risk === "release-sensitive"
    && continuedRelease.phase === "VALIDATE" && continuedRelease.completedGates.includes("EXECUTE"))
  check("terminal workflow state remains internal", !("workflow" in buildRoutingStatus(null, { workflow: { ...release, phase: "BLOCKED" } }))
    && !("workflow" in buildRoutingStatus(null, { workflow: { ...release, phase: "DONE", completedGates: release.requiredPhases } })))
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
