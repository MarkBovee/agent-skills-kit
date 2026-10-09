// Verify the exported router definition and its OpenCode V2 hook registrations.
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const require = createRequire(import.meta.url)

const skillRoot = await mkdtemp(join(tmpdir(), "ask-opencode-v2-plugin-"))
await Promise.all([
  mkdir(join(skillRoot, "ask-develop")),
  mkdir(join(skillRoot, "ask-code-review")),
  mkdir(join(skillRoot, "external-skill")),
])
const outsideSkillRoot = await mkdtemp(join(tmpdir(), "ask-opencode-outside-skill-"))
await Promise.all([
  writeFile(join(skillRoot, "ask-develop", "SKILL.md"), "---\nname: develop\ndescription: ASK workflow\ntriggers:\n  - test\n---\n"),
  writeFile(join(skillRoot, "ask-code-review", "SKILL.md"), "---\nname: code-review\ndescription: ASK review workflow\ntriggers:\n  - review\n---\n"),
  writeFile(join(skillRoot, "external-skill", "SKILL.md"), "---\nname: external-skill\ndescription: Must not appear in ASK\ntriggers:\n  - test\n---\n"),
  writeFile(join(outsideSkillRoot, "SKILL.md"), "---\nname: design-review\ndescription: Outside ASK root\n---\n"),
])
await symlink(outsideSkillRoot, join(skillRoot, "ask-design"))
process.env.ASK_SKILLS_DIR = skillRoot
const planWorkspace = await mkdtemp(join(skillRoot, "plan-workspace-"))
await Promise.all([
  mkdir(join(planWorkspace, "plans")),
  mkdir(join(planWorkspace, "src")),
])
await mkdir(join(planWorkspace, "plans", "nested"))
await Promise.all([
  writeFile(join(planWorkspace, "plans", "session.md"), "# Session plan\n"),
  writeFile(join(planWorkspace, "plans", "README.md"), "# Plan index\n"),
  writeFile(join(planWorkspace, "plans", "nested", "README.md"), "# Nested plan\n"),
  writeFile(join(planWorkspace, "src", "source.js"), "export {}\n"),
  writeFile(join(planWorkspace, "plans", "deleted.md"), "# Deleted plan\n"),
])
await symlink("../src/source.js", join(planWorkspace, "plans", "linked.md"))
await rm(join(planWorkspace, "plans", "deleted.md"))
const symlinkIndexWorkspace = await mkdtemp(join(skillRoot, "symlink-index-workspace-"))
await mkdir(join(symlinkIndexWorkspace, "plans"))
await writeFile(join(symlinkIndexWorkspace, "plans", "nested.md"), "# Nested plan\n")
await symlink("nested.md", join(symlinkIndexWorkspace, "plans", "README.md"))

const { default: plugin } = await import("../plugins/agent-skills-router/server.mjs")
const {
  ASK_SKILL_NAMES: sidebarAskSkillNames,
  mergeActiveSkills,
  pendingItems,
  planGateItems: readPlanGateItems,
  planGateText,
  sidebarColors,
} = await import("../plugins/agent-skills-router/sidebar-status.js")
const sidebarStatusSource = await readFile(new URL("../plugins/agent-skills-router/sidebar-status.js", import.meta.url), "utf8")
const { ASK_SKILL_NAMES: coreAskSkillNames } = require("../core/router-core.js")

// Default fixtures to their isolated workspace while preserving explicit missing-root cases.
function planGateItems(messages = [], workspaceDirectory) {
  const resolvedWorkspace = arguments.length < 2 ? planWorkspace : workspaceDirectory
  return readPlanGateItems(messages, resolvedWorkspace)
}

let nextFixtureToolTime = 1

// Supply stable OpenCode-like tool timestamps across pending and completed snapshots.
function fixtureToolTime(entry, status, createdTimes) {
  const partID = typeof entry.id === "string" ? entry.id : ""
  let created = entry.createdAt
  if (!Number.isFinite(created)) {
    created = partID && createdTimes.has(partID) ? createdTimes.get(partID) : nextFixtureToolTime
    if (!partID || !createdTimes.has(partID)) nextFixtureToolTime += 10
  }
  if (partID) createdTimes.set(partID, created)
  return {
    created,
    ran: entry.ranAt ?? created + 1,
    ...( ["completed", "error"].includes(status) && !entry.omitCompletedAt
      ? { completed: entry.completedAt ?? created + 2 }
      : {}),
  }
}

// Build workflow history from explicit delegated markers, never prompt claims.
function workflowHistory(prompt, evidence) {
  const history = [{ type: "user", content: [{ type: "text", text: prompt }] }]
  const createdTimes = new Map()
  for (const entry of evidence) {
    if (entry.tool === "task") {
      const status = entry.status || "completed"
      history.push({
        type: "assistant",
        content: [{
          type: "tool",
          name: "task",
          id: entry.id,
          state: {
            status,
            input: entry.input || {},
            content: entry.output && !entry.outputOnly && !entry.resultOnly
              ? [{ type: "text", text: entry.output }]
              : [],
            ...(entry.outputOnly ? { output: entry.output } : {}),
            ...(entry.resultOnly ? { result: entry.output } : {}),
            error: entry.error,
          },
          time: fixtureToolTime(entry, status, createdTimes),
        }],
      })
      continue
    }
    if (entry.tool === "write" || entry.tool === "patch") {
      history.push({
        type: "assistant",
        content: [{
          type: "tool",
          name: entry.tool,
          id: Object.hasOwn(entry, "id") ? entry.id : `fixture-${history.length}`,
          state: { status: entry.status || "completed", input: {
            filePath: entry.filePath,
            diffIdentity: entry.diffIdentity,
            patchText: entry.patchText,
          } },
          time: fixtureToolTime(entry, entry.status || "completed", createdTimes),
        }],
      })
      continue
    }
    if (typeof entry.output === "string") {
      history.push({
        type: "assistant",
        content: [{
          type: "tool",
          name: "task",
          id: Object.hasOwn(entry, "id") ? entry.id : `fixture-${history.length}`,
          state: { status: "completed", content: [{ type: "text", text: entry.output }] },
          time: fixtureToolTime(entry, "completed", createdTimes),
        }],
      })
      continue
    }
    if (entry.tool === "bash") {
      const status = entry.status || "completed"
      history.push({
        type: "assistant",
        content: [{ type: "tool", name: "bash", id: entry.id, state: { status, input: {
          command: entry.command,
          workdir: entry.workdir,
        } }, time: fixtureToolTime(entry, status, createdTimes) }],
      })
      continue
    }
    if (entry.tool) {
      history.push({
        type: "assistant",
        content: [{ type: "tool", name: entry.tool, id: entry.id, state: {
          status: entry.status || "completed",
          input: entry.input || {},
        }, time: fixtureToolTime(entry, entry.status || "completed", createdTimes) }],
      })
      continue
    }
    const { phase, result = "PASS", diff = "" } = entry
    history.push({
      type: "assistant",
      content: [{
        type: "tool",
        name: "task",
        id: Object.hasOwn(entry, "id") ? entry.id : `fixture-${history.length}`,
        state: {
          status: "completed",
          content: [{ type: "text", text: `ASK_WORKFLOW_${result} phase=${phase}${diff ? ` diff=${diff}` : ""}` }],
        },
        time: fixtureToolTime(entry, "completed", createdTimes),
      }],
    })
  }
  return history
}

