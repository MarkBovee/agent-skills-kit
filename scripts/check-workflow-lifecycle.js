#!/usr/bin/env node

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
  check("requirements prompt requires spec", classifyWorkflowRisk("write requirements specification") === "spec-required")
  check("security in a spec prompt stays significant", classifyWorkflowRisk("design brief for a security vulnerability fix") === "significant")
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
  check("higher-risk flows keep separate review", ["spec-required", "significant", "release-sensitive"].every((risk) => reviewModeForRisk(risk) === "separate"))
  check("release flow has audit and release gate", requiredWorkflowPhases("release-sensitive").includes("AUDIT") && requiredWorkflowPhases("release-sensitive").includes("RELEASE_GATE"))
  check("spec flow places spec before plan", JSON.stringify(requiredWorkflowPhases("spec-required").slice(0, 3)) === JSON.stringify(["INTAKE", "SPEC", "PLAN"]))
  check("significant spec work keeps both spec and audit gates", requiredWorkflowPhases(
    classifyWorkflowRisk("design brief for a security vulnerability fix"),
    "design brief for a security vulnerability fix",
  ).includes("SPEC") && requiredWorkflowPhases(
    classifyWorkflowRisk("design brief for a security vulnerability fix"),
    "design brief for a security vulnerability fix",
  ).includes("AUDIT"))
  check("release flow can include conditional spec", requiredWorkflowPhases("release-sensitive", "new external contract").includes("SPEC")
    && requiredWorkflowPhases("release-sensitive", "new external contract").includes("RELEASE_GATE"))
}

// Keep release validation deferred until iterative findings are resolved.
function checkReleaseValidationCadence() {
  const workflowGuidance = fs.readFileSync("skills/ask-agent-workflows/SKILL.md", "utf8")
  const deltaHeading = "## Bounded narrow-fix release path"
  const metadataHeading = "## Metadata-only release fast path"
  const deltaGuidance = readMarkdownSection(workflowGuidance, deltaHeading)
  const metadataGuidance = readMarkdownSection(workflowGuidance, metadataHeading)
  const activeWorkflowGuidance = stripInactiveMarkdown(workflowGuidance)
  const activeLines = activeWorkflowGuidance.split(/\r?\n/)
  const deltaHeadingIndex = findMarkdownHeadingLine(activeLines, 0, deltaHeading)
  const metadataHeadingIndex = findMarkdownHeadingLine(activeLines, deltaHeadingIndex + 1, metadataHeading)
  check("release cadence and metadata sections are present in order",
    deltaGuidance !== "" && metadataGuidance !== "" && deltaHeadingIndex >= 0 && metadataHeadingIndex > deltaHeadingIndex)
  check("commented or fenced release-cadence examples are not active sections",
    readMarkdownSection(`~~~md\n${deltaHeading}\nDo not run the full suite during this findings loop\n~~~`, deltaHeading) === ""
      && readMarkdownSection(`<!--\n${deltaHeading}\nDo not run the full suite during this findings loop\n-->`, deltaHeading) === "")
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
    ["GitHub Copilot", ".github/skills/ask-agent-workflows/SKILL.md"],
    ["DeepSeek Harness", ".dsh/skills/ask-agent-workflows/SKILL.md"],
  ]
  for (const [platform, path] of generatedPaths) {
    const generatedGuidance = fs.readFileSync(path, "utf8")
    const generatedSection = readMarkdownSection(generatedGuidance, deltaHeading)
    check(`${platform} export matches canonical release cadence`, generatedSection === deltaGuidance)
    check(`${platform} export keeps metadata-only path after release cadence`,
      hasOrderedMarkdownSections(generatedGuidance, deltaHeading, metadataHeading))
  }
}

// Confirm required guidance sections both exist and appear in the intended order.
function hasOrderedGuidanceSections(content, firstSection, secondSection) {
  const firstIndex = content.indexOf(firstSection)
  const secondIndex = content.indexOf(secondSection)
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex
}

