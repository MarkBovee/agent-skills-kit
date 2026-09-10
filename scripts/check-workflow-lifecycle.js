#!/usr/bin/env node

const {
  buildWorkflowState,
  classifyWorkflowRisk,
  parseWorkflowEvidence,
  recordWorkflowEvidence,
  requiredWorkflowPhases,
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

// Run lifecycle checks and return a failing process status on drift.
function main() {
  checkRiskProfiles()
  checkEvidenceContract()
  checkStatusHints()
  if (failures > 0) {
    console.error(`\ncheck-workflow-lifecycle: ${failures} failure(s).`)
    process.exitCode = 1
    return
  }
  console.log("\nWorkflow lifecycle checks passed.")
}

main()
