#!/usr/bin/env node

const path = require("node:path")
const {
  buildWorkflowState,
  invalidateWorkflowForDiff,
  buildRoutingStatus,
  classifyWorkflowRisk,
  createEmptySessionState,
  parseWorkflowEvidence,
  recordWorkflowEvidence,
  reviewModeForRisk,
  requiredWorkflowPhases,
  workflowRequiresReview,
  cascadeRoute,
  workflowHintLines,
  workflowForSkill,
} = require("../core/router-core")
const fs = require("node:fs")

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
  check("explicit small local bug fix is small risk", classifyWorkflowRisk("small local bug fix in parser") === "small")
  check("risk phrases do not match inside longer words", classifyWorkflowRisk("small local fix in tokenizer") === "small")
  check("security fix cannot be classified as small", classifyWorkflowRisk("quick fix for security vulnerability") === "significant")
  check("security issue cannot be classified as small", classifyWorkflowRisk("small local fix for a security issue in parser") === "significant")
  check("auth abbreviation cannot be classified as small", classifyWorkflowRisk("small auth fix") === "significant")
  check("TLS issue cannot be classified as small", classifyWorkflowRisk("quick fix for TLS bug") === "significant")
  check("OAuth change cannot be classified as small", classifyWorkflowRisk("small OAuth flow fix") === "significant")
  check("API key exposure cannot be classified as small", classifyWorkflowRisk("quick fix for API key exposure") === "significant")
  check("database schema change cannot be classified as small", classifyWorkflowRisk("small database schema change") === "significant")
  check("SSRF fix cannot be classified as small", classifyWorkflowRisk("small local fix for SSRF in image proxy") === "significant")
  check("IDOR fix cannot be classified as small", classifyWorkflowRisk("quick IDOR fix") === "significant")
  check("XXE fix cannot be classified as small", classifyWorkflowRisk("small fix for XXE") === "significant")
  check("SQL injection fix cannot be classified as small", classifyWorkflowRisk("quick fix for SQL injection") === "significant")
  check("race-condition fix cannot be classified as small", classifyWorkflowRisk("small fix for a race condition") === "significant")
  check("password validation remains high risk", classifyWorkflowRisk("typo in password validation") === "significant")
  check("data-loss fixes remain high risk", classifyWorkflowRisk("quick fix for data loss") === "significant")
  check("normal prompt is normal risk", classifyWorkflowRisk("add a focused parser feature") === "normal")
  check("architecture prompt is significant risk", classifyWorkflowRisk("change architecture ownership") === "significant")
  check("deep research prompt is significant risk", classifyWorkflowRisk("perform exhaustive research") === "significant")
  check("large multi-issue prompt is significant risk", classifyWorkflowRisk("multiple issues with maximum compatibility") === "significant")
  check("release prompt is release-sensitive", classifyWorkflowRisk("prepare release candidate") === "release-sensitive")
  // Verify small changes stop after validation while normal changes retain one combined review.
  const smallWorkflow = buildWorkflowState("small local bug fix in parser")
  const normalWorkflow = buildWorkflowState("add a focused parser feature")
  check("small flow ends after validation", JSON.stringify(requiredWorkflowPhases("small")) === JSON.stringify(["EXECUTE", "VALIDATE"])
    && reviewModeForRisk("small") === "none" && !workflowRequiresReview(smallWorkflow))
  check("normal flow has combined review", reviewModeForRisk("normal") === "combined")
  check("normal flow still requires review", workflowRequiresReview(normalWorkflow))
  check("unknown workflow keeps review as a safe default", workflowRequiresReview(null))
  // Verify higher-risk workflows retain separate review and audit handling.
  check("higher-risk flows keep separate review", ["significant", "release-sensitive"].every((risk) => reviewModeForRisk(risk) === "separate"))
  check("release flow has audit and release gate", requiredWorkflowPhases("release-sensitive").includes("AUDIT") && requiredWorkflowPhases("release-sensitive").includes("RELEASE_GATE"))
  check("significant flow has intake, plan-check, and audit but no release gate", JSON.stringify(requiredWorkflowPhases("significant"))
    === JSON.stringify(["INTAKE", "PLAN", "PLAN_CHECK", "EXECUTE", "VALIDATE", "REVIEW", "AUDIT"]))
  // Verify the removed SPEC phase never reappears in any risk level's gate list.
  check("no workflow risk adds a SPEC phase", ["small", "normal", "significant", "release-sensitive"].every((risk) => !requiredWorkflowPhases(risk).includes("SPEC")))
}