// Compare an observed ledger to its exact ordered phase/status snapshot.
function assertGateSnapshot(gates, expected, label) {
  const actual = []
  for (const gate of gates || []) actual.push(`${gate.phase}=${gate.status}`)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${expected.join(", ")}; received ${actual.join(", ")}`)
  }
}

// Verify the five-gate contract and restrict every emitted status value.
function assertGateContract(gates, label) {
  const phases = []
  const allowed = new Set(["PENDING", "NOT STARTED", "PASS", "FINDINGS", "BLOCKED"])
  for (const gate of gates || []) {
    phases.push(gate.phase)
    if (!allowed.has(gate.status)) throw new Error(`${label}: unexpected gate status ${gate.status}`)
  }
  const expected = ["PLAN_CHECK", "VALIDATE", "REVIEW", "AUDIT", "RELEASE_GATE"]
  if (JSON.stringify(phases) !== JSON.stringify(expected)) {
    throw new Error(`${label}: incorrect gate rows ${phases.join(", ")}`)
  }
}

if (sidebarStatusSource.includes("router-core.js")) {
  throw new Error("OpenCode TUI helper must not import the CommonJS router core")
}
if (JSON.stringify([...sidebarAskSkillNames].sort()) !== JSON.stringify([...coreAskSkillNames].sort())) {
  throw new Error("OpenCode TUI skill roster drifted from the router core")
}

if (planGateItems([]) !== null
  || planGateItems([{ type: "user", content: [{ type: "text", text: "ASK_WORKFLOW_PASS phase=PLAN" }] }]) !== null) {
  throw new Error("OpenCode TUI must hide the plan ledger without workflow evidence")
}

if (planGateItems(workflowHistory("add a status panel", [
  { output: "Quoted source text: ASK_WORKFLOW_PASS phase=PLAN" },
  { output: "`ASK_WORKFLOW_PASS phase=PLAN_CHECK`" },
  { output: "    ASK_WORKFLOW_PASS phase=PLAN\n\tASK_WORKFLOW_PASS phase=PLAN_CHECK" },
  { output: "```text\nASK_WORKFLOW_PASS phase=PLAN\n```" },
  { output: "````markdown\n```text\nASK_WORKFLOW_PASS phase=PLAN\n```\n````" },
])) !== null) {
  throw new Error("OpenCode TUI accepted quoted or embedded workflow marker text")
}

for (const output of [
  "ASK_WORKFLOW_PASS phase=PLAN unexpected",
  "ASK_WORKFLOW_PASS phase=PLAN diff=one diff=two",
  "ASK_WORKFLOW_PASS diff=one phase=PLAN",
]) {
  if (planGateItems(workflowHistory("add a status panel", [{ output }])) !== null) {
    throw new Error(`OpenCode TUI accepted malformed workflow evidence: ${output}`)
  }
}

const riskPrompts = [
  "small local fix",
  "add a status panel",
  "review a security change",
  "release-sensitive brief",
]
for (const prompt of riskPrompts) {
  const ledger = planGateItems(workflowHistory(prompt, [{ phase: "PLAN" }]))
  assertGateContract(ledger, prompt)
  assertGateSnapshot(ledger, [
    "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
    "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
  ], `${prompt} plan snapshot`)
}

const prePlan = planGateItems(workflowHistory("add a status panel", [
  { phase: "INTAKE" },
]))
assertGateSnapshot(prePlan, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "before the plan passes")

const planOnlyHistory = [{ phase: "PLAN" }]
const planOnly = planGateItems(workflowHistory("add a status panel", planOnlyHistory))
assertGateSnapshot(planOnly, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after plan passes")

const planCheckHistory = [...planOnlyHistory, { phase: "PLAN_CHECK" }]
const planChecked = planGateItems(workflowHistory("add a status panel", planCheckHistory))
assertGateSnapshot(planChecked, [
  "PLAN_CHECK=PASS", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after plan check passes")

const sessionGenerationFallback = planGateItems(workflowHistory("add a status panel", [
  ...planOnlyHistory,
  { tool: "write", id: "session-local-edit", filePath: "src/file.js" },
  { tool: "task", id: "fresh-session-plan-check", output: "ASK_WORKFLOW_PASS phase=PLAN_CHECK" },
]), planWorkspace)
assertGateSnapshot(sessionGenerationFallback, [
  "PLAN_CHECK=PASS", "VALIDATE=PENDING", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after a fresh plan-check binds to a parent edit's session generation")

const aliasMismatchAfterGeneration = planGateItems(workflowHistory("add a status panel", [
  ...planOnlyHistory,
  { tool: "write", id: "alias-source-edit", filePath: "src/file.js" },
  { tool: "task", id: "alias-plan-check", output: "ASK_WORKFLOW_PASS phase=PLAN_CHECK diff=alias:A" },
  { tool: "task", id: "wrong-alias-validate", output: "ASK_WORKFLOW_PASS phase=VALIDATE diff=other" },
]), planWorkspace)
assertGateSnapshot(aliasMismatchAfterGeneration, [
  "PLAN_CHECK=PASS", "VALIDATE=PENDING", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when a bound diff alias is followed by mismatched gate evidence")

const executedHistory = [
  ...planOnlyHistory,
  { tool: "write", filePath: "src/file.js", diffIdentity: "HEAD" },
  { phase: "PLAN_CHECK", diff: "HEAD:edit-1" },
]
const executed = planGateItems(workflowHistory("add a status panel", executedHistory))
assertGateSnapshot(executed, [
  "PLAN_CHECK=PASS", "VALIDATE=PENDING", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after execution passes")

const validatedHistory = [...executedHistory, { phase: "VALIDATE", diff: "HEAD:edit-1" }]
const validated = planGateItems(workflowHistory("add a status panel", validatedHistory))
assertGateSnapshot(validated, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=PENDING",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after validation passes")

const reviewedHistory = [...validatedHistory, { phase: "REVIEW", diff: "HEAD:edit-1" }]
const reviewed = planGateItems(workflowHistory("add a status panel", reviewedHistory))
assertGateSnapshot(reviewed, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=PASS",
  "AUDIT=PENDING", "RELEASE_GATE=NOT STARTED",
], "after review passes")

const auditedHistory = [...reviewedHistory, { phase: "AUDIT", diff: "HEAD:edit-1" }]
const audited = planGateItems(workflowHistory("add a status panel", auditedHistory))
assertGateSnapshot(audited, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=PASS", "AUDIT=PASS", "RELEASE_GATE=PENDING",
], "after audit passes")

const releaseWithoutDiff = planGateItems(workflowHistory("add a status panel", [
  ...auditedHistory,
  { phase: "RELEASE_GATE" },
]))
assertGateSnapshot(releaseWithoutDiff, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=PASS", "AUDIT=PASS", "RELEASE_GATE=PENDING",
], "when release gate omits final diff evidence after a source edit")

const releaseWithFinalDiff = planGateItems(workflowHistory("add a status panel", [
  ...planOnlyHistory,
  { tool: "write", id: "release-source-edit", filePath: "src/file.js" },
  { tool: "task", id: "release-plan-check", output: "ASK_WORKFLOW_PASS phase=PLAN_CHECK" },
  { tool: "task", id: "release-validate", output: "ASK_WORKFLOW_PASS phase=VALIDATE diff=final:1" },
  { tool: "task", id: "release-review", output: "ASK_WORKFLOW_PASS phase=REVIEW diff=final:1" },
  { tool: "task", id: "release-audit", output: "ASK_WORKFLOW_PASS phase=AUDIT diff=final:1" },
  { tool: "task", id: "release-with-diff", output: "ASK_WORKFLOW_PASS phase=RELEASE_GATE diff=final:1" },
]), planWorkspace)
assertGateSnapshot(releaseWithFinalDiff, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=PASS", "AUDIT=PASS", "RELEASE_GATE=PENDING",
], "when a task-claimed diff has no verified native host alias")

const verifiedReleaseDiff = planGateItems(workflowHistory("add a status panel", [
  ...auditedHistory,
  { phase: "RELEASE_GATE", diff: "HEAD:edit-1" },
]))
assertGateSnapshot(verifiedReleaseDiff, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=PASS", "AUDIT=PASS", "RELEASE_GATE=PENDING",
], "when tool-input diffIdentity is not independently host-verified")

const completeHistory = [
  ...planOnlyHistory,
  { tool: "task", id: "baseline-execute", output: "ASK_WORKFLOW_PASS phase=EXECUTE diff=baseline:1" },
  { tool: "task", id: "baseline-plan-check", output: "ASK_WORKFLOW_PASS phase=PLAN_CHECK diff=baseline:1" },
  { tool: "task", id: "baseline-validate", output: "ASK_WORKFLOW_PASS phase=VALIDATE diff=baseline:1" },
  { tool: "task", id: "baseline-review", output: "ASK_WORKFLOW_PASS phase=REVIEW diff=baseline:1" },
  { tool: "task", id: "baseline-audit", output: "ASK_WORKFLOW_PASS phase=AUDIT diff=baseline:1" },
  { tool: "task", id: "baseline-release", output: "ASK_WORKFLOW_PASS phase=RELEASE_GATE diff=baseline:1" },
]
const completeLedger = planGateItems(workflowHistory("add a status panel", completeHistory))
assertGateSnapshot(completeLedger, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=PASS", "AUDIT=PASS", "RELEASE_GATE=PENDING",
], "after source edits without a verified host alias")

const orderedMultiMarker = planGateItems(workflowHistory("add a status panel", [
  ...executedHistory,
  {
    output: [
      "ASK_WORKFLOW_PASS phase=VALIDATE diff=HEAD:edit-1",
      "ASK_WORKFLOW_PASS phase=REVIEW diff=HEAD:edit-1",
      "ASK_WORKFLOW_PASS phase=AUDIT diff=HEAD:edit-1",
      "ASK_WORKFLOW_PASS phase=RELEASE_GATE diff=HEAD:edit-1",
      "ASK_WORKFLOW_FINDINGS phase=REVIEW diff=HEAD:edit-1",
    ].join("\n"),
  },
]))
assertGateSnapshot(orderedMultiMarker, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=FINDINGS",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after ordered multi-phase markers and later findings")

const duplicateMarkerHistory = workflowHistory("add a status panel", [
  ...executedHistory,
  { phase: "VALIDATE", diff: "HEAD:edit-1" },
  { phase: "REVIEW", diff: "HEAD:edit-1", id: "review-pass" },
  { phase: "AUDIT", diff: "HEAD:edit-1" },
  { phase: "RELEASE_GATE", diff: "HEAD:edit-1" },
  { phase: "REVIEW", result: "FINDINGS", diff: "HEAD:edit-1", id: "review-findings" },
])
let duplicateReviewPassMessage = null
for (const message of duplicateMarkerHistory) {
  for (const part of message.content || []) {
    if (part.id === "review-pass") duplicateReviewPassMessage = message
  }
}
duplicateMarkerHistory.push(duplicateReviewPassMessage)
const duplicateReviewPass = planGateItems(duplicateMarkerHistory)
assertGateSnapshot(duplicateReviewPass, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=FINDINGS",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when an already-processed task part reappears after findings")

const exactTaskReplayAfterFindings = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "task", id: "conflicted-task-id", output: "ASK_WORKFLOW_PASS phase=REVIEW diff=baseline:1" },
  { tool: "task", id: "new-review-findings", output: "ASK_WORKFLOW_FINDINGS phase=REVIEW diff=baseline:1" },
  { tool: "task", id: "conflicted-task-id", output: "ASK_WORKFLOW_PASS phase=REVIEW diff=baseline:1" },
]))
assertGateSnapshot(exactTaskReplayAfterFindings, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=FINDINGS",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when an exact completed task replay follows later findings")

const outputOnlyTaskConflict = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "task",
    id: "output-only-task",
    outputOnly: true,
    output: "ASK_WORKFLOW_PASS phase=REVIEW diff=baseline:1",
  },
  { tool: "task", id: "output-only-findings", output: "ASK_WORKFLOW_FINDINGS phase=REVIEW diff=baseline:1" },
  {
    tool: "task",
    id: "output-only-task",
    outputOnly: true,
    output: "ASK_WORKFLOW_FINDINGS phase=REVIEW diff=baseline:1",
  },
]))
assertGateSnapshot(outputOnlyTaskConflict, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when legacy output-only evidence changes under a reused task ID")

const taskIDConflictVariants = [
  { output: "ASK_WORKFLOW_PASS phase=EXECUTE diff=baseline:1" },
  { status: "error" },
  { createdAt: 9001 },
  { input: { prompt: "different task input" } },
  { resultOnly: true, output: "ASK_WORKFLOW_FINDINGS phase=REVIEW diff=baseline:1" },
]
for (let index = 0; index < taskIDConflictVariants.length; index += 1) {
  const taskIDConflict = planGateItems(workflowHistory("add a status panel", [
    ...completeHistory,
    { tool: "task", id: `conflict-${index}`, output: "ASK_WORKFLOW_PASS phase=REVIEW diff=baseline:1" },
    { tool: "task", id: "later-findings", output: "ASK_WORKFLOW_FINDINGS phase=REVIEW diff=baseline:1" },
    { tool: "task", id: `conflict-${index}`, output: "ASK_WORKFLOW_PASS phase=REVIEW diff=baseline:1", ...taskIDConflictVariants[index] },
  ]))
  assertGateSnapshot(taskIDConflict, [
    "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
    "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
  ], `when a completed task ID conflicts in terminal field variant ${index}`)
}

const readOnlyTask = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "task", id: "review-task", output: "ASK_WORKFLOW_PASS phase=REVIEW diff=baseline:1" },
]))
assertGateSnapshot(readOnlyTask, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=PASS", "AUDIT=PASS", "RELEASE_GATE=PENDING",
], "after a delegated read-only review")

const pendingReadOnlyTask = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "task", id: "review-task", status: "running" },
]))
assertGateSnapshot(pendingReadOnlyTask, [
  "PLAN_CHECK=PENDING", "VALIDATE=PENDING", "REVIEW=PENDING", "AUDIT=PENDING", "RELEASE_GATE=PENDING",
], "while a delegated task is running")

const completedReadOnlyTask = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "task", id: "review-task", status: "running" },
  { tool: "task", id: "review-task", output: "ASK_WORKFLOW_PASS phase=REVIEW diff=baseline:1" },
]))
assertGateSnapshot(completedReadOnlyTask, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=PASS", "AUDIT=PASS", "RELEASE_GATE=PENDING",
], "after the running task completes as read-only")

const childExecuteTask = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "task", id: "execute-child", output: "ASK_WORKFLOW_PASS phase=EXECUTE diff=child:edit-1" },
]))
assertGateSnapshot(childExecuteTask, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after a delegated execute changes the current diff")

const conflictingTaskDiffs = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "task",
    id: "mixed-diff-child",
    output: "ASK_WORKFLOW_PASS phase=EXECUTE diff=A\nASK_WORKFLOW_PASS phase=REVIEW diff=B",
  },
  { tool: "task", id: "plan-check-a", output: "ASK_WORKFLOW_PASS phase=PLAN_CHECK diff=A" },
  { tool: "task", id: "plan-check-b", output: "ASK_WORKFLOW_PASS phase=PLAN_CHECK diff=B" },
]))
assertGateSnapshot(conflictingTaskDiffs, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after delegated task markers disagree on current diff")

const childExecuteRechecked = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "task", id: "execute-child", output: "ASK_WORKFLOW_PASS phase=EXECUTE diff=child:edit-1" },
  { tool: "task", id: "plan-check-child", output: "ASK_WORKFLOW_PASS phase=PLAN_CHECK diff=child:edit-1" },
]))
assertGateSnapshot(childExecuteRechecked, [
  "PLAN_CHECK=PASS", "VALIDATE=PENDING", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after plan-check revalidates a delegated execute diff")

const childRaceBaseTime = nextFixtureToolTime + 1000
const staleChildAfterParentEdit = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "write", id: "new-parent-diff", filePath: "src/source.js", diffIdentity: "PARENT", createdAt: childRaceBaseTime + 500, completedAt: childRaceBaseTime + 510 },
  {
    tool: "task",
    id: "old-child-result",
    output: "ASK_WORKFLOW_PASS phase=EXECUTE diff=child:old\nASK_WORKFLOW_PASS phase=PLAN_CHECK diff=child:old",
    createdAt: childRaceBaseTime + 400,
    completedAt: childRaceBaseTime + 600,
  },
  { tool: "task", id: "parent-plan-check", output: "ASK_WORKFLOW_PASS phase=PLAN_CHECK diff=PARENT:edit-1", createdAt: childRaceBaseTime + 700 },
]))
assertGateSnapshot(staleChildAfterParentEdit, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after an old child result crosses a newer parent diff")

const freshChildAfterParentEdit = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "write", id: "new-parent-diff", filePath: "src/source.js", diffIdentity: "PARENT", createdAt: childRaceBaseTime + 500, completedAt: childRaceBaseTime + 510 },
  { tool: "task", id: "fresh-child", status: "running", createdAt: childRaceBaseTime + 520 },
  {
    tool: "task",
    id: "fresh-child",
    output: "ASK_WORKFLOW_PASS phase=EXECUTE diff=child:new\nASK_WORKFLOW_PASS phase=PLAN_CHECK diff=child:new",
    createdAt: childRaceBaseTime + 520,
    completedAt: childRaceBaseTime + 530,
  },
]))
assertGateSnapshot(freshChildAfterParentEdit, [
  "PLAN_CHECK=PASS", "VALIDATE=PENDING", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after a fresh child task executes against the current parent diff")

const sameTaskExecuteCheck = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "task",
    id: "execute-and-check-child",
    output: "ASK_WORKFLOW_PASS phase=EXECUTE diff=child:edit-1\nASK_WORKFLOW_PASS phase=PLAN_CHECK diff=child:edit-1",
  },
]))
assertGateSnapshot(sameTaskExecuteCheck, [
  "PLAN_CHECK=PASS", "VALIDATE=PENDING", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when task markers recheck the matching execute diff in order")

const unboundChildExecution = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "task",
    id: "unbound-execute",
    output: "ASK_WORKFLOW_PASS phase=EXECUTE\nASK_WORKFLOW_PASS phase=PLAN_CHECK diff=child:edit-1",
  },
  { tool: "task", id: "plan-check-after-unbound", output: "ASK_WORKFLOW_PASS phase=PLAN_CHECK diff=child:edit-1" },
]))
assertGateSnapshot(unboundChildExecution, [
  "PLAN_CHECK=PASS", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when execution has no diff identity of its own")

for (const result of ["FINDINGS", "BLOCKED", "FAILED"]) {
  const failedChildExecution = planGateItems(workflowHistory("add a status panel", [
    ...completeHistory,
    { tool: "task", id: `failed-execute-${result}`, output: `ASK_WORKFLOW_${result} phase=EXECUTE diff=child:edit-1` },
    { tool: "task", id: `failed-plan-check-${result}`, output: "ASK_WORKFLOW_PASS phase=PLAN_CHECK diff=child:edit-1" },
  ]))
  assertGateSnapshot(failedChildExecution, [
    "PLAN_CHECK=PASS", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
    "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
  ], `after delegated execution ${result.toLowerCase()} then plan check`)
}

const childIterateTask = planGateItems(workflowHistory("add a status panel", [
  ...validatedHistory,
  { phase: "REVIEW", result: "FINDINGS", diff: "HEAD:edit-1" },
  { tool: "task", id: "iterate-child", output: "ASK_WORKFLOW_PASS phase=ITERATE diff=child:edit-2" },
]))
assertGateSnapshot(childIterateTask, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after delegated iteration changes source")

const unmarkedTask = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "task", id: "unknown-child", output: "Updated the source files" },
]))
assertGateSnapshot(unmarkedTask, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after an unmarked delegated task")

const missingTaskId = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "task", id: null, output: "ASK_WORKFLOW_PASS phase=REVIEW" },
]))
assertGateSnapshot(missingTaskId, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after task evidence without a stable ID")

const errorOnlyMarker = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "task", id: "error-only", error: "ASK_WORKFLOW_PASS phase=PLAN" },
]))
assertGateSnapshot(errorOnlyMarker, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after workflow marker text appears only in a tool error")

const editCompletion = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "write", id: "edit-running", filePath: "src/source.js", status: "running" },
  { tool: "write", id: "edit-running", filePath: "src/source.js", status: "completed", diffIdentity: "HEAD" },
  { phase: "PLAN_CHECK", diff: "HEAD:edit-1" },
]))
assertGateSnapshot(editCompletion, [
  "PLAN_CHECK=PASS", "VALIDATE=PENDING", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after a running edit binds its completed diff without a second generation")

const conflictingMutationBaseTime = nextFixtureToolTime + 1000
const conflictingMutationID = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "write", id: "reused-write", filePath: "src/source.js", diffIdentity: "HEAD", createdAt: conflictingMutationBaseTime + 10, completedAt: conflictingMutationBaseTime + 20 },
  { phase: "PLAN_CHECK", diff: "HEAD:edit-1", createdAt: conflictingMutationBaseTime + 30, completedAt: conflictingMutationBaseTime + 40 },
  { tool: "write", id: "reused-write", filePath: "src/source.js", diffIdentity: "NEW", createdAt: conflictingMutationBaseTime + 10, completedAt: conflictingMutationBaseTime + 50 },
]))
assertGateSnapshot(conflictingMutationID, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when a completed mutation tool ID is reused with different input")

const lateEditBaseTime = nextFixtureToolTime + 1000
const earlyPlanCheck = planGateItems(workflowHistory("add a status panel", [
  ...planOnlyHistory,
  { tool: "write", id: "late-edit", filePath: "src/source.js", status: "running", diffIdentity: "HEAD", createdAt: lateEditBaseTime + 500, ranAt: lateEditBaseTime + 501, completedAt: lateEditBaseTime + 502 },
  { phase: "PLAN_CHECK", diff: "HEAD:edit-1", createdAt: lateEditBaseTime + 501, completedAt: lateEditBaseTime + 503 },
  { tool: "write", id: "late-edit", filePath: "src/source.js", status: "completed", diffIdentity: "HEAD", createdAt: lateEditBaseTime + 500, ranAt: lateEditBaseTime + 501, completedAt: lateEditBaseTime + 502 },
]))
assertGateSnapshot(earlyPlanCheck, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when plan-check arrives before a running edit completes")

const postCompletionPlanCheck = planGateItems(workflowHistory("add a status panel", [
  ...planOnlyHistory,
  { tool: "write", id: "late-edit", filePath: "src/source.js", status: "running", diffIdentity: "HEAD", createdAt: lateEditBaseTime + 500, ranAt: lateEditBaseTime + 501, completedAt: lateEditBaseTime + 502 },
  { phase: "PLAN_CHECK", diff: "HEAD:edit-1", createdAt: lateEditBaseTime + 501, completedAt: lateEditBaseTime + 503 },
  { tool: "write", id: "late-edit", filePath: "src/source.js", status: "completed", diffIdentity: "HEAD", createdAt: lateEditBaseTime + 500, ranAt: lateEditBaseTime + 501, completedAt: lateEditBaseTime + 502 },
  { phase: "PLAN_CHECK", diff: "HEAD:edit-1", createdAt: lateEditBaseTime + 510, completedAt: lateEditBaseTime + 511 },
]))
assertGateSnapshot(postCompletionPlanCheck, [
  "PLAN_CHECK=PASS", "VALIDATE=PENDING", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after a new plan-check follows completed edit")

const failedRunningEditRecovery = planGateItems(workflowHistory("add a status panel", [
  ...planOnlyHistory,
  { tool: "write", id: "failed-running-edit", filePath: "src/source.js", status: "running", diffIdentity: "HEAD" },
  { tool: "write", id: "failed-running-edit", filePath: "src/source.js", status: "error", diffIdentity: "HEAD" },
  { phase: "PLAN_CHECK", diff: "HEAD:edit-1" },
  { tool: "write", id: "recovery-edit", filePath: "src/source.js", diffIdentity: "NEW" },
  { phase: "PLAN_CHECK", diff: "NEW:edit-2" },
]))
assertGateSnapshot(failedRunningEditRecovery, [
  "PLAN_CHECK=PASS", "VALIDATE=PENDING", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after a failed edit releases pending state and a new diff is checked")

const restartedPlan = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { phase: "PLAN", diff: "baseline:1" },
]))
assertGateSnapshot(restartedPlan, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after a new plan begins")

const failedPlan = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { phase: "PLAN", result: "FAILED", diff: "baseline:1" },
]))
assertGateSnapshot(failedPlan, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after a new plan fails")

const validateFindings = planGateItems(workflowHistory("add a status panel", [
  ...executedHistory,
  { phase: "VALIDATE", result: "FINDINGS", diff: "HEAD:edit-1" },
  { tool: "task", id: "validate-iterate", output: "ASK_WORKFLOW_PASS phase=ITERATE diff=child:edit-2" },
]))
assertGateSnapshot(validateFindings, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after validation findings are iterated")

const reviewFindings = planGateItems(workflowHistory("add a status panel", [
  ...validatedHistory,
  { phase: "REVIEW", result: "FINDINGS", diff: "HEAD:edit-1" },
  { tool: "task", id: "review-iterate", output: "ASK_WORKFLOW_PASS phase=ITERATE diff=child:edit-2" },
]))
assertGateSnapshot(reviewFindings, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after review findings are iterated")

const reviewResolved = planGateItems(workflowHistory("add a status panel", [
  ...validatedHistory,
  { phase: "REVIEW", result: "FINDINGS", diff: "HEAD:edit-1" },
  { tool: "task", id: "review-iterate", output: "ASK_WORKFLOW_PASS phase=ITERATE diff=child:edit-2" },
  { tool: "task", id: "review-plan-check", output: "ASK_WORKFLOW_PASS phase=PLAN_CHECK diff=child:edit-2" },
  { phase: "VALIDATE", diff: "child:edit-2" },
  { phase: "REVIEW", diff: "child:edit-2" },
]))
assertGateSnapshot(reviewResolved, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=PASS",
  "AUDIT=PENDING", "RELEASE_GATE=NOT STARTED",
], "after review findings are resolved")

const reviewRegressed = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { phase: "REVIEW", result: "FINDINGS", diff: "baseline:1" },
]))
assertGateSnapshot(reviewRegressed, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=FINDINGS",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when findings supersede a previous review pass")

const validationRegressed = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { phase: "VALIDATE", result: "FAILED", diff: "baseline:1" },
]))
assertGateSnapshot(validationRegressed, [
  "PLAN_CHECK=PASS", "VALIDATE=BLOCKED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when failure supersedes a previous validation pass")

for (const result of ["BLOCKED", "FAILED"]) {
  const blocked = planGateItems(workflowHistory("add a status panel", [
    ...executedHistory,
    { phase: "VALIDATE", result, diff: "HEAD:edit-1" },
  ]))
  assertGateSnapshot(blocked, [
    "PLAN_CHECK=PASS", "VALIDATE=BLOCKED", "REVIEW=NOT STARTED",
    "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
  ], `after validation ${result.toLowerCase()}`)
}

const validateResolved = planGateItems(workflowHistory("add a status panel", [
  ...executedHistory,
  { phase: "VALIDATE", result: "FINDINGS", diff: "HEAD:edit-1" },
  { tool: "task", id: "validate-iterate", output: "ASK_WORKFLOW_PASS phase=ITERATE diff=child:edit-2" },
  { tool: "task", id: "validate-plan-check", output: "ASK_WORKFLOW_PASS phase=PLAN_CHECK diff=child:edit-2" },
  { phase: "VALIDATE", diff: "child:edit-2" },
]))
assertGateSnapshot(validateResolved, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=PENDING",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after validation findings are resolved")

for (const phase of ["VALIDATE", "REVIEW"]) {
  const outOfOrder = planGateItems(workflowHistory("add a status panel", [{ phase }]))
  assertGateSnapshot(outOfOrder, [
    "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
    "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
  ], `first out-of-order ${phase} marker`)
}

const unidentifiedEdit = planGateItems(workflowHistory("add a status panel", [
  ...planOnlyHistory,
  { tool: "write", id: null, filePath: "src/file.js" },
  { phase: "PLAN_CHECK" },
]))
assertGateSnapshot(unidentifiedEdit, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after an unidentified source edit")

const mismatchedEdit = planGateItems(workflowHistory("add a status panel", [
  ...planOnlyHistory,
  { tool: "write", filePath: "src/file.js", diffIdentity: "HEAD" },
  { phase: "PLAN_CHECK", diff: "HEAD:edit-9" },
]))
assertGateSnapshot(mismatchedEdit, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after a mismatched diff marker")

const recoveredEdit = planGateItems(workflowHistory("add a status panel", [
  ...planOnlyHistory,
  { tool: "write", filePath: "src/file.js" },
  { tool: "write", filePath: "src/file.js", diffIdentity: "HEAD" },
  { phase: "PLAN_CHECK", diff: "HEAD:edit-2" },
]))
assertGateSnapshot(recoveredEdit, [
  "PLAN_CHECK=PASS", "VALIDATE=PENDING", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after matching diff evidence restores progress")

const missingTerminalCompletionTime = planGateItems(workflowHistory("add a status panel", [
  ...planOnlyHistory,
  { tool: "write", filePath: "src/file.js", diffIdentity: "HEAD", createdAt: 100, ranAt: 101, omitCompletedAt: true },
  { phase: "PLAN_CHECK", diff: "HEAD:edit-1", createdAt: 200, completedAt: 202 },
]), planWorkspace)
assertGateSnapshot(missingTerminalCompletionTime, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when edit completion time is missing despite ran/created timestamps")

const missingCompletionStaysAmbiguous = planGateItems(workflowHistory("add a status panel", [
  ...planOnlyHistory,
  { tool: "write", id: "untimed-edit", filePath: "src/file.js", diffIdentity: "HEAD", createdAt: 100, ranAt: 101, omitCompletedAt: true },
  { tool: "write", id: "later-timed-edit", filePath: "src/file.js", diffIdentity: "HEAD2", createdAt: 200, ranAt: 201, completedAt: 202 },
  { tool: "task", id: "fresh-after-timed-edit", output: "ASK_WORKFLOW_PASS phase=PLAN_CHECK", createdAt: 220, completedAt: 222 },
]), planWorkspace)
assertGateSnapshot(missingCompletionStaysAmbiguous, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when later timestamps cannot repair an earlier missing completion time")

const planDocumentWrite = planGateItems(workflowHistory("add a status panel", [
  ...planCheckHistory,
  { tool: "write", filePath: "plans/session.md" },
]), planWorkspace)
assertGateSnapshot(planDocumentWrite, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after substantive plan content changes without structured patch evidence")

const planDocumentPatch = planGateItems(workflowHistory("add a status panel", [
  ...planCheckHistory,
  {
    tool: "patch",
    patchText: "*** Begin Patch\n*** Update File: plans/session.md\n@@\n ## Gate ledger\n | Gate | Status | Evidence |\n ---|---|---\n-| PLAN_CHECK | PENDING | old evidence |\n+| PLAN_CHECK | PASS | updated evidence |\n*** End Patch",
  },
]), planWorkspace)
assertGateSnapshot(planDocumentPatch, [
  "PLAN_CHECK=PASS", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after patching a plan document")

const malformedLedgerSeparatorPatch = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "patch",
    patchText: "*** Begin Patch\n*** Update File: plans/session.md\n@@\n ## Gate ledger\n | Gate | Status | Evidence |\n | | |\n-| PLAN_CHECK | PASS | prior |\n+| PLAN_CHECK | PASS | modified |\n*** End Patch",
  },
]), planWorkspace)
assertGateSnapshot(malformedLedgerSeparatorPatch, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when malformed table separator context is used to spoof bookkeeping")

const ledgerShapedPlanBodyPatch = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "patch",
    patchText: "*** Begin Patch\n*** Update File: plans/session.md\n@@\n-# Status notes\n+| PLAN_CHECK | PASS | looks like a gate row |\n*** End Patch",
  },
]), planWorkspace)
assertGateSnapshot(ledgerShapedPlanBodyPatch, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when gate-like rows are changed outside the gate-ledger section")

const ledgerShapedBodyAfterGateHunk = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "patch",
    patchText: "*** Begin Patch\n*** Update File: plans/session.md\n@@\n ## Gate ledger\n | Gate | Status | Evidence |\n |---|---|---|\n-| PLAN_CHECK | PASS | prior |\n+| PLAN_CHECK | PASS | bookkeeping |\n@@\n # Status notes\n-| REVIEW | PASS | prior |\n+| REVIEW | PASS | body row |\n*** End Patch",
  },
]), planWorkspace)
assertGateSnapshot(ledgerShapedBodyAfterGateHunk, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when a later hunk edits gate-shaped text outside the ledger section")

for (const sectionBreak of [
  " Narrative paragraph\n",
  " Notes title\n ------\n",
]) {
  const gateRowAfterSectionBreak = planGateItems(workflowHistory("add a status panel", [
    ...completeHistory,
    {
      tool: "patch",
      patchText: `*** Begin Patch\n*** Update File: plans/session.md\n@@\n ## Gate ledger\n | Gate | Status | Evidence |\n |---|---|---|\n ${sectionBreak}-| PLAN_CHECK | PASS | old |\n+| PLAN_CHECK | PASS | changed outside table |\n*** End Patch`,
    },
  ]), planWorkspace)
  assertGateSnapshot(gateRowAfterSectionBreak, [
    "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
    "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
  ], `when prose or setext headings separate the gate table from a changed row (${sectionBreak.trim()})`)
}

