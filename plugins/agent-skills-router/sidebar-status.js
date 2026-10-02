import { lstatSync, realpathSync } from "node:fs"
import { isAbsolute, relative, resolve, sep } from "node:path"

// Normalize the live OpenCode V2 tool history into the sidebar's compact status shape.

// Keep this ESM-only runtime boundary independent from the router's CommonJS core.
// OpenCode's TUI loader does not synthesize CommonJS named exports.
export const ASK_SKILL_NAMES = new Set([
  "agent-workflows", "code-review", "debugging", "deep-research", "design",
  "design-review", "develop", "gh-inbox", "improve", "intake", "observability",
  "research", "session-review", "spec", "text-writing", "verification", "write-skill",
])

const CODE_EDIT_TOOL_NAMES = new Set(["edit", "write", "patch", "apply_patch"])
const SHELL_TOOL_NAMES = new Set(["bash", "shell"])
const READ_ONLY_TOOL_NAMES = new Set([
  "skill", "read", "glob", "grep", "lsp", "webfetch", "websearch", "question", "todowrite", "todoread",
])
const READ_ONLY_SHELL_COMMANDS = new Set([
  "node -e \"import('./plugins/agent-skills-router/server.mjs')\"",
  "node ./scripts/check-router-nudges.js",
  "node ./scripts/check-workflow-lifecycle.js",
  "node ./scripts/check-dsh-plugin.js",
  "node ./scripts/check-widget-live-state.js",
  "node ./scripts/check-research-workflow.js",
  "node ./scripts/check-tier-vocabulary.js",
  "node ./scripts/validate-plugin.js",
  "node ./scripts/check-release-readiness.js --require-version-entry",
  "./scripts/check-installed-artifacts.sh",
  "node ./scripts/check-opencode-v2-plugin.js",
  "node ./scripts/check-code-comments.js",
  "git diff --check",
])
const DISPLAY_GATE_PHASES = ["PLAN_CHECK", "VALIDATE", "REVIEW", "AUDIT", "RELEASE_GATE"]
const WORKFLOW_PHASE_ORDER = ["PLAN", "PLAN_CHECK", "EXECUTE", "VALIDATE", "REVIEW", "AUDIT", "RELEASE_GATE"]
const WORKFLOW_EVIDENCE_PATTERN = /^ASK_WORKFLOW_(PASS|FINDINGS|BLOCKED|FAILED)\s+phase=([A-Z_]+)(?:\s+diff=([^\s]+))?[ \t]*$/
const VALID_WORKFLOW_PHASES = new Set([
  "RESEARCH", "INTAKE", "SPEC", "PLAN", "PLAN_CHECK", "EXECUTE", "VALIDATE", "REVIEW", "ITERATE", "AUDIT", "RELEASE_GATE",
])
const SPEC_WORKFLOW_PHRASES = [
  "specify requirements", "requirements spec", "requirements specification", "design brief",
  "decision register", "requirements traceability", "spec before build", "behavior-changing",
  "behavior changing", "new external contract", "new external contracts", "acceptance criteria unclear",
  "unclear acceptance criteria",
]
const SMALL_WORKFLOW_PHRASES = [
  "typo", "documentation-only", "docs only", "rename variable", "version bump", "changelog tweak",
  "small local fix", "small local bug fix", "small bug fix", "small fix", "quick fix", "tiny fix",
  "small change", "small adjustment", "minor adjustment",
]
const RELEASE_WORKFLOW_PHRASES = [
  "release candidate", "production readiness", "ready to ship", "ready to merge", "release-sensitive",
]
const LARGE_WORKFLOW_PHRASES = [
  "large multi-issue brief", "multiple issues", "all issues", "maximum compatibility",
  "end-to-end implementation", "merge and release", "release-sensitive brief",
]
const DEEP_RESEARCH_WORKFLOW_PHRASES = [
  "deep research", "exhaustive research", "comprehensive investigation",
  "complex technical investigation", "complex research", "contested research",
  "high-stakes research", "high stakes research", "complex contested high-stakes question",
  "complex compatibility question", "complex compatibility issue", "complex question", "multiple sources",
  "multi-source research", "multi source research", "conflicting evidence",
  "full compatibility investigation", "compare competing implementations",
  "compare local and upstream implementations", "investigate protocol behavior",
  "protocol behavior exhaustively", "investigate historical changes",
  "determine protocol behaviour", "research everything relevant", "investigate open issues",
  "open issues comprehensively", "compare against upstream",
]
const SIGNIFICANT_WORKFLOW_PHRASES = [
  "architecture", "architectural", "migration", "ownership", "routing change", "multi-module",
  "backwards compatibility", "cross-cutting", "significant refactor", "security", "authentication",
  "authorization", "credential", "password", "token", "secret handling", "access control",
  "permission check", "sql injection", "injection", "xss", "cross-site scripting", "csrf",
  "race condition", "buffer overflow", "side-channel", "privilege escalation", "encryption",
  "cryptography", "privacy", "sensitive data", "data leak", "data exfiltration", "data loss",
  "data corruption", "input validation", "path traversal", "remote code execution", "bypass",
  "vulnerability", "exploit", "auth", "oauth", "ssl", "tls", "crypto", "login",
  "session management", "api key", "api secret", "schema change", "database schema",
  "db column removal", "ssrf", "rce", "idor", "xxe",
]

// Match whole risk phrases like the shared router, not substrings in longer words.
function hasWorkflowPhraseSignal(promptText, phrases) {
  const normalized = promptText.trim().toLowerCase()
  if (!normalized) return false
  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    try {
      if (new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(normalized)) return true
    } catch {
      if (normalized.includes(phrase)) return true
    }
  }
  return false
}

// Accept only router status records that are safe for presentation.
export function readStatus(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value
}

// Translate native ASK skill identifiers back to the canonical router skill name.
function canonicalSkillName(value) {
  if (typeof value !== "string" || !value) return null
  const skill = value.startsWith("ask-") ? value.slice(4) : value
  return ASK_SKILL_NAMES.has(skill) ? skill : null
}