// Extract one uniquely named H2 section for contract and export checks.
function readMarkdownSection(content, heading) {
  const lines = content.split(/\r?\n/)
  const expectedHeading = `## ${heading}`
  const headingIndices = []
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === expectedHeading) headingIndices.push(index)
  }
  if (headingIndices.length !== 1) return ""

  const start = headingIndices[0]
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##(?:[ \t]+|$)/.test(lines[index])) {
      end = index
      break
    }
  }
  return lines.slice(start, end).join("\n").trim()
}

// Require a complete standalone paragraph instead of matching weakened fragments.
function hasExactParagraph(section, paragraph) {
  const entries = section.split(/\r?\n[ \t]*\r?\n/)
  for (const entry of entries) {
    if (entry.trim() === paragraph) return true
  }
  return false
}

// Keep release validation deferred until iterative findings are resolved.
function checkReleaseValidationCadence() {
  // The release procedure lives in a reference file so the skill body stays compact.
  const workflowGuidance = fs.readFileSync("skills/ask-agent-workflows/references/release-gates.md", "utf8")
  const deltaHeading = "Bounded narrow-fix release path"
  const metadataHeading = "Metadata-only release fast path"
  const deltaGuidance = readMarkdownSection(workflowGuidance, deltaHeading)
  const metadataGuidance = readMarkdownSection(workflowGuidance, metadataHeading)

  check("agent-workflows points release-sensitive work at the release-gates reference",
    fs.readFileSync("skills/ask-agent-workflows/SKILL.md", "utf8").includes("[references/release-gates.md](references/release-gates.md)"))
  check("release cadence and metadata sections are present in order", deltaGuidance !== ""
    && metadataGuidance !== ""
    && workflowGuidance.indexOf(`## ${deltaHeading}`) < workflowGuidance.indexOf(`## ${metadataHeading}`))
  check("delta findings loop repeats focused validation without the full suite", deltaGuidance.includes("Do not run the full suite during this findings loop"))
  check("full suite runs once on the stable candidate", deltaGuidance.includes("run the full required check suite once on that exact diff"))
  check("later code findings invalidate all prior gate evidence", deltaGuidance.includes("all validation, review, audit, and release-gate evidence for the prior diff is stale"))
  check("later code findings rerun every final gate on the new diff", deltaGuidance.includes("run the full suite and repeat final review, independent final audit, and release-gate on that exact diff"))
  check("final review and independent audit remain after full validation", hasOrderedGuidanceSections(deltaGuidance, "run the full required check suite once", "final review run")
    && deltaGuidance.includes("independent final audit and release-gate"))
  check("review and audit budget remains cumulative", deltaGuidance.includes("cumulative review/audit budget remains")
    && deltaGuidance.includes("timebox is 16 minutes total"))
  check("budget exhaustion and blocked passes cannot claim a pass", deltaGuidance.includes("If the budget is exhausted or a pass is partial or blocked, stop and present the evidence"))
  check("P0/P1 blockers cannot be deferred", deltaGuidance.includes("P0/P1 findings and established security, privacy, correctness, or safety blockers cannot be deferred"))
  check("scope expansion requires owner approval", deltaGuidance.includes("Scope expansion requires explicit approval recorded in a revised plan"))

  const generatedPaths = [
    ["GitHub Copilot", ".github/skills/ask-agent-workflows/references/release-gates.md"],
    ["DeepSeek Harness", ".dsh/skills/ask-agent-workflows/references/release-gates.md"],
  ]
  for (const [platform, exportPath] of generatedPaths) {
    const generatedGuidance = fs.readFileSync(exportPath, "utf8")
    check(`${platform} export matches canonical release cadence`,
      readMarkdownSection(generatedGuidance, deltaHeading) === deltaGuidance)
    check(`${platform} export keeps metadata-only path after release cadence`,
      generatedGuidance.indexOf(`## ${deltaHeading}`) < generatedGuidance.indexOf(`## ${metadataHeading}`))
  }
}