const prefixedBodyLineAfterLedgerPatch = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "patch",
    patchText: "*** Begin Patch\n*** Update File: plans/session.md\n@@\n ## Gate ledger\n | Gate | Status | Evidence |\n |---|---|---|\n-| PLAN_CHECK | PASS | prior |\n+| PLAN_CHECK | PASS | updated |\n@@\n # Notes\n++# New body content\n*** End Patch",
  },
]), planWorkspace)
assertGateSnapshot(prefixedBodyLineAfterLedgerPatch, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when a later hunk adds body content beginning with a literal plus")

const scalarPathWithoutPatchTarget = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "patch",
    filePath: "plans/session.md",
    patchText: "@@\n-| PLAN_CHECK | PASS | prior |\n+| PLAN_CHECK | PASS | spoofed |",
  },
]), planWorkspace)
assertGateSnapshot(scalarPathWithoutPatchTarget, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when scalar path metadata substitutes for a structured patch target")

const ledgerShapedOtherPlanPatch = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "patch",
    patchText: "*** Begin Patch\n*** Update File: plans/session.md\n@@\n-# Status notes\n+| 001 | Show plan gate status in the OpenCode sidebar | P2 | M | — | DONE |\n*** End Patch",
  },
]), planWorkspace)
assertGateSnapshot(ledgerShapedOtherPlanPatch, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when a plan-index-shaped row is changed outside plans/README.md")

const additionalPlanTargetPatch = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "patch",
    filePath: "plans/session.md",
    patchText: "*** Begin Patch\n*** Update File: plans/nested/README.md\n@@\n ## Gate ledger\n | Gate | Status | Evidence |\n |---|---|---|\n-| PLAN_CHECK | PASS | old |\n+| PLAN_CHECK | PASS | new |\n*** End Patch",
  },
]), planWorkspace)
assertGateSnapshot(additionalPlanTargetPatch, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when patch input names more than one plan target")

const nestedPlanIndexPatch = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "patch",
    patchText: "*** Begin Patch\n*** Update File: plans/nested/README.md\n@@\n-| 001 | Nested plan | P2 | M | — | IN PROGRESS |\n+| 001 | Nested plan | P2 | M | — | DONE |\n*** End Patch",
  },
]), planWorkspace)
assertGateSnapshot(nestedPlanIndexPatch, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when a nested README attempts the plan-index status exemption")

const planIndexStatusPatch = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "patch",
    patchText: "*** Begin Patch\n*** Update File: plans/README.md\n@@\n-| 001 | Show plan gate status in the OpenCode sidebar | P2 | M | — | IN PROGRESS |\n+| 001 | Show plan gate status in the OpenCode sidebar | P2 | M | — | DONE |\n*** End Patch",
  },
]), planWorkspace)
assertGateSnapshot(planIndexStatusPatch, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=PASS", "AUDIT=PASS", "RELEASE_GATE=PENDING",
], "after changing only the plan index status cell")

