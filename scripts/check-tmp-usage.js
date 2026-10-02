#!/usr/bin/env node
// Security lint: reject unsafe temp-directory usage in first-party sources.
// The shared temp directory is world-writable, so a predictable path inside it lets another local user
// pre-create, read, or symlink the file. Persistent state belongs in a private per-user directory, and
// scratch space must come from an unpredictable, exclusively created path (mkdtemp, mktemp, a GUID).

const fs = require("node:fs")
const path = require("node:path")

const REPO_ROOT = path.resolve(__dirname, "..")
const SOURCE_ROOTS = ["scripts", "plugins", "core", "hooks"]
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".sh", ".ps1", ".json"])
const SELF_PATH = path.join("scripts", "check-tmp-usage.js")
// A justified exception is marked on the offending line or the line above it.
const SUPPRESSION_MARKER = "tmp-ok:"
// Calls that create an unpredictable, exclusively owned path make a temp-root reference safe.
// Only real calls count, so the word in a comment or identifier cannot silence a finding.
const SAFE_CREATION = /\bmkdtemp\w*\s*\(|\bmktemp\b|\bNew-TemporaryFile\b|\bNewGuid\s*\(|\bGetRandomFileName\s*\(|\brandomUUID\s*\(|\brandomBytes\s*\(/

// Line-based heuristics, not a data-flow analysis: they catch the common shapes and accept a temp-root
// reference only when a safe creation call sits on the same or an adjacent line.
const RULES = [
  { id: "tmpdir-reference", pattern: /\btmpdir\s*\(|\bos\.tmpdir\b/, message: "os.tmpdir() without mkdtemp: use a private per-user directory for state, or fs.mkdtemp for scratch space" },
  { id: "literal-tmp-path", pattern: /(^|[\s"'`=(:,])\/(var\/)?tmp(\/[\w.$*{-]|["'`]|\s|$)/, message: "path in the shared temp directory" },
  { id: "tmp-env-path", pattern: /\$\{?(env:)?(TMPDIR|TEMP|TMP)\b|process\.env(\.|\[\s*["'])(TMPDIR|TEMP|TMP)\b|\{[^}]*\b(TMPDIR|TEMP|TMP)\b[^}]*\}\s*=\s*process\.env|GetTempPath\s*\(/, message: "temp-root reference without an unpredictable name (mkdtemp, mktemp, GUID)" },
]

// Recursively collect first-party source files, skipping vendored dependencies.
function sourceFiles(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...sourceFiles(entryPath))
      continue
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(entryPath)
  }
  return files
}

// Tell whether a line is only a comment in the file's language, so prose about /tmp is not flagged.
function isCommentLine(line, extension) {
  const trimmed = line.trim()
  if (extension === ".sh" || extension === ".ps1") return trimmed.startsWith("#")
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")
}

// Drop a trailing comment so words inside it neither trigger nor silence a rule.
function withoutTrailingComment(line, extension) {
  const marker = extension === ".sh" || extension === ".ps1" ? /\s#.*$/ : /\s\/\/.*$/
  return line.replace(marker, "")
}

// Tell whether a safe creation call sits on the line or directly next to it (wrapped calls, a base variable).
function hasAdjacentSafeCreation(codeLines, index) {
  // Check the previous, current, and next line.
  return [index - 1, index, index + 1].some((position) => SAFE_CREATION.test(codeLines[position] || ""))
}

// Find every unsafe temp usage in one source text and describe it with its line number.
function findUnsafeTempUsage(source, extension) {
  const findings = []
  const lines = source.split(/\r?\n/)
  // Blank out comment lines and trailing comments while keeping line numbers aligned.
  const codeLines = lines.map((line) => (isCommentLine(line, extension) ? "" : withoutTrailingComment(line, extension)))
  // Judge each code line; neighbours are consulted only for a safe creation call or a suppression marker.
  codeLines.forEach((codeLine, index) => {
    if (!codeLine.trim()) return
    if (lines[index].includes(SUPPRESSION_MARKER) || (lines[index - 1] || "").includes(SUPPRESSION_MARKER)) return
    // Report the first matching rule only; one finding per line keeps the output readable.
    const rule = RULES.find((candidate) => candidate.pattern.test(codeLine))
    if (!rule || hasAdjacentSafeCreation(codeLines, index)) return
    findings.push({ line: index + 1, rule: rule.id, message: rule.message, text: lines[index].trim() })
  })
  return findings
}

// Prove the rules still catch the known-bad shapes and accept the safe ones before trusting a clean scan.
function selfTestFailures() {
  const cases = [
    { name: "hook state in os.tmpdir() (the original finding)", extension: ".js", source: 'return path.join(os.tmpdir(), "agent-skills-kit-sessions")', unsafe: true },
    { name: "literal /tmp state file", extension: ".js", source: 'fs.writeFileSync("/tmp/ask-state.json", body)', unsafe: true },
    { name: "TMPDIR with a fixed name in shell", extension: ".sh", source: 'state_file="${TMPDIR:-/tmp}/ask-state"', unsafe: true },
    { name: "TEMP with a fixed name in PowerShell", extension: ".ps1", source: '$state = Join-Path $env:TEMP "ask-state.json"', unsafe: true },
    { name: "bare temp root joined with a fixed name", extension: ".js", source: 'const state = path.join("/tmp", "ask-state")', unsafe: true },
    { name: "bracket access to TMPDIR", extension: ".js", source: 'const root = process.env["TMPDIR"]', unsafe: true },
    { name: "destructured TMPDIR", extension: ".js", source: "const { TMPDIR } = process.env", unsafe: true },
    { name: "uncalled os.tmpdir reference", extension: ".js", source: "const resolveRoot = os.tmpdir", unsafe: true },
    { name: "safe word only in a trailing comment", extension: ".js", source: 'const dir = path.join(os.tmpdir(), "fixed") // not mkdtemp', unsafe: true },
    { name: "shell TMP with a fixed name", extension: ".sh", source: 'state_file="$TMP/ask-state"', unsafe: true },
    { name: "shell cd into the temp root", extension: ".sh", source: "cd /tmp && touch ask-state", unsafe: true },
    { name: "PowerShell TMPDIR with a fixed name", extension: ".ps1", source: '$state = Join-Path $env:TMPDIR "ask-state.json"', unsafe: true },
    { name: "mkdtemp call wrapped over two lines", extension: ".js", source: 'const dir = fs.mkdtempSync(\n  path.join(os.tmpdir(), "ask-"))', unsafe: false },
    { name: "temp root variable passed to mkdtemp on the next line", extension: ".js", source: 'const base = os.tmpdir()\nconst dir = fs.mkdtempSync(path.join(base, "ask-"))', unsafe: false },
    { name: "fs.mkdtemp under os.tmpdir()", extension: ".js", source: 'const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ask-check-"))', unsafe: false },
    { name: "mktemp -d template", extension: ".sh", source: 'sandbox="$(mktemp -d "${TMPDIR:-/tmp}/ask-check.XXXXXX")"', unsafe: false },
    { name: "GUID-named PowerShell temp path", extension: ".ps1", source: '$p = Join-Path ([System.IO.Path]::GetTempPath()) ("ask-" + [System.Guid]::NewGuid().ToString("N"))', unsafe: false },
    { name: "comment that mentions /tmp/ask", extension: ".js", source: "// never write state to /tmp/ask", unsafe: false },
    { name: "suppressed line with a reason", extension: ".js", source: 'const fixture = "/tmp/example" // tmp-ok: string fixture, never opened', unsafe: false },
  ]
  return cases
    // Keep the cases whose verdict differs from the expected one.
    .filter((testCase) => (findUnsafeTempUsage(testCase.source, testCase.extension).length > 0) !== testCase.unsafe)
    // Name each failing case for the report.
    .map((testCase) => `self-test: ${testCase.name} should be ${testCase.unsafe ? "flagged" : "accepted"}`)
}

// Scan every first-party source file and return the findings as printable lines.
function scanRepository() {
  const reports = []
  for (const root of SOURCE_ROOTS) {
    const rootPath = path.join(REPO_ROOT, root)
    if (!fs.existsSync(rootPath)) continue
    for (const filePath of sourceFiles(rootPath)) {
      const relativePath = path.relative(REPO_ROOT, filePath)
      // This file holds the known-bad samples as test data.
      if (relativePath === SELF_PATH) continue
      const findings = findUnsafeTempUsage(fs.readFileSync(filePath, "utf8"), path.extname(filePath))
      for (const finding of findings) reports.push(`${relativePath}:${finding.line} [${finding.rule}] ${finding.message}\n    ${finding.text}`)
    }
  }
  return reports
}

const failures = [...selfTestFailures(), ...scanRepository()]
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`)
  console.error(`\n${failures.length} unsafe temp usage finding(s). Use a private directory or mkdtemp/mktemp; mark a justified exception with "${SUPPRESSION_MARKER} <reason>".`)
  process.exitCode = 1
} else {
  console.log("Temp usage checks passed: no predictable shared-temp paths in scripts/, plugins/, core/, or hooks/.")
}