// Keep review scope and code-first audit contracts present in canonical and generated skills.
function checkReviewAuditGuidance() {
  const reviewGuidance = fs.readFileSync("skills/ask-code-review/SKILL.md", "utf8")
  const auditGuidance = fs.readFileSync("skills/ask-agent-workflows/SKILL.md", "utf8")
  const reviewContract = readMarkdownSection(reviewGuidance, "Finding scope")
  const auditContract = readMarkdownSection(auditGuidance, "Code-first independent audit")
  const releaseGuidance = fs.readFileSync("skills/ask-agent-workflows/references/release-gates.md", "utf8")
  const convergenceContract = readMarkdownSection(releaseGuidance, "Release audit convergence and stop rule")
  const findingRequirement = "Before treating a behavior as an actionable finding, compare the cited lines with the exact review base. Every finding must identify a changed hunk or explain the direct behavior introduced by a changed hunk. Nearby unchanged lines are context; pre-existing behavior is not a regression just because the diff made it visible. If the base diff or causal link cannot be established, report the review as blocked or limited instead of presenting an unsupported regression. Keep unrelated pre-existing behavior classified as context, not as a finding against this change."
  const codeFirstRequirement = "An independent audit inspects production behavior; it is not validation or a test-coverage inventory. Start from the exact production diff and, before inspecting tests, identify affected entry points, callers, state transitions, cleanup paths, fallback decisions, and the invariants they must preserve. Challenge those invariants with plausible counterexamples such as cancellation at an await boundary, delayed first responses, malformed input, stale cached state, overlapping ownership, or alias/hardware mismatches when relevant."
  const auditEvidenceRequirement = "An actionable audit finding names the production path, violated invariant, plausible trigger, user impact, and smallest regression proof needed. If no issue is found, name the implementation paths and bypass categories inspected; a green test count alone is not an audit pass. Audit handoffs must include the exact diff and require the auditor to record production paths and invariants before looking at tests."
  const auditHandoffRequirement = "Keep the audit assignment separate from validation. Provide the exact diff reference and requirements, then ask the auditor to report the production paths, callers, and invariants traced before inspecting targeted tests. Ask for counterexamples and actionable findings in the format above, or the paths and bypass categories inspected if none remain. The validator owns suite execution and pass/fail reporting; do not substitute test counts for audit evidence."
  const candidateGateRequirement = "For release-sensitive work, keep one current candidate record in the task plan: an immutable diff reference plus a concise gate table for `VALIDATE`, `REVIEW`, `AUDIT`, and `RELEASE_GATE`, each with status and its matching evidence. When source changes, mark evidence for the prior diff stale immediately; rerun only checks affected by the change, not unrelated gates."
  const deltaConvergenceRequirement = "Collect actionable findings into one bounded correction batch. After that batch, run focused validation and one delta review plus one separate delta audit limited to changed production paths and affected invariants. Do not restart broad candidate review or enumerate test suites on each delta. Once the candidate is stable, run the full required suite once, then independent final review, audit, and release-gate against that exact diff reference."
  const ownerStopRequirement = "If the owner asks to stop the audit loop, stop review/audit work immediately and return a blocked status naming the current diff, the missing required gate, and any unresolved findings. Do not keep cycling, push, release, or close issues around the gate, and do not imply tests or deployment substitute for an audit. A stop request does not waive mandatory evidence: release-sensitive work remains blocked while a required independent gate is missing, or a P0/P1 or safety blocker is unresolved."

  check("review finding attribution remains normative", hasExactParagraph(reviewContract, findingRequirement))
  check("weakened review modality fails the exact contract assertion",
    !hasExactParagraph(`## Finding scope\n\n${findingRequirement.replace("must identify", "may identify")}`, findingRequirement))
  check("pre-existing behavior remains context, not a regression finding",
    hasExactParagraph(reviewContract, "Before treating a behavior as an actionable finding, compare the cited lines with the exact review base. Every finding must identify a changed hunk or explain the direct behavior introduced by a changed hunk. Nearby unchanged lines are context; pre-existing behavior is not a regression just because the diff made it visible. If the base diff or causal link cannot be established, report the review as blocked or limited instead of presenting an unsupported regression. Keep unrelated pre-existing behavior classified as context, not as a finding against this change."))
  check("unknown review base blocks unsupported regression claims",
    reviewContract.includes("If the base diff or causal link cannot be established, report the review as blocked or limited instead of presenting an unsupported regression."))
  check("code-first audit order is an exact normative contract", hasExactParagraph(auditContract, codeFirstRequirement))
  check("reversed audit ordering fails the exact contract assertion",
    !hasExactParagraph(`## Code-first independent audit\n\n${codeFirstRequirement.replace("before inspecting tests", "after inspecting tests")}`, codeFirstRequirement))
  check("audit is distinct from validation and test inventory",
    auditContract.includes("An independent audit inspects production behavior; it is not validation or a test-coverage inventory."))
  check("tests are evidence, not a substitute for tracing production code",
    auditContract.includes("Tests are evidence, not a substitute for tracing production code."))
  check("focused green suite cannot dismiss production bypass",
    auditContract.includes("A green focused suite does not close an audit finding while a production-code bypass remains."))
  check("audit findings require production-path evidence", hasExactParagraph(auditContract, auditEvidenceRequirement))
  check("audit clean passes name inspected paths and bypass classes", auditContract.includes("If no issue is found, name the implementation paths and bypass categories inspected; a green test count alone is not an audit pass."))
  check("audit handoff separates the role from validation", hasExactParagraph(auditContract, auditHandoffRequirement))
  check("audit handoff assigns suite results to validation", auditContract.includes("The validator owns suite execution and pass/fail reporting;"))
  check("passing focused test with production bypass remains an audit finding",
    auditContract.includes("a focused test passes for a normal response, but an error-shaped row can still reach a production fallback"))
  check("release work keeps one immutable diff and evidence table", hasExactParagraph(convergenceContract, candidateGateRequirement))
  check("release deltas converge through bounded focused gates", hasExactParagraph(convergenceContract, deltaConvergenceRequirement))
  check("owner stop request returns blocked status without waiving release gates", hasExactParagraph(convergenceContract, ownerStopRequirement))

  const generatedPaths = [
    ["GitHub Copilot", ".github/skills/ask-code-review/SKILL.md", ".github/skills/ask-agent-workflows/SKILL.md"],
    ["DeepSeek Harness", ".dsh/skills/ask-code-review/SKILL.md", ".dsh/skills/ask-agent-workflows/SKILL.md"],
  ]
  for (const [platform, reviewPath, auditPath] of generatedPaths) {
    const generatedReview = fs.readFileSync(reviewPath, "utf8")
    const generatedAudit = fs.readFileSync(auditPath, "utf8")
    const exportedReview = readMarkdownSection(generatedReview, "Finding scope")
    const exportedAudit = readMarkdownSection(generatedAudit, "Code-first independent audit")
    const generatedRelease = fs.readFileSync(auditPath.replace("SKILL.md", "references/release-gates.md"), "utf8")
    const exportedConvergence = readMarkdownSection(generatedRelease, "Release audit convergence and stop rule")
    check(`${platform} export preserves canonical review contract`, exportedReview === reviewContract)
    check(`${platform} export preserves canonical audit contract`, exportedAudit === auditContract)
    check(`${platform} export preserves canonical release convergence contract`, exportedConvergence === convergenceContract)
  }
}