const symlinkIndexPatch = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "patch",
    patchText: "*** Begin Patch\n*** Update File: plans/README.md\n@@\n-| 001 | Show plan gate status in the OpenCode sidebar | P2 | M | — | IN PROGRESS |\n+| 001 | Show plan gate status in the OpenCode sidebar | P2 | M | — | DONE |\n*** End Patch",
  },
]), symlinkIndexWorkspace)
assertGateSnapshot(symlinkIndexPatch, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when the plan index path resolves through a symlink")

const unstructuredPlanWrite = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "write",
    filePath: "plans/session.md",
    patchText: "-| PLAN_CHECK | PASS | prior evidence |\n+| PLAN_CHECK | PASS | rewritten evidence |",
  },
]), planWorkspace)
assertGateSnapshot(unstructuredPlanWrite, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after an unstructured write claims to change only ledger rows")

const substantivePlanPatch = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "patch",
    patchText: "*** Begin Patch\n*** Update File: plans/session.md\n@@\n-# Session plan\n+# Revised session plan\n*** End Patch",
  },
]))
assertGateSnapshot(substantivePlanPatch, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after substantive plan patch invalidates prior plan approval")

const deletedPlanPatch = planGateItems(workflowHistory("add a status panel", [
  ...planCheckHistory,
  { tool: "patch", patchText: "*** Begin Patch\n*** Delete File: plans/deleted.md\n*** End Patch" },
]), planWorkspace)
assertGateSnapshot(deletedPlanPatch, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after deleting a plan under the workspace plans directory")

const deletedPlanMissingParent = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "patch", patchText: "*** Begin Patch\n*** Delete File: plans/missing/deleted.md\n*** End Patch" },
]), planWorkspace)
assertGateSnapshot(deletedPlanMissingParent, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after deleting a plan with a missing parent")

const nestedPlanAdd = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "patch", patchText: "*** Begin Patch\n*** Add File: plans/new/subplan.md\n+# New plan\n*** End Patch" },
]), planWorkspace)
assertGateSnapshot(nestedPlanAdd, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when a new nested plan is added under a missing parent directory")

const mixedPatch = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "patch",
    filePath: "plans/session.md",
    patchText: "*** Begin Patch\n*** Update File: plans/session.md\n*** Update File: src/file.js\n*** End Patch",
  },
]), planWorkspace)
assertGateSnapshot(mixedPatch, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after a mixed plan and source patch")

const movedPatch = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  {
    tool: "patch",
    filePath: "plans/session.md",
    patchText: "*** Begin Patch\n*** Update File: plans/session.md\n*** Move to: src/file.js\n*** End Patch",
  },
]), planWorkspace)
assertGateSnapshot(movedPatch, [
  "PLAN_CHECK=NOT STARTED", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after moving a plan document into source")

const traversedPlanPath = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "write", filePath: "plans/../AGENTS.md" },
]))
assertGateSnapshot(traversedPlanPath, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after a path-traversal source write")

const reenteredPlanPath = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "write", filePath: "plans/../../../plans/outside.md" },
]))
assertGateSnapshot(reenteredPlanPath, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after traversal re-enters a plans directory")

const symlinkPlanPath = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "write", filePath: "plans/linked.md" },
]), planWorkspace)
assertGateSnapshot(symlinkPlanPath, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after writing through a symlink in plans")

const sessionA = planGateItems(workflowHistory("add a status panel", completeHistory))
const sessionB = planGateItems(workflowHistory("add a status panel", [{ phase: "PLAN" }]))
const reusedSession = planGateItems([])
assertGateSnapshot(sessionA, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=PASS", "AUDIT=PASS", "RELEASE_GATE=PENDING",
], "session A keeps its completed ledger")
assertGateSnapshot(sessionB, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "session B does not inherit session A")
if (reusedSession !== null) throw new Error("OpenCode TUI retained ledger data after session reuse")