// Normalize native tool input so the sidebar accepts both OpenCode input shapes.
function toolInput(part) {
  const input = part?.state?.input
  if (input && typeof input === "object") return input
  if (typeof input !== "string") return null
  try {
    const parsed = JSON.parse(input)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

// Classify sidebar prompts with the same risk precedence as the shared router.
function classifyObservedWorkflowRisk(promptText) {
  const riskSignals = [
    { risk: "release-sensitive", phrases: RELEASE_WORKFLOW_PHRASES },
    { risk: "significant", phrases: LARGE_WORKFLOW_PHRASES },
    { risk: "significant", phrases: DEEP_RESEARCH_WORKFLOW_PHRASES },
    { risk: "significant", phrases: SIGNIFICANT_WORKFLOW_PHRASES },
    { risk: "spec-required", phrases: SPEC_WORKFLOW_PHRASES },
    { risk: "small", phrases: SMALL_WORKFLOW_PHRASES },
  ]
  for (const signal of riskSignals) {
    if (hasWorkflowPhraseSignal(promptText, signal.phrases)) return signal.risk
  }
  return null
}

// Extract all trusted lifecycle marker lines from one completed task result in order.
function workflowEvidence(part) {
  if (part?.type !== "tool" || part.name !== "task" || part.state?.status !== "completed") return []
  const outputParts = []
  for (const item of Array.isArray(part.state?.content) ? part.state.content : []) {
    if (item?.type === "text" && typeof item.text === "string") outputParts.push(item.text)
  }
  if (outputParts.length === 0) {
    for (const candidate of [part.state?.output, part.state?.result]) {
      if (typeof candidate === "string") outputParts.push(candidate)
    }
  }
  const output = outputParts.join("\n")
  let codeFence = null
  const evidence = []
  for (const line of output.split(/\r?\n/)) {
    const fence = line.match(/^[ \t]*(`{3,}|~{3,})(.*)$/)
    if (fence) {
      const marker = fence[1]
      if (!codeFence) {
        codeFence = { character: marker[0], length: marker.length }
      } else if (marker[0] === codeFence.character && marker.length >= codeFence.length
        && /^[ \t]*$/.test(fence[2])) {
        codeFence = null
      }
      continue
    }
    if (codeFence) continue
    const match = line.match(WORKFLOW_EVIDENCE_PATTERN)
    if (!match || !VALID_WORKFLOW_PHASES.has(match[2])) continue
    evidence.push({
      status: match[1],
      phase: match[2],
      diffIdentity: match[3] || "",
    })
  }
  return evidence
}

// Read the tool start timestamp needed to reject stale child-session output.
function toolCreatedTime(part) {
  const created = part?.time?.created
  return typeof created === "number" && Number.isFinite(created) ? created : null
}

// Resolve the most recent timestamp that proves a tool operation changed state.
function toolChangedTime(part) {
  const changed = part?.time?.completed
  return typeof changed === "number" && Number.isFinite(changed) ? changed : null
}

// Preserve the latest completion timestamp even when terminal parts are unordered.
function maximumMutationTime(previousTime, part) {
  const changedTime = toolChangedTime(part)
  if (changedTime === null) return previousTime
  return previousTime === null ? changedTime : Math.max(previousTime, changedTime)
}

// Compare tool events with a transitive timestamp order and stable ties.
function compareToolEvents(left, right) {
  if (left.timestamp !== null && right.timestamp === null) return -1
  if (left.timestamp === null && right.timestamp !== null) return 1
  if (left.timestamp !== null && right.timestamp !== null && left.timestamp !== right.timestamp) return left.timestamp - right.timestamp
  return left.order - right.order
}

// Order tool events by their native start/terminal timestamp, preserving ties.
function orderedToolParts(messages) {
  const events = []
  let order = 0
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!Array.isArray(message?.content)) continue
    for (const part of message.content) {
      if (part?.type !== "tool") continue
      const pending = ["running", "streaming", "pending"].includes(part.state?.status)
      events.push({ part, timestamp: pending ? toolCreatedTime(part) : toolChangedTime(part), order })
      order += 1
    }
  }
  events.sort(compareToolEvents)
  const parts = []
  for (const event of events) parts.push(event.part)
  return parts
}

// Fingerprint terminal tool fields that can change evidence attached to a stable ID.
function toolPartSignature(part) {
  const content = Array.isArray(part?.state?.content) ? part.state.content : []
  const normalizedContent = []
  for (const item of content) {
    if (item?.type === "text") normalizedContent.push({ type: item.type, text: item.text })
    else if (item?.type === "file") normalizedContent.push({ type: item.type, uri: item.uri, mime: item.mime, name: item.name })
  }
  return JSON.stringify({
    status: part?.state?.status,
    input: part?.state?.input ?? null,
    output: part?.state?.output ?? null,
    result: part?.state?.result ?? null,
    error: part?.state?.error ?? null,
    name: part?.name ?? null,
    time: part?.time ?? null,
    content: normalizedContent,
  })
}

// Reject child-task results that began before or overlapped a newer source edit.
function taskEvidenceIsStale(part, taskStartGeneration, sourceChangeGeneration, latestSourceEditTime, freshnessAmbiguous) {
  if (freshnessAmbiguous) return true
  if (sourceChangeGeneration === 0) return false
  const taskStartedAt = toolCreatedTime(part)
  if (taskStartGeneration !== undefined && taskStartGeneration !== sourceChangeGeneration) return true
  return taskStartedAt === null || latestSourceEditTime === null || taskStartedAt <= latestSourceEditTime
}

// Preserve progress only for exact read-only repository validation commands.
function isReadOnlyShellCommand(input, workspaceDirectory) {
  if (typeof input?.command !== "string" || !READ_ONLY_SHELL_COMMANDS.has(input.command.trim())) return false
  if (typeof input.workdir !== "string" || typeof workspaceDirectory !== "string") return false
  try {
    const realWorkspace = realpathSync(workspaceDirectory)
    const resolvedDirectory = resolve(realWorkspace, input.workdir)
    return realpathSync(resolvedDirectory) === realWorkspace
  } catch {
    return false
  }
}

// Check that one resolved file path stays below the selected plan directory.
function isPathWithinDirectory(parentPath, targetPath) {
  const relativeTarget = relative(parentPath, targetPath)
  return relativeTarget === "" || (relativeTarget !== ".."
    && !relativeTarget.startsWith(`..${sep}`) && !isAbsolute(relativeTarget)
  )
}

// Recognize a plan markdown path only when its real target stays in plans/.
function isPlanDocumentPath(candidate, workspaceDirectory) {
  if (typeof candidate !== "string") return false
  const segments = candidate.replace(/\\/g, "/").split("/")
  let planDirectoryIndex = -1
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index].toLowerCase()
    if (segment === "..") return false
    if (segment === "plan" || segment === "plans") planDirectoryIndex = index
  }
  if (planDirectoryIndex < 0) return false
  const targetSegments = segments.slice(planDirectoryIndex + 1)
  if (targetSegments.length === 0) return false
  for (const segment of targetSegments) {
    if (!segment || segment === "." || segment === "..") return false
  }
  if (!targetSegments[targetSegments.length - 1].toLowerCase().endsWith(".md")) return false
  try {
    const realWorkspace = realpathSync(workspaceDirectory)
    const planDirectory = resolve(realWorkspace, segments[planDirectoryIndex])
    const realPlanDirectory = realpathSync(planDirectory)
    if (realPlanDirectory !== planDirectory) return false
    const targetPath = resolve(realWorkspace, candidate)
    if (!isPathWithinDirectory(realPlanDirectory, targetPath)) return false
    const targetRelativePath = relative(realPlanDirectory, targetPath)
    const targetSegments = targetRelativePath.split(sep)
    let currentDirectory = realPlanDirectory
    for (const segment of targetSegments.slice(0, -1)) {
      currentDirectory = resolve(currentDirectory, segment)
      let stat
      try {
        stat = lstatSync(currentDirectory)
      } catch (error) {
        if (error.code === "ENOENT") return true
        return false
      }
      if (!stat.isDirectory() || stat.isSymbolicLink()) return false
      const realDirectory = realpathSync(currentDirectory)
      if (realDirectory !== currentDirectory || !isPathWithinDirectory(realPlanDirectory, realDirectory)) return false
    }
    try {
      const stat = lstatSync(targetPath)
      if (stat.isSymbolicLink()) return false
      return isPathWithinDirectory(realPlanDirectory, realpathSync(targetPath))
    } catch (error) {
      return error.code === "ENOENT"
    }
  } catch {
    return false
  }
}

// Treat a patch as plan-only only when every declared file target is a plan.
function isPlanDocument(input, workspaceDirectory) {
  let foundTarget = false
  const candidates = [input?.filePath, input?.path, input?.filename, input?.file]
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue
    foundTarget = true
    if (!isPlanDocumentPath(candidate, workspaceDirectory)) return false
  }
  const patch = input?.patchText ?? input?.patch
  if (typeof patch === "string") {
    const targetPattern = /^\*\*\* (?:(?:Add|Update|Delete) File:|Move to:)\s*(.+)$/gm
    let match = targetPattern.exec(patch)
    while (match) {
      foundTarget = true
      if (!isPlanDocumentPath(match[1].trim(), workspaceDirectory)) return false
      match = targetPattern.exec(patch)
    }
  }
  return foundTarget
}

// Accept only correctly formed Markdown separator cells for the gate table.
function isMarkdownSeparatorCell(cell) {
  return /^:?-{3,}:?$/.test(cell.trim())
}

// Exempt only structured patches whose changed lines are gate-ledger rows.
function isPlanLedgerOnlyEdit(toolName, input, workspaceDirectory) {
  if (toolName !== "patch" && toolName !== "apply_patch") return false
  const patch = input?.patchText ?? input?.patch
  if (typeof patch !== "string" || typeof workspaceDirectory !== "string") return false
  const ledgerRow = /^\|\s*(?:PLAN_CHECK|VALIDATE|REVIEW|AUDIT|RELEASE_GATE)\s*\|\s*(?:PENDING|NOT STARTED|PASS|FINDINGS|BLOCKED)\s*\|.*\|\s*$/
  const indexRow = /^\|\s*(\d{3}\s*\|.*\|\s*P[0-3]\s*\|\s*[A-Z]\s*\|.*)\|\s*(AWAITING APPROVAL|TODO|IN PROGRESS|DONE|BLOCKED(?:\s+\(.*\))?)\s*\|\s*$/
  const deletedIndexRows = new Map()
  const addedIndexRows = new Map()
  const fileTargets = new Set()
  const patchTargets = []
  try {
    const realWorkspace = realpathSync(workspaceDirectory)
    for (const candidate of [input?.filePath, input?.path, input?.filename, input?.file]) {
      if (typeof candidate === "string") {
        fileTargets.add(relative(realWorkspace, resolve(realWorkspace, candidate)).replace(/\\/g, "/"))
      }
    }
    for (const line of patch.split(/\r?\n/)) {
      const target = line.match(/^\*\*\* Update File:\s*(.+)$/)?.[1]?.trim()
      if (target) {
        const normalizedTarget = relative(realWorkspace, resolve(realWorkspace, target)).replace(/\\/g, "/")
        patchTargets.push(normalizedTarget)
        fileTargets.add(normalizedTarget)
      }
      if (/^\*\*\* (?:Add|Delete) File:|^\*\*\* Move to:/.test(line)) return false
    }
  } catch {
    return false
  }
  if (patchTargets.length !== 1 || fileTargets.size !== 1) return false
  const [fileTarget] = fileTargets
  const isPlanIndex = fileTarget === "plans/README.md"
  if (!isPlanIndex && !/^plans\/[^/]+\.md$/.test(fileTarget)) return false
  if (isPlanIndex) {
    try {
      const indexPath = resolve(realpathSync(workspaceDirectory), fileTarget)
      if (lstatSync(indexPath).isSymbolicLink() || realpathSync(indexPath) !== indexPath) return false
    } catch {
      return false
    }
  }
  let changedRows = 0
  let gateSectionContext = false
  let gateTableContext = false
  let gateSeparatorContext = false
  let inGateTable = false
  let inGateSection = false
  let inHunk = false
  for (const line of patch.split(/\r?\n/)) {
    if (/^@@/.test(line)) {
      inHunk = true
      inGateSection = false
      gateTableContext = false
      gateSeparatorContext = false
      inGateTable = false
      continue
    }
    if (line === "*** End Patch") {
      inHunk = false
      continue
    }
    if (!inHunk) continue
    const contextLine = line.startsWith(" ") ? line.slice(1) : null
    if (contextLine !== null) {
      const heading = contextLine.match(/^(#+)\s+(.+)$/)
      if (heading) {
        inGateSection = heading[1] === "##" && heading[2] === "Gate ledger"
        gateTableContext = false
        gateSeparatorContext = false
        inGateTable = false
        if (inGateSection) gateSectionContext = true
        continue
      }
      if (/^[-=]{3,}\s*$/.test(contextLine)) {
        inGateSection = false
        gateTableContext = false
        gateSeparatorContext = false
        inGateTable = false
        continue
      }
      if (inGateSection && /^\|\s*Gate\s*\|\s*Status\s*\|\s*Evidence\s*\|\s*$/.test(contextLine)) {
        gateTableContext = true
        gateSeparatorContext = false
        inGateTable = false
        continue
      }
      if (inGateSection && gateTableContext) {
        const separatorCells = contextLine.trim().split("|")
        if (separatorCells[0]?.trim() === "") separatorCells.shift()
        if (separatorCells.at(-1)?.trim() === "") separatorCells.pop()
        if (separatorCells.length === 3 && separatorCells.every(isMarkdownSeparatorCell)) {
          gateSeparatorContext = true
          inGateTable = true
          continue
        }
      }
      if (inGateSection && inGateTable && contextLine.startsWith("|")) continue
      inGateSection = false
      gateTableContext = false
      gateSeparatorContext = false
      inGateTable = false
      continue
    }
    if (!/^[+-]/.test(line)) continue
    const changedLine = line.slice(1)
    if (ledgerRow.test(changedLine)) {
      if (isPlanIndex || !inGateSection || !gateTableContext || !gateSeparatorContext || !inGateTable) return false
    } else if (isPlanIndex) {
      const match = changedLine.match(indexRow)
      if (!match || !isPlanIndex) return false
      const collection = line[0] === "+" ? addedIndexRows : deletedIndexRows
      const statuses = collection.get(match[1]) || []
      statuses.push(match[2])
      collection.set(match[1], statuses)
    } else {
      return false
    }
    changedRows += 1
  }
  if (changedRows === 0) return false
  if (!isPlanIndex && (!gateSectionContext || !gateTableContext || !gateSeparatorContext)) return false
  if (deletedIndexRows.size !== addedIndexRows.size) return false
  for (const [prefix, deletedStatuses] of deletedIndexRows) {
    const addedStatuses = addedIndexRows.get(prefix)
    if (!addedStatuses || deletedStatuses.length !== addedStatuses.length) return false
  }
  return true
}

// Detect any legitimate plan target so substantive plan edits reset approval.
function hasPlanDocumentTarget(input, workspaceDirectory) {
  const candidates = [input?.filePath, input?.path, input?.filename, input?.file]
  for (const candidate of candidates) {
    if (isPlanDocumentPath(candidate, workspaceDirectory)) return true
  }
  const patch = input?.patchText ?? input?.patch
  if (typeof patch !== "string") return false
  const targetPattern = /^\*\*\* (?:(?:Add|Update|Delete) File:|Move to:)\s*(.+)$/gm
  let match = targetPattern.exec(patch)
  while (match) {
    if (isPlanDocumentPath(match[1].trim(), workspaceDirectory)) return true
    match = targetPattern.exec(patch)
  }
  return false
}

// Select the earliest lifecycle phase that still needs trusted passing evidence.
function firstIncompleteWorkflowPhase(completed) {
  for (const phase of WORKFLOW_PHASE_ORDER) {
    if (!completed.has(phase)) return phase
  }
  return "DONE"
}

// Map one structured workflow history to the five visible plan-gate statuses.
export function planGateItems(messages = [], workspaceDirectory) {
  let workspaceAvailable = false
  try {
    if (typeof workspaceDirectory === "string") {
      workspaceDirectory = realpathSync(workspaceDirectory)
      workspaceAvailable = true
    }
  } catch { /* missing workspace keeps file and shell evidence fail-closed */ }
  const completed = new Set()
  const latestStatus = new Map()
  const completedTaskPartSignatures = new Map()
  const conflictedTaskPartIds = new Set()
  const sourceEditPartGenerations = new Map()
  const taskStartGenerations = new Map()
  let active = false
  let hasPlan = false
  let currentPhase = "PLAN"
  let currentDiffIdentity = ""
  let currentExternalDiffIdentity = ""
  // The pinned TUI API exposes no independent host-owned diff identity.
  let hasVerifiedHostDiff = false
  let hasSourceEdit = false
  let canMatchCurrentDiff = true
  let editGeneration = 0
  let sourceChangeGeneration = 0
  let latestSourceEditTime = null
  let sourceTimingUncertain = false
  let pendingExecutionDiffIdentity = ""
  const runningTaskPartIds = new Set()
  let anonymousRunningTasks = 0
  const pendingSourceEditPartIds = new Set()
  let anonymousPendingSourceEdits = 0

  // Record terminal mutation timing and latch any missing completion timestamp.
  function recordMutationTime(part) {
    const completionTime = toolChangedTime(part)
    if (completionTime === null) sourceTimingUncertain = true
    else latestSourceEditTime = maximumMutationTime(latestSourceEditTime, part)
  }

  for (const part of orderedToolParts(messages)) {
      if (part?.type !== "tool") continue
      const input = toolInput(part)
      const shellTool = SHELL_TOOL_NAMES.has(part.name)
      if (shellTool && isReadOnlyShellCommand(input, workspaceDirectory)) continue

      const planDocumentEdit = isPlanDocument(input, workspaceDirectory)
      const sourceEditTool = CODE_EDIT_TOOL_NAMES.has(part.name)
        && (!planDocumentEdit || !isPlanLedgerOnlyEdit(part.name, input, workspaceDirectory))
      if (sourceEditTool) {
        const partID = typeof part.id === "string" ? part.id : ""
        const previousEdit = partID ? sourceEditPartGenerations.get(partID) : null
        if (previousEdit) {
          if (previousEdit.conflicted) continue
          if (previousEdit.completed) {
            const terminal = part.state?.status === "completed" || part.state?.status === "error"
            if (!terminal || toolPartSignature(part) === previousEdit.signature) continue
            previousEdit.conflicted = true
            sourceChangeGeneration += 1
            recordMutationTime(part)
            completed.clear()
            if (hasPlan) completed.add("PLAN")
            latestStatus.clear()
            currentDiffIdentity = ""
            currentExternalDiffIdentity = ""
            hasVerifiedHostDiff = false
            canMatchCurrentDiff = false
            pendingExecutionDiffIdentity = ""
            currentPhase = hasPlan ? "PLAN_CHECK" : "PLAN"
            continue
          }
          if (!previousEdit.completed && part.state?.status === "completed") {
            previousEdit.completed = true
            previousEdit.signature = toolPartSignature(part)
            pendingSourceEditPartIds.delete(partID)
            sourceChangeGeneration += 1
            recordMutationTime(part)
            if (previousEdit.generation === editGeneration
              && pendingSourceEditPartIds.size === 0 && anonymousPendingSourceEdits === 0) {
              const hostReference = input?.diffIdentity || input?.commit || ""
              currentDiffIdentity = hostReference
                ? `${hostReference}:edit-${previousEdit.generation}`
                : (workspaceAvailable ? `session-edit:${sourceChangeGeneration}:${partID}` : "")
              currentExternalDiffIdentity = hostReference ? currentDiffIdentity : ""
              hasVerifiedHostDiff = false
              canMatchCurrentDiff = Boolean(workspaceAvailable && currentDiffIdentity)
              pendingExecutionDiffIdentity = canMatchCurrentDiff ? currentDiffIdentity : ""
              if (!canMatchCurrentDiff) {
                completed.clear()
                if (hasPlan) completed.add("PLAN")
                latestStatus.clear()
                currentPhase = hasPlan ? "PLAN_CHECK" : "PLAN"
              }
            } else {
              completed.clear()
              if (hasPlan) completed.add("PLAN")
              latestStatus.clear()
              currentDiffIdentity = ""
              currentExternalDiffIdentity = ""
              hasVerifiedHostDiff = false
              canMatchCurrentDiff = false
              pendingExecutionDiffIdentity = ""
              currentPhase = hasPlan ? "PLAN_CHECK" : "PLAN"
            }
          } else if (!previousEdit.completed && part.state?.status === "error") {
            previousEdit.completed = true
            previousEdit.signature = toolPartSignature(part)
            pendingSourceEditPartIds.delete(partID)
            sourceChangeGeneration += 1
            recordMutationTime(part)
            currentDiffIdentity = ""
            currentExternalDiffIdentity = ""
            hasVerifiedHostDiff = false
            canMatchCurrentDiff = false
            pendingExecutionDiffIdentity = ""
            completed.clear()
            if (hasPlan) completed.add("PLAN")
            latestStatus.clear()
            currentPhase = hasPlan ? "PLAN_CHECK" : "PLAN"
          }
          continue
        }

        editGeneration += 1
        sourceChangeGeneration += 1
        const hostReference = input?.diffIdentity || input?.commit || ""
        const stableEditID = Boolean(partID)
        const editCompleted = part.state?.status === "completed"
        const editErrored = part.state?.status === "error"
        if (editCompleted || editErrored) recordMutationTime(part)
        const editPending = part.state?.status === "running" || part.state?.status === "streaming" || part.state?.status === "pending"
        if (stableEditID) {
          const terminal = editCompleted || part.state?.status === "error"
          sourceEditPartGenerations.set(partID, {
            generation: editGeneration,
            completed: terminal,
            signature: terminal ? toolPartSignature(part) : "",
          })
        }
        if (editPending) {
          if (stableEditID) pendingSourceEditPartIds.add(partID)
          else anonymousPendingSourceEdits += 1
        }
        hasSourceEdit = true
        currentDiffIdentity = hostReference
          ? `${hostReference}:edit-${editGeneration}`
          : (workspaceAvailable && stableEditID ? `session-edit:${editGeneration}:${partID}` : "")
        currentExternalDiffIdentity = hostReference ? currentDiffIdentity : ""
        hasVerifiedHostDiff = false
        canMatchCurrentDiff = Boolean(workspaceAvailable && stableEditID && editCompleted)
        completed.clear()
        const planContentChanged = hasPlanDocumentTarget(input, workspaceDirectory)
        if (hasPlan && !planContentChanged) completed.add("PLAN")
        if (planContentChanged) hasPlan = false
        latestStatus.clear()
        currentPhase = hasPlan ? "PLAN_CHECK" : "PLAN"
        pendingExecutionDiffIdentity = canMatchCurrentDiff ? currentDiffIdentity : ""
        continue
      }

      const unknownTool = !shellTool && part.name !== "task"
        && !CODE_EDIT_TOOL_NAMES.has(part.name) && !READ_ONLY_TOOL_NAMES.has(part.name)
      if (shellTool || unknownTool) {
        const partID = typeof part.id === "string" ? part.id : ""
        const previousMutation = partID ? sourceEditPartGenerations.get(partID) : null
        if (previousMutation) {
          if (previousMutation.conflicted) continue
          if (previousMutation.completed) {
            const terminal = part.state?.status === "completed" || part.state?.status === "error"
            if (!terminal || toolPartSignature(part) === previousMutation.signature) continue
            previousMutation.conflicted = true
            sourceChangeGeneration += 1
            recordMutationTime(part)
            completed.clear()
            if (hasPlan) completed.add("PLAN")
            latestStatus.clear()
            hasSourceEdit = true
            currentDiffIdentity = ""
            currentExternalDiffIdentity = ""
            hasVerifiedHostDiff = false
            canMatchCurrentDiff = false
            pendingExecutionDiffIdentity = ""
            currentPhase = hasPlan ? "PLAN_CHECK" : "PLAN"
            continue
          }
          if (!previousMutation.completed && part.state?.status === "completed") {
            previousMutation.completed = true
            previousMutation.signature = toolPartSignature(part)
            pendingSourceEditPartIds.delete(partID)
            sourceChangeGeneration += 1
            recordMutationTime(part)
            const isLatestMutation = previousMutation.generation === editGeneration
              && pendingSourceEditPartIds.size === 0 && anonymousPendingSourceEdits === 0
            currentDiffIdentity = isLatestMutation
              && workspaceAvailable
              ? `session-mutation:${sourceChangeGeneration}:${partID}`
              : ""
            currentExternalDiffIdentity = ""
            hasVerifiedHostDiff = false
            canMatchCurrentDiff = Boolean(currentDiffIdentity)
            pendingExecutionDiffIdentity = canMatchCurrentDiff ? currentDiffIdentity : ""
            completed.clear()
            if (hasPlan) completed.add("PLAN")
            latestStatus.clear()
            currentPhase = hasPlan ? "PLAN_CHECK" : "PLAN"
          } else if (!previousMutation.completed && part.state?.status === "error") {
            previousMutation.completed = true
            previousMutation.signature = toolPartSignature(part)
            pendingSourceEditPartIds.delete(partID)
            sourceChangeGeneration += 1
            recordMutationTime(part)
            currentDiffIdentity = ""
            currentExternalDiffIdentity = ""
            hasVerifiedHostDiff = false
            canMatchCurrentDiff = false
            pendingExecutionDiffIdentity = ""
            completed.clear()
            if (hasPlan) completed.add("PLAN")
            latestStatus.clear()
            currentPhase = hasPlan ? "PLAN_CHECK" : "PLAN"
          }
          continue
        }

        editGeneration += 1
        sourceChangeGeneration += 1
        const mutationCompleted = part.state?.status === "completed"
        const mutationErrored = part.state?.status === "error"
        if (mutationCompleted || mutationErrored) recordMutationTime(part)
        const mutationPending = part.state?.status === "running" || part.state?.status === "streaming"
          || part.state?.status === "pending"
        if (partID) {
          const terminal = mutationCompleted || part.state?.status === "error"
          sourceEditPartGenerations.set(partID, {
            generation: editGeneration,
            completed: terminal,
            signature: terminal ? toolPartSignature(part) : "",
          })
        }
        if (mutationPending) {
          if (partID) pendingSourceEditPartIds.add(partID)
          else anonymousPendingSourceEdits += 1
        }
        hasSourceEdit = true
        currentDiffIdentity = workspaceAvailable && partID
          ? `session-mutation:${editGeneration}:${partID}`
          : ""
        currentExternalDiffIdentity = ""
        hasVerifiedHostDiff = false
        canMatchCurrentDiff = Boolean(workspaceAvailable && partID && mutationCompleted)
        completed.clear()
        if (hasPlan) completed.add("PLAN")
        latestStatus.clear()
        currentPhase = hasPlan ? "PLAN_CHECK" : "PLAN"
        pendingExecutionDiffIdentity = canMatchCurrentDiff ? currentDiffIdentity : ""
        continue
      }

      let taskEvidence = []
      if (part.name === "task") {
        const partID = typeof part.id === "string" ? part.id : ""
        if (partID && conflictedTaskPartIds.has(partID)) continue
        const priorSignature = partID ? completedTaskPartSignatures.get(partID) : null
        if (priorSignature) {
          const currentSignature = toolPartSignature(part)
          if (part.state?.status === "completed" && currentSignature === priorSignature) continue
          conflictedTaskPartIds.add(partID)
          sourceChangeGeneration += 1
          recordMutationTime(part)
          completed.clear()
          if (hasPlan) completed.add("PLAN")
          latestStatus.clear()
          hasSourceEdit = true
          currentDiffIdentity = ""
          currentExternalDiffIdentity = ""
          hasVerifiedHostDiff = false
          canMatchCurrentDiff = false
          pendingExecutionDiffIdentity = ""
          currentPhase = hasPlan ? "PLAN_CHECK" : "PLAN"
          continue
        }
        if (part.state?.status === "running" || part.state?.status === "streaming" || part.state?.status === "pending") {
          const runningPartID = partID
          if (runningPartID) {
            runningTaskPartIds.add(runningPartID)
            if (!taskStartGenerations.has(runningPartID)) {
              taskStartGenerations.set(runningPartID, sourceChangeGeneration)
            }
          }
          else anonymousRunningTasks += 1
          continue
        }
        if (partID) runningTaskPartIds.delete(partID)
        else if (anonymousRunningTasks > 0) anonymousRunningTasks -= 1
        if (part.state?.status !== "completed" || !partID) {
          sourceChangeGeneration += 1
          recordMutationTime(part)
          completed.clear()
          if (hasPlan) completed.add("PLAN")
          latestStatus.clear()
          hasSourceEdit = true
          canMatchCurrentDiff = false
          currentDiffIdentity = ""
          currentExternalDiffIdentity = ""
          pendingExecutionDiffIdentity = ""
          currentPhase = hasPlan ? "PLAN_CHECK" : "PLAN"
          continue
        }
        completedTaskPartSignatures.set(partID, toolPartSignature(part))
        const taskStartGeneration = taskStartGenerations.get(partID)
        taskStartGenerations.delete(partID)
        taskEvidence = workflowEvidence(part)
        let taskChangesSource = taskEvidence.length === 0
        let taskDiffIdentity = ""
        let conflictingTaskDiffs = false
        for (const evidence of taskEvidence) {
          if (evidence.phase === "EXECUTE" || evidence.phase === "ITERATE") {
            taskChangesSource = true
          }
          if (evidence.diffIdentity) {
            if (taskDiffIdentity && taskDiffIdentity !== evidence.diffIdentity) conflictingTaskDiffs = true
            else taskDiffIdentity = evidence.diffIdentity
          }
        }
        if (conflictingTaskDiffs) {
          taskChangesSource = true
          taskDiffIdentity = ""
        }

        const staleTaskResult = taskEvidenceIsStale(
          part,
          taskStartGeneration,
          sourceChangeGeneration,
          latestSourceEditTime,
          sourceTimingUncertain,
        )
        if (staleTaskResult) {
          if (taskChangesSource) {
            sourceChangeGeneration += 1
            recordMutationTime(part)
            completed.clear()
            if (hasPlan) completed.add("PLAN")
            latestStatus.clear()
            hasSourceEdit = true
            currentDiffIdentity = ""
            currentExternalDiffIdentity = ""
            hasVerifiedHostDiff = false
            canMatchCurrentDiff = false
            pendingExecutionDiffIdentity = ""
            currentPhase = hasPlan ? "PLAN_CHECK" : "PLAN"
          }
          continue
        }

        if (taskEvidence.length === 0 || conflictingTaskDiffs) {
          sourceChangeGeneration += 1
          recordMutationTime(part)
          completed.clear()
          if (hasPlan) completed.add("PLAN")
          latestStatus.clear()
          hasSourceEdit = true
          currentDiffIdentity = conflictingTaskDiffs ? "" : taskDiffIdentity
          currentExternalDiffIdentity = ""
          hasVerifiedHostDiff = false
          canMatchCurrentDiff = Boolean(currentDiffIdentity)
          pendingExecutionDiffIdentity = ""
          currentPhase = hasPlan ? "PLAN_CHECK" : "PLAN"
          continue
        }
      }

      for (const evidence of taskEvidence) {
        active = true
        if (pendingSourceEditPartIds.size > 0 || anonymousPendingSourceEdits > 0) {
          currentPhase = hasPlan ? "PLAN_CHECK" : "PLAN"
          continue
        }
        if (evidence.phase === "EXECUTE" || evidence.phase === "ITERATE") {
          const taskID = typeof part.id === "string" ? part.id : ""
          sourceChangeGeneration += 1
          recordMutationTime(part)
          completed.clear()
          if (hasPlan) completed.add("PLAN")
          latestStatus.clear()
          hasSourceEdit = true
          currentDiffIdentity = evidence.diffIdentity
            || (workspaceAvailable && taskID ? `session-task:${sourceChangeGeneration}:${taskID}` : "")
          currentExternalDiffIdentity = evidence.diffIdentity
          hasVerifiedHostDiff = false
          canMatchCurrentDiff = Boolean(workspaceAvailable && taskID && currentDiffIdentity)
          pendingExecutionDiffIdentity = evidence.status === "PASS" && evidence.diffIdentity
            ? currentDiffIdentity
            : ""
          currentPhase = hasPlan ? "PLAN_CHECK" : "PLAN"
          continue
        }
        if (hasSourceEdit && !canMatchCurrentDiff) continue
        if (hasSourceEdit && evidence.diffIdentity) {
          if (currentExternalDiffIdentity && evidence.diffIdentity !== currentExternalDiffIdentity) continue
          if (!currentExternalDiffIdentity) currentExternalDiffIdentity = evidence.diffIdentity
        }
        if (hasSourceEdit && evidence.phase === "RELEASE_GATE"
          && (!hasVerifiedHostDiff || !currentExternalDiffIdentity
            || evidence.diffIdentity !== currentExternalDiffIdentity)) continue
        if (!WORKFLOW_PHASE_ORDER.includes(evidence.phase)) continue
        if (evidence.phase === "PLAN") {
          if (evidence.status !== "PASS") {
            completed.clear()
            latestStatus.clear()
            pendingExecutionDiffIdentity = ""
            hasPlan = false
            currentPhase = "PLAN"
            continue
          }
          completed.clear()
          latestStatus.clear()
          pendingExecutionDiffIdentity = ""
          hasPlan = true
          completed.add("PLAN")
          currentPhase = "PLAN_CHECK"
          continue
        }

        const phaseIndex = WORKFLOW_PHASE_ORDER.indexOf(evidence.phase)
        let predecessorsComplete = true
        for (const phase of WORKFLOW_PHASE_ORDER.slice(0, phaseIndex)) {
          if (!completed.has(phase)) predecessorsComplete = false
        }
        if (!predecessorsComplete) {
          currentPhase = hasPlan ? firstIncompleteWorkflowPhase(completed) : "PLAN_CHECK"
          continue
        }
        if (evidence.status === "PASS") {
          latestStatus.set(evidence.phase, evidence.status)
          completed.add(evidence.phase)
          if (evidence.phase === "PLAN_CHECK" && pendingExecutionDiffIdentity
            && currentDiffIdentity === pendingExecutionDiffIdentity) {
            completed.add("EXECUTE")
            pendingExecutionDiffIdentity = ""
          }
          currentPhase = firstIncompleteWorkflowPhase(completed)
        } else {
          for (const phase of WORKFLOW_PHASE_ORDER.slice(phaseIndex)) {
            completed.delete(phase)
            latestStatus.delete(phase)
          }
          latestStatus.set(evidence.phase, evidence.status)
          currentPhase = evidence.phase
        }
      }
  }

  if (!active) return null
  const hasRunningTask = runningTaskPartIds.size > 0 || anonymousRunningTasks > 0
  const items = []
  for (const phase of DISPLAY_GATE_PHASES) {
    if (completed.has(phase)) {
      items.push({ phase, status: hasRunningTask ? "PENDING" : "PASS" })
      continue
    }
    const latest = latestStatus.get(phase)
    if (latest === "FINDINGS") {
      items.push({ phase, status: "FINDINGS" })
      continue
    }
    if (latest === "BLOCKED" || latest === "FAILED") {
      items.push({ phase, status: "BLOCKED" })
      continue
    }
    items.push({ phase, status: currentPhase === phase ? "PENDING" : "NOT STARTED" })
  }
  return items
}

// Format ledger rows into one stable text node for atomic TUI updates.
export function planGateText(gates) {
  const lines = []
  for (const gate of gates) lines.push(`${gate.phase} — ${gate.status}`)
  return lines.join("\n")
}

// Resolve all sidebar colors from the active OpenCode theme's semantic palette.
export function sidebarColors(theme) {
  return {
    title: theme.text.action.primary.default,
    section: theme.text.default,
    active: theme.text.feedback.success.default,
    muted: theme.text.subdued,
    pending: theme.text.feedback.warning.default,
  }
}

// Format canonical skill names consistently with the server snapshot labels.
function skillLabel(skill) {
  // Map each item through the local transformation.
  return skill.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")
}

// Recover completed native skill calls that occurred after prompt metadata was recorded.
function loadedSkillEntries(messages) {
  if (!Array.isArray(messages)) return []
  const entries = []
  const seen = new Set()
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const content = messages[messageIndex]?.content
    if (!Array.isArray(content)) continue
    for (let contentIndex = content.length - 1; contentIndex >= 0; contentIndex -= 1) {
      const part = content[contentIndex]
      if (part?.type !== "tool" || part.name !== "skill" || part.state?.status !== "completed") continue
      const input = toolInput(part)
      const skill = canonicalSkillName(input?.id ?? input?.name)
      if (!skill || seen.has(skill)) continue
      seen.add(skill)
      entries.push({ skill, label: skillLabel(skill), current: entries.length === 0 })
    }
  }
  return entries
}

// Extract completed tool output text for review-evidence recognition.
function toolOutputText(part) {
  const candidates = [part?.state?.output, part?.state?.result]
  const output = []
  for (const item of Array.isArray(part?.state?.content) ? part.state.content : []) {
    if (item?.type === "text" && typeof item.text === "string") output.push(item.text)
  }
  for (const value of candidates) {
    if (typeof value === "string") output.push(value)
  }
  return output.join("\n")
}

// Rebuild review obligations from completed native tool calls when metadata is stale.
function observedPendingItems(messages) {
  if (!Array.isArray(messages)) return null
  let hasRelevantHistory = false
  let needsCodeReview = false
  let needsDesignReview = false
  let reviewGeneration = 0
  let currentReviewReference = ""
  let currentDiffIdentity = ""
  let validatedDiffIdentity = ""
  let reviewedDiffIdentity = ""
  let reviewHasFindings = false
  let completedWorkflowPhases = new Set()
  let specWorkflowRequired = false
  let workflowRisk = null

  for (const message of messages) {
    if (!Array.isArray(message?.content)) continue
    const messageText = message.content
      // Keep only textual prompt content for workflow phrase detection.
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      // Normalize prompt fragments before matching workflow triggers.
      .map((part) => part.text.toLowerCase())
      .join(" ")
    if (messageText) {
      // Preserve a prompt-derived SPEC requirement across later edits.
      if (hasWorkflowPhraseSignal(messageText, SPEC_WORKFLOW_PHRASES)) specWorkflowRequired = true
      const observedRisk = classifyObservedWorkflowRisk(messageText)
      const workflowRiskRank = ["small", "normal", "spec-required", "significant", "release-sensitive"]
      if (workflowRisk === null) workflowRisk = observedRisk || "normal"
      else if (observedRisk && workflowRiskRank.indexOf(observedRisk) > workflowRiskRank.indexOf(workflowRisk)) {
        workflowRisk = observedRisk
      }
    }
    for (const part of message.content) {
      if (part?.type !== "tool" || part.state?.status !== "completed") continue
      const toolName = typeof part.name === "string" ? part.name : ""
      const input = toolInput(part)
      if (CODE_EDIT_TOOL_NAMES.has(toolName)) {
        hasRelevantHistory = true
        needsCodeReview = workflowRisk !== "small"
        reviewGeneration += 1
        const hostReference = input?.diffIdentity || input?.commit || ""
        currentReviewReference = hostReference
        currentDiffIdentity = hostReference ? `${hostReference}:edit-${reviewGeneration}` : ""
        validatedDiffIdentity = ""
        reviewedDiffIdentity = ""
        reviewHasFindings = false
        completedWorkflowPhases = new Set()
        continue
      }
      if (toolName === "skill") {
        const skill = canonicalSkillName(input?.id ?? input?.name)
        if (skill === "design") {
          hasRelevantHistory = true
          needsDesignReview = true
        } else if (skill === "design-review") {
          hasRelevantHistory = true
          needsDesignReview = false
        } else if (skill === "spec") {
          specWorkflowRequired = true
          validatedDiffIdentity = ""
        }
        continue
      }
      if (toolName !== "task") continue
      const output = toolOutputText(part)
      const generation = Number(output.match(/review-generation:\s*(\d+)/)?.[1] || 0)
      const diffIdentity = output.match(/\bdiff=([^\s]+)/)?.[1] || ""
      const phase = output.match(/\bphase=(SPEC|INTAKE|PLAN|PLAN_CHECK|EXECUTE|VALIDATE|REVIEW|ITERATE|AUDIT)\b/)?.[1] || ""
      const reviewReference = output.match(/review-reference:\s*([^\s]+)/)?.[1] || ""
      const completedAt = output.match(/review-completed-at:\s*([^\s]+)/)?.[1] || ""
      if (phase === "VALIDATE" && /ASK_WORKFLOW_PASS\b/.test(output)
        && currentDiffIdentity && diffIdentity === currentDiffIdentity) {
        completedWorkflowPhases.add(phase)
        const advancedPlanning = completedWorkflowPhases.has("INTAKE") || completedWorkflowPhases.has("PLAN_CHECK")
        const requiresSpec = specWorkflowRequired || completedWorkflowPhases.has("SPEC")
        const hasRequiredValidation = completedWorkflowPhases.has("PLAN")
          && completedWorkflowPhases.has("EXECUTE") && completedWorkflowPhases.has("VALIDATE")
          && (!advancedPlanning || (completedWorkflowPhases.has("INTAKE") && completedWorkflowPhases.has("PLAN_CHECK")))
          && (!requiresSpec || completedWorkflowPhases.has("SPEC"))
        if (hasRequiredValidation) validatedDiffIdentity = currentDiffIdentity
        continue
      }
      if (["SPEC", "INTAKE", "PLAN", "PLAN_CHECK", "EXECUTE"].includes(phase)
        && /ASK_WORKFLOW_PASS\b/.test(output) && currentDiffIdentity && diffIdentity === currentDiffIdentity) {
        completedWorkflowPhases.add(phase)
        if (phase === "SPEC") specWorkflowRequired = true
        if (["SPEC", "INTAKE", "PLAN_CHECK"].includes(phase)) validatedDiffIdentity = ""
        continue
      }
      if ((/ASK_WORKFLOW_FINDINGS\b/.test(output) || /ASK_WORKFLOW_(BLOCKED|FAILED)\b/.test(output))
        && currentDiffIdentity && diffIdentity === currentDiffIdentity) {
        reviewHasFindings = true
        if (phase === "REVIEW") reviewedDiffIdentity = ""
        if (phase === "VALIDATE") validatedDiffIdentity = ""
        needsCodeReview = workflowRisk !== "small"
        continue
      }
      if (phase === "ITERATE" && /ASK_WORKFLOW_PASS\b/.test(output)
        && currentDiffIdentity && diffIdentity === currentDiffIdentity) {
        reviewHasFindings = false
        validatedDiffIdentity = ""
        completedWorkflowPhases.delete("VALIDATE")
        continue
      }
      if (!/ASK_WORKFLOW_PASS\b/.test(output) || !/ASK_REVIEW_COMPLETE\b/.test(output)) continue
      if (!/review-result:\s*PASS\b/.test(output) || generation !== reviewGeneration
        || !currentDiffIdentity || diffIdentity !== currentDiffIdentity || !completedAt) continue
      if (phase === "REVIEW" && /review-scope:\s*REVIEW\b/.test(output)
        && reviewReference === currentReviewReference && !reviewHasFindings
        && validatedDiffIdentity === currentDiffIdentity) {
        reviewedDiffIdentity = currentDiffIdentity
        needsCodeReview = false
      }
      if (phase === "AUDIT" && /review-scope:\s*final-diff\b/.test(output)
        && reviewReference === currentReviewReference && !reviewHasFindings
        && reviewedDiffIdentity === currentDiffIdentity
        && validatedDiffIdentity === currentDiffIdentity) {
        needsCodeReview = false
      }
    }
  }

  return hasRelevantHistory ? { needsCodeReview, needsDesignReview } : null
}

// Discard malformed or duplicate active-skill records from a server snapshot.
function activeSkillEntries(status) {
  if (!Array.isArray(status?.activeSkills)) return []
  const seen = new Set()
  // Keep items that satisfy the local predicate.
  return status.activeSkills.filter((entry) => {
    const label = entry?.label
    if (typeof label !== "string" || !label) return false
    const skill = typeof entry.skill === "string" && entry.skill ? entry.skill : label
    if (seen.has(skill)) return false
    seen.add(skill)
    return true
  })
}

// Combine the prompt-time snapshot with newer, completed V2 skill tool calls.
export function mergeActiveSkills(status, messages) {
  const observed = loadedSkillEntries(messages)
  // Map each item through the local transformation.
  const snapshot = activeSkillEntries(status).map((entry) => observed.length > 0 ? { ...entry, current: false } : entry)
  // Execute the seen callback.
  const seen = new Set(observed.flatMap((entry) => typeof entry.skill === "string" ? [entry.skill] : []))
  // Keep items that satisfy the local predicate.
  return [...observed, ...snapshot.filter((entry) => typeof entry.skill !== "string" || !seen.has(entry.skill))]
}

// Extract safe pending-obligation labels from the latest server snapshot.
export function pendingItems(status, messages = []) {
  const observed = observedPendingItems(messages)
  const pending = observed
    ? [
      ...(observed.needsCodeReview ? [{ label: "Code review needed" }] : []),
      ...(observed.needsDesignReview ? [{ label: "Design review needed" }] : []),
    ]
    : (Array.isArray(status?.pending) ? status.pending : [])
  return pending
    // Map each item through the local transformation.
    .map((entry) => entry?.label)
    // Keep items that satisfy the local predicate.
    .filter((label) => typeof label === "string" && label.length > 0)
}