// Verify model routing stays explicit in canonical skills and generated exports.
function checkModelRoutingGuidance() {
  const routingPath = "skills/ask-agent-workflows/references/model-routing.md"
  const routingGuidance = fs.readFileSync(routingPath, "utf8")
  const workflowGuidance = fs.readFileSync("skills/ask-agent-workflows/SKILL.md", "utf8")
  const developGuidance = fs.readFileSync("skills/ask-develop/SKILL.md", "utf8")
  const routingSection = readMarkdownSection(workflowGuidance, "Subagent tier & budget")
  const developSection = readMarkdownSection(developGuidance, "Cheap-first escalation")

  check("agent-workflows requires a model choice for supported delegations",
    routingSection.includes("Before each delegation, choose a task-appropriate model")
      && routingSection.includes("references/model-routing.md"))
  check("develop requires per-delegation model selection",
    developSection.includes("select a task-appropriate model and pass it per invocation"))
  check("model routing maps tiers to Haiku, Sonnet, and selective Opus",
    routingGuidance.includes("| `light` (user term: light) | Haiku |")
      && routingGuidance.includes("| `standard` (user term: medium) | Sonnet |")
      && routingGuidance.includes("| `deep` (user term: heavy) | Opus, selectively |"))
  check("model routing keeps workflow skills on the Sonnet worker floor",
    routingGuidance.includes("## Workflow floor")
      && routingGuidance.includes("Workflow skills run in the Sonnet worker (`ask-worker`)"))
  check("model routing treats model selection as a request until verified",
    routingGuidance.includes("a request, not proof of the model actually used")
      && routingGuidance.includes("Verify the active model in `/tasks`"))
  check("model routing distinguishes Explore and Plan limitations",
    routingGuidance.includes("The built-in `Explore` agent")
      && routingGuidance.includes("The built-in `Plan` agent inherits the parent model"))
  check("model routing rejects force-all as a per-task selection strategy",
    routingGuidance.includes("Do not use `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`"))

  const generatedPaths = [
    ["GitHub Copilot", ".github/skills/ask-agent-workflows/references/model-routing.md", ".github/skills/ask-agent-workflows/SKILL.md", ".github/skills/ask-develop/SKILL.md"],
    ["DeepSeek Harness", ".dsh/skills/ask-agent-workflows/references/model-routing.md", ".dsh/skills/ask-agent-workflows/SKILL.md", ".dsh/skills/ask-develop/SKILL.md"],
  ]
  for (const [platform, generatedRoutingPath, generatedWorkflowPath, generatedDevelopPath] of generatedPaths) {
    const generatedRouting = fs.readFileSync(generatedRoutingPath, "utf8")
    const generatedWorkflow = fs.readFileSync(generatedWorkflowPath, "utf8")
    const generatedDevelop = fs.readFileSync(generatedDevelopPath, "utf8")
    check(`${platform} export preserves the model routing reference`, generatedRouting === routingGuidance)
    check(`${platform} export preserves the delegation routing rule`,
      readMarkdownSection(generatedWorkflow, "Subagent tier & budget") === routingSection)
    check(`${platform} export preserves the develop routing rule`,
      readMarkdownSection(generatedDevelop, "Cheap-first escalation") === developSection)
  }
}