const runningSourceEdit = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "write", filePath: "src/source.js", status: "running" },
]))
assertGateSnapshot(runningSourceEdit, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "while a source edit is still running")

const safeShell = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "bash", command: "node ./scripts/check-opencode-v2-plugin.js", workdir: planWorkspace },
]), planWorkspace)
assertGateSnapshot(safeShell, [
  "PLAN_CHECK=PASS", "VALIDATE=PASS", "REVIEW=PASS", "AUDIT=PASS", "RELEASE_GATE=PENDING",
], "after an allowlisted read-only shell check")

const mutatingShell = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "bash", command: "node ./scripts/export-platform-skills.js" },
]))
assertGateSnapshot(mutatingShell, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after the mutating skills export command")
const serverPendingAfterShellMutation = pendingItems({ pending: [{ label: "Existing review obligation" }] }, workflowHistory("small local fix", [
  { tool: "bash", command: "node ./scripts/export-platform-skills.js" },
]))
if (JSON.stringify(serverPendingAfterShellMutation) !== JSON.stringify(["Existing review obligation"])) {
  throw new Error("Plan-gate shell invalidation changed the existing server-owned pending obligation")
}

const unknownMutationTool = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "mcp_write", id: "custom-write", input: { path: "src/source.js" }, status: "completed" },
]))
assertGateSnapshot(unknownMutationTool, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after a completed unknown tool that may mutate source")

const pendingMutationShell = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "bash", id: "pending-mutation", command: "rm src/source.js", workdir: planWorkspace, status: "running" },
  { phase: "VALIDATE", diff: "HEAD:edit-1" },
  { tool: "bash", id: "pending-mutation", command: "rm src/source.js", workdir: planWorkspace, status: "error" },
]))
assertGateSnapshot(pendingMutationShell, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when gate evidence overlaps a running mutation shell that fails")

const redirectedSafeShell = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  // tmp-ok: workdir is a string in a simulated tool history; nothing is created there.
  { tool: "bash", command: "node ./scripts/check-opencode-v2-plugin.js", workdir: "/tmp" },
]), planWorkspace)
assertGateSnapshot(redirectedSafeShell, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after an allowlisted shell command changes workdir")

const overlappingMutationBaseTime = nextFixtureToolTime + 1000
const overlappingMutationFreshness = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "bash", id: "mutation-A", command: "custom mutation A", workdir: planWorkspace, status: "running", createdAt: overlappingMutationBaseTime + 100 },
  { tool: "bash", id: "mutation-B", command: "custom mutation B", workdir: planWorkspace, status: "running", createdAt: overlappingMutationBaseTime + 150 },
  { tool: "bash", id: "mutation-B", command: "custom mutation B", workdir: planWorkspace, status: "completed", createdAt: overlappingMutationBaseTime + 150, completedAt: overlappingMutationBaseTime + 200 },
  { tool: "task", id: "overlap-validation", status: "running", createdAt: overlappingMutationBaseTime + 250 },
  { tool: "bash", id: "mutation-A", command: "custom mutation A", workdir: planWorkspace, status: "completed", createdAt: overlappingMutationBaseTime + 100, completedAt: overlappingMutationBaseTime + 300 },
  { tool: "task", id: "overlap-validation", output: "ASK_WORKFLOW_PASS phase=PLAN_CHECK\nASK_WORKFLOW_PASS phase=VALIDATE", createdAt: overlappingMutationBaseTime + 250, completedAt: overlappingMutationBaseTime + 400 },
]), planWorkspace)
assertGateSnapshot(overlappingMutationFreshness, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when an older concurrent mutation completes after validation starts")

const terminalMutationBaseTime = nextFixtureToolTime + 1000
const terminalOnlyOutOfOrderFreshness = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "bash", id: "terminal-A", command: "mutation A", workdir: planWorkspace, status: "completed", createdAt: terminalMutationBaseTime + 100, completedAt: terminalMutationBaseTime + 300 },
  { tool: "skill", id: "unordered-readonly", status: "completed", input: { name: "develop" }, createdAt: terminalMutationBaseTime + 190, omitCompletedAt: true },
  { tool: "bash", id: "terminal-B", command: "mutation B", workdir: planWorkspace, status: "completed", createdAt: terminalMutationBaseTime + 150, completedAt: terminalMutationBaseTime + 200 },
  {
    tool: "task",
    id: "terminal-validation",
    output: "ASK_WORKFLOW_PASS phase=PLAN_CHECK\nASK_WORKFLOW_PASS phase=VALIDATE",
    createdAt: terminalMutationBaseTime + 250,
    completedAt: terminalMutationBaseTime + 400,
  },
]), planWorkspace)
assertGateSnapshot(terminalOnlyOutOfOrderFreshness, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "when a terminal-only history lists an older completion last")