// Confirm exact Markdown sections appear in order outside comments and fences.
function hasOrderedMarkdownSections(content, firstHeading, secondHeading) {
  const lines = stripInactiveMarkdown(content).split(/\r?\n/)
  const firstIndex = findMarkdownHeadingLine(lines, 0, firstHeading)
  const secondIndex = findMarkdownHeadingLine(lines, firstIndex + 1, secondHeading)
  return firstIndex >= 0 && secondIndex > firstIndex
}

// Parse an ATX H2 title, including valid indentation and optional closing markers.
function parseH2Title(line) {
  const match = line.match(/^ {0,3}##(?:[ \t]+(.*?))?[ \t]*$/)
  if (!match) return null
  return (match[1] || "").replace(/[ \t]+#+[ \t]*$/, "").replace(/^[ \t]+|[ \t]+$/g, "")
}

// Reject backtick fence openers whose info string contains a backtick.
function opensMarkdownFence(marker, suffix) {
  return marker[0] !== "`" || !suffix.includes("`")
}

// Accept only valid Markdown fence closers with matching character and length.
function closesMarkdownFence(marker, suffix, fenceCharacter, fenceLength) {
  return marker[0] === fenceCharacter && marker.length >= fenceLength && /^[ \t]*$/.test(suffix)
}

// Find a required H2 or the next H2 in already-filtered active Markdown.
function findMarkdownHeadingLine(lines, startIndex, expectedHeading) {
  for (let index = 0; index < lines.length; index += 1) {
    if (index < startIndex) continue
    const title = parseH2Title(lines[index])
    if (title !== null && (expectedHeading ? title === expectedHeading.replace(/^##[ \t]*/, "").replace(/^[ \t]+|[ \t]+$/g, "") : true)) return index
  }

  return -1
}

// Extract one exact second-level Markdown section without including its successor.
function readMarkdownSection(content, heading) {
  const lines = stripInactiveMarkdown(content).split(/\r?\n/)
  const start = findMarkdownHeadingLine(lines, 0, heading)
  if (start < 0) return ""

  const nextHeading = findMarkdownHeadingLine(lines, start + 1, "")
  return lines.slice(start, nextHeading < 0 ? undefined : nextHeading).join("\n").trim()
}

// Remove fenced code and HTML comments before evaluating active Markdown guidance.
function stripInactiveMarkdown(content) {
  const lines = content.split(/\r?\n/)
  const activeLines = []
  let fenceCharacter = ""
  let fenceLength = 0
  let insideHtmlComment = false

  for (const line of lines) {
    if (fenceCharacter) {
      const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
      if (fenceMatch && closesMarkdownFence(fenceMatch[1], fenceMatch[2], fenceCharacter, fenceLength)) {
        fenceCharacter = ""
        fenceLength = 0
      }
      activeLines.push("")
      continue
    }

    if (!insideHtmlComment) {
      const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
      if (fenceMatch && opensMarkdownFence(fenceMatch[1], fenceMatch[2])) {
        fenceCharacter = fenceMatch[1][0]
        fenceLength = fenceMatch[1].length
        activeLines.push("")
        continue
      }
    }

    const visibleLine = stripHtmlCommentsFromLine(line, insideHtmlComment)
    insideHtmlComment = visibleLine.insideHtmlComment
    activeLines.push(visibleLine.text)
  }

  return activeLines.join("\n")
}

// Remove inline and multiline HTML comments while preserving active text on the line.
function stripHtmlCommentsFromLine(line, insideHtmlComment) {
  let text = ""
  let cursor = 0

  while (cursor < line.length) {
    if (insideHtmlComment) {
      const end = line.indexOf("-->", cursor)
      if (end < 0) return { text, insideHtmlComment: true }
      cursor = end + 3
      insideHtmlComment = false
      continue
    }

    const start = line.indexOf("<!--", cursor)
    if (start < 0) {
      text += line.slice(cursor)
      break
    }

    text += line.slice(cursor, start)
    cursor = start + 4
    insideHtmlComment = true
  }

  return { text, insideHtmlComment }
}

// Keep review scope and code-first audit contracts present in canonical and generated skills.
function checkReviewAuditGuidance() {
  const reviewGuidance = fs.readFileSync("skills/ask-code-review/SKILL.md", "utf8")
  const auditGuidance = fs.readFileSync("skills/ask-agent-workflows/SKILL.md", "utf8")
  const reviewContract = readMarkdownSection(reviewGuidance, "## Finding scope")
  const auditContract = readMarkdownSection(auditGuidance, "## Code-first independent audit")
  const activeReviewContract = reviewContract
  const activeAuditContract = auditContract

  check("actionable review findings anchor to a changed hunk or introduced behavior",
    activeReviewContract.includes("identify a changed hunk") && activeReviewContract.includes("direct behavior introduced by a changed hunk"))
  check("unchanged pre-existing behavior is context, not a regression finding",
    activeReviewContract.includes("Nearby unchanged lines are context; pre-existing behavior is not a regression just because the diff made it visible."))
  check("unknown review base or causal link blocks unsupported regression claims",
    activeReviewContract.includes("If the base diff or causal link cannot be established, report the review as blocked or limited instead of presenting an unsupported regression."))
  check("renamed or fenced section headings are not treated as canonical sections",
    readMarkdownSection("## Finding scope (deprecated)\nold text", "## Finding scope") === ""
      && readMarkdownSection("```md\n## Finding scope\n```", "## Finding scope") === ""
      && readMarkdownSection("## Finding scope\nkeep\n   ## # Next section\nexclude", "## Finding scope") === "## Finding scope\nkeep"
      && readMarkdownSection("## Finding scope\nkeep\n##\nexclude", "## Finding scope") === "## Finding scope\nkeep"
      && readMarkdownSection("## Finding scope\u00a0\nspoof\n## Finding scope\nactive", "## Finding scope") === "## Finding scope\nactive"
      && readMarkdownSection("##\u00a0Finding scope\nspoof\n## Finding scope\nactive", "## Finding scope") === "## Finding scope\nactive"
      && readMarkdownSection("<!--\n## Finding scope\nspoof\n-->\n## Finding scope\nactive", "## Finding scope") === "## Finding scope\nactive"
      && readMarkdownSection("```md\n<!--\n```\n## Finding scope\nactive", "## Finding scope") === "## Finding scope\nactive")
  check("invalid backtick fence openers do not hide real section boundaries",
    stripInactiveMarkdown("```info`\nA green focused suite does not close an audit finding.\nactive")
      .includes("A green focused suite does not close an audit finding")
      && readMarkdownSection("## Finding scope\nactive\n```info`\n## Next section\nexclude", "## Finding scope")
        === "## Finding scope\nactive\n```info`")
  check("fence closers require matching markers and ASCII whitespace only",
    closesMarkdownFence("~~~~", " \t", "~", 3)
      && !closesMarkdownFence("~~", "", "~", 3)
      && !closesMarkdownFence("~~~", "\u00a0", "~", 3)
      && !closesMarkdownFence("```", "", "~", 3))
  check("fenced contract text cannot satisfy active guidance assertions",
    !stripInactiveMarkdown("```md\nA green focused suite does not close an audit finding.\n```\nactive text")
      .includes("A green focused suite does not close an audit finding")
      && !stripInactiveMarkdown("~~~md\nA green focused suite does not close an audit finding.\n~~~\u00a0\nstill fenced\n~~~")
        .includes("A green focused suite does not close an audit finding"))
  check("HTML-commented contract text cannot satisfy active guidance assertions",
    !readMarkdownSection("## Finding scope\n<!-- hidden\nA review finding must identify a changed hunk.\n-->\nactive", "## Finding scope")
      .includes("A review finding must identify a changed hunk"))
  check("headings inside NBSP-terminated fences cannot supply section boundaries",
    readMarkdownSection("~~~md\n## Finding scope\n~~~\u00a0\n## Additional axes\n~~~\n## Finding scope\nactive\n## Next section\nexcluded", "## Finding scope")
      === "## Finding scope\nactive")
  check("audit traces production paths and invariants before tests",
    hasOrderedGuidanceSections(activeAuditContract, "identify affected entry points, callers, state transitions, cleanup paths, fallback decisions", "inspect only the tests")
      && hasOrderedGuidanceSections(activeAuditContract, "the invariants they must preserve", "inspect only the tests")
      && activeAuditContract.includes("entry points, callers, state transitions, cleanup paths, fallback decisions"))
  check("missing or reversed audit-order markers fail the section-order predicate",
    !hasOrderedGuidanceSections("inspect only the tests", "before inspecting tests", "inspect only the tests")
      && !hasOrderedGuidanceSections("inspect only the tests before inspecting tests", "before inspecting tests", "inspect only the tests"))
  check("audit distinguishes implementation inspection from validation and coverage review",
    activeAuditContract.includes("not validation or a test-coverage inventory")
      && activeAuditContract.includes("Validation owns whether the defined suite passes"))
  check("green focused tests do not dismiss an open production bypass",
    activeAuditContract.includes("A green focused suite does not close an audit finding while a production-code bypass remains"))
  check("audit guidance gives a concrete passing-test production-bypass example",
    activeAuditContract.includes("a focused test passes for a normal response, but an error-shaped row can still reach a production fallback"))
  check("audit findings and clean-pass reports require production-path evidence",
    activeAuditContract.includes("production path, violated invariant, plausible trigger, user impact, and smallest regression proof")
      && activeAuditContract.includes("name the implementation paths and bypass categories inspected"))
  check("audit handoff separates code-first evidence from validation results",
    activeAuditContract.includes("### Independent audit handoff")
      && activeAuditContract.includes("The validator owns suite execution and pass/fail reporting"))

  const generatedPaths = [
    ["GitHub Copilot", ".github/skills/ask-code-review/SKILL.md", ".github/skills/ask-agent-workflows/SKILL.md"],
    ["DeepSeek Harness", ".dsh/skills/ask-code-review/SKILL.md", ".dsh/skills/ask-agent-workflows/SKILL.md"],
  ]
  for (const [platform, reviewPath, auditPath] of generatedPaths) {
    const generatedReview = fs.readFileSync(reviewPath, "utf8")
    const generatedAudit = fs.readFileSync(auditPath, "utf8")
    const exportedReviewContract = readMarkdownSection(generatedReview, "## Finding scope")
    const exportedAuditContract = readMarkdownSection(generatedAudit, "## Code-first independent audit")
    check(`${platform} export preserves the complete canonical review finding-scope section`,
      exportedReviewContract === reviewContract)
    check(`${platform} export preserves the complete canonical code-first audit section and handoff`,
      exportedAuditContract === auditContract)
  }
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
  const contractRelease = buildWorkflowState("prepare release candidate with new external contract")
  const continuedContractRelease = buildWorkflowState("run validation", { workflow: contractRelease })
  check("conditional spec gate survives follow-up prompts", continuedContractRelease.requiredPhases.includes("SPEC"))

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
  const skills = ["develop", "debugging", "code-review", "verification", "spec", "intake"].map((name) => ({ name }))
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
  const fallbackNoise = buildRoutingStatus(null, { ...state, currentSkill: "spec", matchedSkills: [{ name: "develop" }] })
  // Test whether any item satisfies the local predicate.
  check("develop fallback never displaces a loaded skill", fallbackNoise.activeSkills.some((entry) => entry.skill === "spec" && entry.current)
    // Test whether any item satisfies the local predicate.
    && !fallbackNoise.activeSkills.some((entry) => entry.skill === "develop"))
  check("no route exposes no fabricated skill", noMatch.activeSkills.length === 0 && !("workflow" in noMatch))
  check("fresh status carries no pending obligations", noMatch.pending.length === 0)

  const reviewDebt = buildRoutingStatus(null, { ...state, needsCodeReview: true, needsDesignReview: true, shouldCaptureImprovement: true })
  // Map each item through the local transformation.
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
  checkReleaseValidationCadence()
  checkReviewAuditGuidance()
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