// Confirm required evidence sections appear in order.
function hasOrderedGuidanceSections(content, firstSection, secondSection) {
  const firstIndex = content.indexOf(firstSection)
  const secondIndex = content.indexOf(secondSection)
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex
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
  const passed = recordWorkflowEvidence(validationReady, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=VALIDATE diff=release-diff"), "validation")
  check("pass completes validate gate", passed.completedGates.includes("VALIDATE") && passed.releaseStatus === "PENDING")

  const prematureReview = recordWorkflowEvidence(validationReady, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=REVIEW diff=release-diff"), "review")
  check("review cannot run before validation", !prematureReview.completedGates.includes("REVIEW"))
  const prematureAudit = recordWorkflowEvidence(validationReady, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=AUDIT diff=release-diff"), "audit")
  check("audit cannot run before validation and review", !prematureAudit.completedGates.includes("AUDIT"))
  check("iterate is conditional rather than a mandatory closeout gate", !workflow.requiredPhases.includes("ITERATE")
    && workflow.requiredPhases.indexOf("VALIDATE") < workflow.requiredPhases.indexOf("REVIEW")
    && workflow.requiredPhases.indexOf("REVIEW") < workflow.requiredPhases.indexOf("AUDIT"))
  const acceptedReview = recordWorkflowEvidence(passed, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=REVIEW diff=release-diff"), "review")
  check("accepted review evidence completes the review gate", acceptedReview.completedGates.includes("REVIEW"))
  const rejectedReview = recordWorkflowEvidence(passed, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=REVIEW diff=other-diff"), "review")
  check("stale review evidence cannot satisfy the current workflow diff", !rejectedReview.completedGates.includes("REVIEW"))

  const research = recordWorkflowEvidence(workflow, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=RESEARCH diff=release-diff"), "research")
  check("optional research evidence records without becoming a required gate", research.completedGates.includes("RESEARCH") && research.phase === "INTAKE")
  check("research skills own research phase", workflowForSkill(workflow, "research")?.phase === "RESEARCH"
    && workflowForSkill(workflow, "deep-research")?.phase === "RESEARCH")

  const auditReady = { ...workflow, completedGates: workflow.requiredPhases.slice(0, workflow.requiredPhases.indexOf("AUDIT")) }
  const found = recordWorkflowEvidence({ ...auditReady, diffIdentity: "release-diff" }, parseWorkflowEvidence("ASK_WORKFLOW_FINDINGS phase=AUDIT diff=release-diff"), "audit")
  check("findings move workflow to iterate", found.phase === "ITERATE" && found.unresolvedFindings.length === 1)
  const unresolvedAudit = recordWorkflowEvidence(found, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=AUDIT diff=release-diff"), "audit")
  check("unresolved audit findings block audit completion", unresolvedAudit.phase === "ITERATE" && !unresolvedAudit.completedGates.includes("AUDIT"))
  const iterated = recordWorkflowEvidence(found, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=ITERATE diff=release-diff"), "implementation")
  check("iterate evidence resolves findings and requires fresh validation", iterated.unresolvedFindings.length === 0
    && iterated.phase === "VALIDATE" && !iterated.completedGates.includes("VALIDATE"))
  const validationFindings = recordWorkflowEvidence({ ...passed, completedGates: [...passed.completedGates] }, parseWorkflowEvidence("ASK_WORKFLOW_FINDINGS phase=VALIDATE diff=release-diff"), "validation")
  const reviewAfterValidationFindings = recordWorkflowEvidence(validationFindings, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=REVIEW diff=release-diff"), "review")
  check("validation findings immediately invalidate validation before review", !validationFindings.completedGates.includes("VALIDATE")
    && !reviewAfterValidationFindings.completedGates.includes("REVIEW"))

  const blocked = recordWorkflowEvidence({ ...auditReady, diffIdentity: "release-diff" }, parseWorkflowEvidence("ASK_WORKFLOW_BLOCKED phase=AUDIT diff=release-diff"), "audit")
  check("blocked evidence blocks release", blocked.phase === "BLOCKED" && blocked.releaseStatus === "BLOCKED")

  // Keep items that satisfy the local predicate.
  const releaseReady = { ...workflow, completedGates: [...workflow.requiredPhases.filter((phase) => phase !== "RELEASE_GATE")] }
  const released = recordWorkflowEvidence({ ...releaseReady, diffIdentity: "release-diff" }, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=RELEASE_GATE diff=release-diff"), "release-gate")
  check("release gate pass reaches done", released.phase === "DONE" && released.releaseStatus === "RELEASE")
  const prematureRelease = recordWorkflowEvidence(workflow, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=RELEASE_GATE diff=release-diff"), "release-gate")
  check("premature release evidence cannot bypass required gates", prematureRelease.releaseStatus === "PENDING"
    && !prematureRelease.completedGates.includes("RELEASE_GATE"))
  const untrustedValidation = recordWorkflowEvidence(validationReady, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=VALIDATE diff=release-diff"), "command")
  check("workflow evidence remains explicit and phase-gated", untrustedValidation.completedGates.includes("VALIDATE"))

  const changedRisk = buildWorkflowState("fix typo in docs", { workflow: released })
  check("lower-risk follow-up cannot downgrade a release workflow", changedRisk.risk === "release-sensitive"
    && changedRisk.completedGates.includes("RELEASE_GATE"))

  const normalWorkflow = buildWorkflowState("research this API behavior")
  const escalatedResearch = buildWorkflowState("perform exhaustive research", { workflow: normalWorkflow })
  check("deep research follow-up escalates workflow risk", escalatedResearch.risk === "significant"
    && escalatedResearch.requiredPhases.includes("PLAN_CHECK") && escalatedResearch.requiredPhases.includes("AUDIT"))

  const invalidated = invalidateWorkflowForDiff(released, "diff-after-release")
  check("code edits invalidate completed workflow gates", invalidated.completedGates.length === 0
    && invalidated.phase === invalidated.requiredPhases[0]
    && invalidated.releaseStatus === "PENDING"
    && invalidated.diffIdentity === "diff-after-release")
  check("workflow evidence carries a diff identity", parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=VALIDATE diff=diff-after-release").diffIdentity === "diff-after-release")
  const staleEvidence = recordWorkflowEvidence({ ...invalidated, completedGates: ["INTAKE", "PLAN", "PLAN_CHECK", "EXECUTE"] }, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=VALIDATE diff=old-diff"))
  check("stale workflow evidence cannot complete a new diff", !staleEvidence.completedGates.includes("VALIDATE"))
  check("release workflow rejects identity-free evidence", !recordWorkflowEvidence(invalidated, parseWorkflowEvidence("ASK_WORKFLOW_PASS phase=VALIDATE"), "validation").completedGates.includes("VALIDATE"))
  const repeatedCommitIdentity = invalidateWorkflowForDiff({ ...released, diffIdentity: "HEAD:edit-1" }, "HEAD:edit-2")
  check("repeated host commit identities still create a new workflow diff", repeatedCommitIdentity.diffIdentity === "HEAD:edit-2"
    && repeatedCommitIdentity.completedGates.length === 0
    && repeatedCommitIdentity.releaseStatus === "PENDING")
  const newReleaseTask = buildWorkflowState("prepare release candidate", { workflow: released })
  check("new release prompts start a fresh workflow", newReleaseTask.completedGates.length === 0
    && newReleaseTask.releaseStatus === "PENDING"
    && newReleaseTask.diffIdentity === "")
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
  // Map each item through the local transformation.
  const skills = ["develop", "debugging", "code-review", "verification", "intake"].map((name) => ({ name }))
  const state = createEmptySessionState()
  const ambiguousRoute = cascadeRoute("debug this bug and review the diff", skills, state)
  const ambiguousWorkflow = buildWorkflowState("debug this bug and review the diff", state)
  const ambiguous = buildRoutingStatus(ambiguousRoute, { ...state, workflow: ambiguousWorkflow })
  const noMatch = buildRoutingStatus(cascadeRoute("", [], state), state)

  check("route match stays out of sidebar skills", ambiguous.activeSkills.length === 0)
  const explicit = buildRoutingStatus(null, state, "debugging")
  const persisted = buildRoutingStatus(null, { ...state, currentSkill: "debugging", routing: explicit })
  // Test whether any item satisfies the local predicate.
  check("status keeps active skill across later state updates", persisted.activeSkills.some((entry) => entry.skill === "debugging" && entry.current))
  const fallbackNoise = buildRoutingStatus(null, { ...state, currentSkill: "intake", matchedSkills: [{ name: "develop" }] })
  // Test whether any item satisfies the local predicate.
  check("develop fallback never displaces a loaded skill", fallbackNoise.activeSkills.some((entry) => entry.skill === "intake" && entry.current)
    // Test whether any item satisfies the local predicate.
    && !fallbackNoise.activeSkills.some((entry) => entry.skill === "develop"))
  check("no route exposes no fabricated skill", noMatch.activeSkills.length === 0 && !("workflow" in noMatch))
  check("fresh status carries no pending obligations", noMatch.pending.length === 0)

  const reviewDebt = buildRoutingStatus(null, { ...state, needsCodeReview: true, needsDesignReview: true, shouldCaptureImprovement: true })
  // Map each item through the local transformation.
  check("pending obligations expose code and design review only", reviewDebt.pending.map((entry) => entry.skill).join(",") === "code-review,design-review")
  check("pending obligations expose concrete load actions", reviewDebt.pending[0]?.action === "Read `~/.agents/skills/ask-code-review/SKILL.md`" && reviewDebt.pending[1]?.action === "Read `~/.agents/skills/ask-design-review/SKILL.md`")
  const previousSkillsDir = process.env.ASK_SKILLS_DIR
  process.env.ASK_SKILLS_DIR = path.join(path.sep, "opt", "relocated skills")
  try {
    const relocated = buildRoutingStatus(null, { ...state, needsCodeReview: true }).pending[0]?.action
    check("pending actions honor ASK_SKILLS_DIR and quote the path", relocated === `Read \`${path.join(path.sep, "opt", "relocated skills", "ask-code-review", "SKILL.md")}\``)
  } finally {
    if (previousSkillsDir === undefined) delete process.env.ASK_SKILLS_DIR
    else process.env.ASK_SKILLS_DIR = previousSkillsDir
  }
  check("cleared flags leave no pending obligations", buildRoutingStatus(null, { ...state, needsCodeReview: false }).pending.length === 0)

  const workflowCases = [
    ["fix typo in docs", "small"],
    ["add a focused parser feature", "normal"],
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
  checkReleaseValidationCadence()
  checkReviewAuditGuidance()
  checkModelRoutingGuidance()
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