const shellMissingWorkdir = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "bash", command: "node ./scripts/check-opencode-v2-plugin.js" },
]), planWorkspace)
assertGateSnapshot(shellMissingWorkdir, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after an allowlisted shell command omits workdir")

const shellMissingRoot = planGateItems(workflowHistory("add a status panel", [
  ...completeHistory,
  { tool: "bash", command: "node ./scripts/check-opencode-v2-plugin.js", workdir: planWorkspace },
]), undefined)
assertGateSnapshot(shellMissingRoot, [
  "PLAN_CHECK=PENDING", "VALIDATE=NOT STARTED", "REVIEW=NOT STARTED",
  "AUDIT=NOT STARTED", "RELEASE_GATE=NOT STARTED",
], "after an allowlisted shell command has no session root")

const textLedger = planGateText(planOnly)
if (!textLedger.includes("PLAN_CHECK — PENDING") || !textLedger.includes("RELEASE_GATE — NOT STARTED")) {
  throw new Error("OpenCode TUI did not format the full gate ledger for rendering")
}

// Confirm semantic colors follow the exact theme object supplied by OpenCode.
function fakeTheme(accent, muted, success, warning) {
  return {
    text: {
      action: { primary: { default: accent } },
      default: accent,
      subdued: muted,
      feedback: { success: { default: success }, warning: { default: warning } },
    },
  }
}

const firstTheme = sidebarColors(fakeTheme("a", "b", "c", "d"))
const secondTheme = sidebarColors(fakeTheme("e", "f", "g", "h"))
if (firstTheme.title !== "a" || firstTheme.pending !== "d"
  || secondTheme.title !== "e" || secondTheme.pending !== "h") {
  throw new Error("OpenCode TUI sidebar colors did not follow the selected theme")
}

const hotReloadRoot = await mkdtemp(join(tmpdir(), "ask-router-hot-reload-"))
const hotReloadCorePath = join(hotReloadRoot, "core", "router-core.js")
const hotReloadServerPath = join(hotReloadRoot, "agent-skills-router", "server.mjs")
const contractNodeModules = existsSync(join(process.cwd(), "node_modules", "@opencode", "plugin"))
  ? join(process.cwd(), "node_modules")
  : join(process.cwd(), "plugins", "agent-skills-router", "node_modules")
try {
  await Promise.all([
    mkdir(join(hotReloadRoot, "core")),
    mkdir(join(hotReloadRoot, "agent-skills-router")),
  ])
  await symlink(contractNodeModules, join(hotReloadRoot, "agent-skills-router", "node_modules"))
  await writeFile(hotReloadCorePath, "module.exports = {}\n")
  // Prime CommonJS with the pre-update core that lacks the new export.
  require(hotReloadCorePath)
  await Promise.all([
    writeFile(hotReloadCorePath, await readFile(new URL("../core/router-core.js", import.meta.url), "utf8")),
    writeFile(hotReloadServerPath, await readFile(new URL("../plugins/agent-skills-router/server.mjs", import.meta.url), "utf8")),
  ])
  const { default: hotReloadPlugin } = await import(`${pathToFileURL(hotReloadServerPath).href}?reload=${Date.now()}`)

  const hotReloadHooks = { session: {}, tool: {} }
  const hotReloadContext = {
    // Capture session hooks for the isolated hot-reload regression case.
    session: { hook: async (name, callback) => { hotReloadHooks.session[name] = callback } },
    // Capture tool hooks for the isolated hot-reload regression case.
    tool: { hook: async (name, callback) => { hotReloadHooks.tool[name] = callback } },
    event: {
      // End the event stream because this isolated regression does not need host events.
      subscribe: async function* () {},
    },
    // Accept status persistence while exercising only the V2 hook contract.
    storage: { set: async () => {} },
  }
  const cleanupHotReload = await hotReloadPlugin.setup(hotReloadContext)
  await hotReloadHooks.tool["execute.after"]({
    sessionID: "hot-reload",
    tool: "skill",
    input: { id: "ask-develop" },
    status: "completed",
    result: {},
  })
  const hotReloadPrompt = { sessionID: "hot-reload", prompt: { text: "continue" } }
  await hotReloadHooks.session.prompt(hotReloadPrompt)
  // Confirm the reloaded server receives the current helper from the replaced core.
  if (!hotReloadPrompt.metadata?.askKit?.activeSkills?.some((entry) => entry.skill === "develop" && entry.current === true)) {
    throw new Error("router did not reload a stale CommonJS core during OpenCode plugin hot reload")
  }
  await cleanupHotReload()
} finally {
  await rm(hotReloadRoot, { recursive: true, force: true })
}

if (plugin.id !== "agent-skills-router" || typeof plugin.setup !== "function") {
  throw new Error("router does not export an OpenCode V2 definition")
}

const hooks = { session: {}, tool: {} }
let stopped = false
const context = {
  // Handle the session callback.
  session: { hook: async (name, callback) => { hooks.session[name] = callback } },
  // Handle the tool callback.
  tool: { hook: async (name, callback) => { hooks.tool[name] = callback } },
  event: {
    // Handle the subscribe callback.
    subscribe: async function* ({ signal }) {
      // Resolve the promise for the scheduled local operation.
      while (!signal.aborted && !stopped) await new Promise((resolve) => setTimeout(resolve, 1))
    },
  },
  // Handle the storage callback.
  storage: { set: async () => {} },
}

const cleanup = await plugin.setup(context)
if (typeof hooks.session.prompt !== "function"
  || typeof hooks.tool["execute.before"] !== "function"
  || typeof hooks.tool["execute.after"] !== "function") {
  throw new Error("router did not register required OpenCode V2 hooks")
}

const prompt = { sessionID: "test", prompt: { text: "test" } }
await hooks.session.prompt(prompt)
if (prompt.prompt.text !== "test") throw new Error("prompt hook made router guidance visible in prompt text")
if (!prompt.metadata?.askKit || !Array.isArray(prompt.metadata.askKit.activeSkills)) {
  throw new Error("prompt hook did not publish router status through supported metadata")
}
const contextEvent = { sessionID: "test", system: [] }
await hooks.session.context(contextEvent)
// Map each item through the local transformation.
const injectedContext = contextEvent.system.map((part) => part.text || "").join("\n")
if (!injectedContext.includes("Agent Skills Kit")) {
  throw new Error("context hook did not inject router guidance into the hidden system context")
}
if (!injectedContext.includes("• develop: ASK workflow") || injectedContext.includes("external-skill")) {
  throw new Error("router injected a non-ASK skill from the shared skill root")
}

const releaseSessionPrompt = { sessionID: "release", prompt: { text: "prepare release candidate" } }
await hooks.session.prompt(releaseSessionPrompt)
await hooks.tool["execute.after"]({ sessionID: "release", tool: "skill", input: { name: "develop" }, status: "completed", result: {} })
for (const phase of ["INTAKE", "PLAN", "PLAN_CHECK", "EXECUTE", "VALIDATE", "REVIEW", "ITERATE", "AUDIT", "RELEASE_GATE"]) {
  await hooks.tool["execute.after"]({
    sessionID: "release",
    tool: "task",
    status: "completed",
    result: `ASK_WORKFLOW_PASS phase=${phase} diff=release-diff`,
  })
}
await hooks.tool["execute.before"]({ sessionID: "release", tool: "edit", input: { diffIdentity: "new-diff" } })
await hooks.session.prompt({ sessionID: "release", prompt: { text: "show release status after edit" } })
const releaseAfterEditContext = { sessionID: "release", system: [] }
await hooks.session.context(releaseAfterEditContext)
// Extract the OpenCode lifecycle text from the hidden context section.
const releaseAfterEditText = releaseAfterEditContext.system.map((part) => part.text || "").join("\n")
if (!releaseAfterEditText.includes("release=PENDING") || releaseAfterEditText.includes("release=RELEASE")) {
  throw new Error("OpenCode retained release-ready workflow status after a new code diff")
}
await hooks.tool["execute.after"]({
  sessionID: "release",
  tool: "task",
  status: "completed",
  result: "ASK_WORKFLOW_PASS phase=RELEASE_GATE diff=release-diff",
})
await hooks.session.prompt({ sessionID: "release", prompt: { text: "show stale release status" } })
const staleReleaseContext = { sessionID: "release", system: [] }
await hooks.session.context(staleReleaseContext)
// Extract the post-stale-evidence lifecycle text from the hidden context section.
const staleReleaseText = staleReleaseContext.system.map((part) => part.text || "").join("\n")
if (!staleReleaseText.includes("release=PENDING") || staleReleaseText.includes("release=RELEASE")) {
  throw new Error("OpenCode accepted release evidence for the previous diff")
}

await hooks.tool["execute.after"]({
  sessionID: "test",
  tool: "skill",
  input: { name: "external-skill" },
  status: "completed",
  result: { args: { name: "external-skill" } },
})
let externalSkillGateError
try {
  await hooks.tool["execute.before"]({ sessionID: "test", tool: "bash", input: {} })
} catch (error) {
  externalSkillGateError = error
}
if (!String(externalSkillGateError?.message).includes("Read the routed ASK file first")) {
  throw new Error("non-ASK skill incorrectly satisfied the skill gate")
}

await hooks.tool["execute.after"]({
  sessionID: "test",
  tool: "read",
  input: { path: join(skillRoot, "ask-develop", "SKILL.md") },
  status: "error",
}, { isError: true, error: "read failed" })
let failedReadGateError
try {
  await hooks.tool["execute.before"]({ sessionID: "test", tool: "patch", input: {} })
} catch (error) {
  failedReadGateError = error
}
if (!String(failedReadGateError?.message).includes("Read the routed ASK file first")) {
  throw new Error("failed skill-file read incorrectly satisfied the skill gate")
}

await hooks.tool["execute.after"]({
  sessionID: "test",
  tool: "read",
  input: { path: join(skillRoot, "external-skill", "SKILL.md") },
  status: "completed",
}, { content: "external skill" })
let externalReadGateError
try {
  await hooks.tool["execute.before"]({ sessionID: "test", tool: "patch", input: {} })
} catch (error) {
  externalReadGateError = error
}
if (!String(externalReadGateError?.message).includes("Read the routed ASK file first")) {
  throw new Error("a non-ASK file read incorrectly satisfied the skill gate")
}

await hooks.tool["execute.after"]({
  sessionID: "test",
  tool: "read",
  input: { path: join(skillRoot, "ask-design", "SKILL.md") },
  status: "completed",
}, { content: "symlinked skill file" })
let escapedReadGateError
try {
  await hooks.tool["execute.before"]({ sessionID: "test", tool: "patch", input: {} })
} catch (error) {
  escapedReadGateError = error
}
if (!String(escapedReadGateError?.message).includes("Read the routed ASK file first")) {
  throw new Error("a symlink escaping the ASK root incorrectly satisfied the skill gate")
}

let patchSkillGateError
try {
  await hooks.tool["execute.before"]({ sessionID: "test", tool: "patch", input: {} })
} catch (error) {
  patchSkillGateError = error
}
if (!String(patchSkillGateError?.message).includes("Read the routed ASK file first")) {
  throw new Error("V2 patch tool bypassed the skill gate")
}
const deniedPatchFollowUp = { sessionID: "test", prompt: { text: "show denied patch status" } }
await hooks.session.prompt(deniedPatchFollowUp)
// Detect whether the rejected tool changed the router's review state.
const deniedPatchHasReviewDebt = deniedPatchFollowUp.metadata?.askKit?.pending?.some((entry) => entry.skill === "code-review")
if (deniedPatchHasReviewDebt) {
  throw new Error("V2 denied patch tool created code-review debt")
}

await hooks.tool["execute.after"]({
  sessionID: "test",
  tool: "read",
  input: { path: join(skillRoot, "ask-develop", "SKILL.md") },
  status: "completed",
}, { content: "ASK Develop" })
await hooks.tool["execute.after"]({
  sessionID: "test",
  tool: "read",
  input: { path: join(skillRoot, "ask-code-review", "SKILL.md") },
  status: "completed",
}, { content: "ASK Code Review" })
const followUp = { sessionID: "test", prompt: { text: "follow up" } }
await hooks.session.prompt(followUp)
if (followUp.prompt.text !== "follow up") throw new Error("follow-up router guidance leaked into prompt text")
// Test whether any item satisfies the local predicate.
if (!followUp.metadata?.askKit?.activeSkills?.some((entry) => entry.skill === "code-review" && entry.current === true)) {
  throw new Error("V2 tool adapter failed to track a canonical ASK file read")
}

await hooks.tool["execute.after"]({
  sessionID: "test",
  tool: "skill",
  input: { id: "ask-code-review" },
  status: "completed",
  result: {},
})
const skillIDFollowUp = { sessionID: "test", prompt: { text: "show status" } }
await hooks.session.prompt(skillIDFollowUp)
// Test whether any item satisfies the local predicate.
if (!skillIDFollowUp.metadata?.askKit?.activeSkills?.some((entry) => entry.skill === "code-review" && entry.current === true)) {
  throw new Error("V2 tool adapter did not normalize the native ASK skill ID")
}

await hooks.tool["execute.before"]({ sessionID: "test", tool: "patch", input: {} })
await hooks.tool["execute.after"]({
  sessionID: "test",
  tool: "patch",
  input: {},
  status: "completed",
  result: {},
})
const patchFollowUp = { sessionID: "test", prompt: { text: "show patch status" } }
await hooks.session.prompt(patchFollowUp)
// Confirm the V2 patch alias creates the same review obligation as other code edits.
if (!patchFollowUp.metadata?.askKit?.pending?.some((entry) => entry.skill === "code-review")) {
  throw new Error("V2 patch tool did not create code-review debt")
}

const liveSkills = mergeActiveSkills(
  { activeSkills: [], pending: [] },
  [{
    type: "assistant",
    content: [{ type: "tool", name: "skill", state: { status: "completed", input: { id: "ask-code-review" } } }],
  }],
)
if (JSON.stringify(liveSkills) !== JSON.stringify([{ skill: "code-review", label: "Code Review", current: true }])) {
  throw new Error("V2 TUI did not recover a completed native skill tool call")
}

const readLoadedSkills = mergeActiveSkills(
  { activeSkills: [], pending: [] },
  [{
    type: "assistant",
    content: [{ type: "tool", name: "read", state: { status: "completed", input: { path: join(skillRoot, "ask-code-review", "SKILL.md") } } }],
  }],
)
if (JSON.stringify(readLoadedSkills) !== JSON.stringify([{ skill: "code-review", label: "Code Review", current: true }])) {
  throw new Error("V2 TUI did not recover a completed router-directed ASK file read")
}

const unrelatedReadSkills = mergeActiveSkills(
  { activeSkills: [], pending: [] },
  [{
    type: "assistant",
    content: [{ type: "tool", name: "read", state: { status: "completed", input: { path: join(skillRoot, "external-skill", "SKILL.md") } } }],
  }],
)
if (unrelatedReadSkills.length !== 0) {
  throw new Error("V2 TUI included a non-ASK file read as a loaded workflow")
}

const externalSkills = mergeActiveSkills(
  { activeSkills: [], pending: [] },
  [{
    type: "assistant",
    content: [{ type: "tool", name: "skill", state: { status: "completed", input: { id: "external-skill" } } }],
  }],
)
if (externalSkills.length !== 0) {
  throw new Error("V2 TUI included a completed non-ASK skill")
}

const mergedSkills = mergeActiveSkills(
  { activeSkills: [{ skill: "intake", label: "Intake", current: true }], pending: [] },
  [{
    type: "assistant",
    content: [{ type: "tool", name: "skill", state: { status: "completed", input: { id: "ask-code-review" } } }],
  }],
)
if (JSON.stringify(mergedSkills) !== JSON.stringify([
  { skill: "code-review", label: "Code Review", current: true },
  { skill: "intake", label: "Intake", current: false },
])) {
  throw new Error("V2 TUI did not keep exactly one current skill after a live tool call")
}

const orderedSkills = mergeActiveSkills(
  { activeSkills: [], pending: [] },
  [
    { type: "assistant", content: [{ type: "tool", name: "skill", state: { status: "completed", input: { name: "ask-design" } } }] },
    { type: "assistant", content: [{ type: "tool", name: "skill", state: { status: "completed", input: { name: "ask-code-review" } } }] },
  ],
)
if (orderedSkills[0]?.skill !== "code-review" || orderedSkills[0]?.current !== true || orderedSkills[1]?.skill !== "design") {
  throw new Error("V2 TUI did not place the most recently used skill first")
}

const patchMessage = {
  type: "assistant",
  content: [{ type: "tool", name: "patch", state: { status: "completed", input: { diffIdentity: "HEAD" }, output: "patched" } }],
}
if (JSON.stringify(pendingItems({ pending: [] }, [patchMessage])) !== JSON.stringify(["Code review needed"])) {
  throw new Error("V2 TUI did not surface code-review debt from a completed patch")
}
const smallFixPrompt = {
  type: "user",
  content: [{ type: "text", text: "small local bug fix in parser" }],
}
if (pendingItems({ pending: [{ label: "Code review needed" }] }, [smallFixPrompt, patchMessage]).length !== 0) {
  throw new Error("V2 TUI reconstructed review debt for a small local fix")
}
const tokenizerFixPrompt = {
  type: "user",
  content: [{ type: "text", text: "small local fix in tokenizer" }],
}
if (pendingItems({ pending: [{ label: "Code review needed" }] }, [tokenizerFixPrompt, patchMessage]).length !== 0) {
  throw new Error("V2 TUI matched a risk phrase inside a longer word")
}
const neutralFollowUpPrompt = {
  type: "user",
  content: [{ type: "text", text: "continue" }],
}
if (pendingItems({ pending: [{ label: "Code review needed" }] }, [smallFixPrompt, neutralFollowUpPrompt, patchMessage]).length !== 0) {
  throw new Error("V2 TUI promoted a small workflow after a neutral follow-up")
}
const smallValidationFindings = {
  type: "assistant",
  content: [{ type: "tool", name: "task", state: {
    status: "completed",
    output: "ASK_WORKFLOW_FINDINGS phase=VALIDATE diff=HEAD:edit-1",
  } }],
}
if (pendingItems({ pending: [{ label: "Code review needed" }] }, [smallFixPrompt, patchMessage, smallValidationFindings]).length !== 0) {
  throw new Error("V2 TUI created review debt for small-work validation findings")
}
const smallSecurityPrompt = {
  type: "user",
  content: [{ type: "text", text: "small auth fix" }],
}
if (pendingItems({ pending: [] }, [smallSecurityPrompt, patchMessage]).length !== 1) {
  throw new Error("V2 TUI dropped review debt for a small security fix")
}
const smallSsrfPrompt = {
  type: "user",
  content: [{ type: "text", text: "small local fix for SSRF in image proxy" }],
}
if (pendingItems({ pending: [] }, [smallSsrfPrompt, patchMessage]).length !== 1) {
  throw new Error("V2 TUI dropped review debt for a small SSRF fix")
}
const highRiskThenSmallPrompt = {
  type: "user",
  content: [{ type: "text", text: "prepare release candidate; then small local fix" }],
}
if (pendingItems({ pending: [] }, [highRiskThenSmallPrompt, patchMessage]).length !== 1) {
  throw new Error("V2 TUI allowed a small phrase to downgrade a high-risk workflow")
}
const deepResearchThenSmallPrompt = {
  type: "user",
  content: [{ type: "text", text: "small local bug fix; exhaustive research required" }],
}
if (pendingItems({ pending: [] }, [deepResearchThenSmallPrompt, patchMessage]).length !== 1) {
  throw new Error("V2 TUI allowed a small phrase to downgrade deep research risk")
}
const normalWorkflowPrompt = {
  type: "user",
  content: [{ type: "text", text: "add a focused parser feature" }],
}
const smallFollowUpPrompt = {
  type: "user",
  content: [{ type: "text", text: "small local bug fix" }],
}
if (pendingItems({ pending: [] }, [normalWorkflowPrompt, smallFollowUpPrompt, patchMessage]).length !== 1) {
  throw new Error("V2 TUI allowed a small phrase to downgrade a normal workflow")
}

const validationMessage = {
  type: "assistant",
  content: [{ type: "tool", name: "task", state: {
    status: "completed",
    content: [{ type: "text", text: "ASK_WORKFLOW_PASS phase=PLAN diff=HEAD:edit-1" }],
  } }],
}

const executionMessage = {
  type: "assistant",
  content: [{ type: "tool", name: "task", state: {
    status: "completed",
    content: [{ type: "text", text: "ASK_WORKFLOW_PASS phase=EXECUTE diff=HEAD:edit-1" }],
  } }],
}

const finalValidationMessage = {
  type: "assistant",
  content: [{ type: "tool", name: "task", state: {
    status: "completed",
    content: [{ type: "text", text: "ASK_WORKFLOW_PASS phase=VALIDATE diff=HEAD:edit-1" }],
  } }],
}

const reviewMessage = {
  type: "assistant",
  content: [{ type: "tool", name: "task", state: {
    status: "completed",
    content: [{ type: "text", text: "ASK_WORKFLOW_PASS phase=REVIEW diff=HEAD:edit-1\nreview-generation: 1\nreview-scope: REVIEW\nreview-reference: HEAD\nreview-completed-at: 2026-09-16T12:00:00Z\nreview-result: PASS\nASK_REVIEW_COMPLETE" }],
  } }],
}
if (pendingItems({ pending: [{ label: "Code review needed" }] }, [patchMessage, validationMessage, executionMessage, finalValidationMessage, reviewMessage]).length !== 0) {
  throw new Error("V2 TUI did not clear code-review debt from passing review evidence")
}
const reviewErrorMessage = {
  type: "assistant",
  content: [{ type: "tool", name: "task", state: {
    status: "completed",
    error: "ASK_WORKFLOW_PASS phase=REVIEW diff=HEAD:edit-1\nreview-generation: 1\nreview-scope: REVIEW\nreview-reference: HEAD\nreview-completed-at: 2026-09-16T12:00:00Z\nreview-result: PASS\nASK_REVIEW_COMPLETE",
  } }],
}
if (pendingItems({ pending: [{ label: "Code review needed" }] }, [patchMessage, validationMessage, executionMessage, finalValidationMessage, reviewErrorMessage]).length !== 1) {
  throw new Error("V2 TUI cleared code-review debt from tool error text")
}
if (pendingItems({ pending: [{ label: "Code review needed" }] }, [patchMessage, finalValidationMessage, reviewMessage]).length !== 1) {
  throw new Error("V2 TUI accepted review evidence before validation")
}
const findingsMessage = {
  type: "assistant",
  content: [{ type: "tool", name: "task", state: {
    status: "completed",
    content: [{ type: "text", text: "ASK_WORKFLOW_FINDINGS phase=REVIEW diff=HEAD:edit-1\nreview-generation: 1\nreview-scope: REVIEW\nreview-reference: HEAD\nreview-completed-at: 2026-09-16T12:00:00Z\nreview-result: PASS\nASK_REVIEW_COMPLETE" }],
  } }],
}
if (pendingItems({ pending: [] }, [patchMessage, validationMessage, executionMessage, finalValidationMessage, reviewMessage, findingsMessage]).length !== 1) {
  throw new Error("V2 TUI did not re-arm code-review debt after findings")
}

const designHistory = [
  { type: "assistant", content: [{ type: "tool", name: "skill", state: { status: "completed", input: JSON.stringify({ name: "ask-design" }) } }] },
]
if (JSON.stringify(pendingItems({ pending: [] }, designHistory)) !== JSON.stringify(["Design review needed"])) {
  throw new Error("V2 TUI did not surface design-review debt from a completed design skill")
}

const tuiSource = await readFile(new URL("../plugins/agent-skills-router/tui.tsx", import.meta.url), "utf8")
const sidebarHelperSource = await readFile(new URL("../plugins/agent-skills-router/sidebar-status.js", import.meta.url), "utf8")
if (!tuiSource.includes('import type { Context } from "@opencode/plugin/tui/plugin"')) {
  throw new Error("OpenCode TUI must import Context from the pinned plugin type entrypoint")
}
const sidebarThemeTokens = [
  "theme.text.action.primary.default",
  "theme.text.default",
  "theme.text.subdued",
  "theme.text.feedback.success.default",
  "theme.text.feedback.warning.default",
]
let missingThemeToken = null
for (const token of sidebarThemeTokens) {
  if (!sidebarHelperSource.includes(token)) missingThemeToken = token
}
if (missingThemeToken) {
  throw new Error("OpenCode TUI sidebar does not use the semantic theme colors")
}
if (!tuiSource.includes("sidebarColors(props.api.theme)")
  || !tuiSource.includes('title="PLAN GATES"')
  || !tuiSource.includes("when={status() || planGates()}")
  || !tuiSource.includes("planGateText(planGates()!)")
  || !tuiSource.includes("planGateItems(messages(), props.api.data.session.get(props.sessionID)?.location.directory)")) {
  throw new Error("OpenCode TUI does not render reactive plan gate status")
}
if (tuiSource.includes("const COLORS = {") || sidebarHelperSource.includes("#7dd3fc")) {
  throw new Error("OpenCode TUI sidebar retains its hard-coded color palette")
}

stopped = true
await cleanup()
await rm(skillRoot, { recursive: true, force: true })
await rm(outsideSkillRoot, { recursive: true, force: true })
console.log("OpenCode V2 plugin checks passed.")
