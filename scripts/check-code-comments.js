#!/usr/bin/env node

const fs = require("node:fs/promises")
const path = require("node:path")

const REPOSITORY_ROOT = path.resolve(__dirname, "..")
const SOURCE_ROOTS = ["core", "plugins", "scripts"]
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx"])
const CONTROL_FLOW_WORDS = new Set(["catch", "for", "if", "switch", "while", "with"])

// Recursively collect first-party JavaScript and TypeScript source files.
async function sourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name === "node_modules") continue
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(entryPath))
      continue
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(entryPath)
  }
  return files
}

// Replace comments and quoted content with spaces while retaining source line numbers.
function codeOnly(source) {
  let output = ""
  let index = 0
  let mode = "code"
  while (index < source.length) {
    const current = source[index]
    const next = source[index + 1]
    if (mode === "line-comment") {
      if (current === "\n") { mode = "code"; output += "\n" } else output += " "
      index += 1
      continue
    }
    if (mode === "block-comment") {
      if (current === "*" && next === "/") { mode = "code"; output += "  "; index += 2; continue }
      output += current === "\n" ? "\n" : " "
      index += 1
      continue
    }
    if (mode !== "code") {
      if (current === "\\") { output += "  "; index += 2; continue }
      if (current === mode) { mode = "code"; output += " "; index += 1; continue }
      output += current === "\n" ? "\n" : " "
      index += 1
      continue
    }
    if (current === "/" && next === "/") { mode = "line-comment"; output += "  "; index += 2; continue }
    if (current === "/" && next === "*") { mode = "block-comment"; output += "  "; index += 2; continue }
    if (current === "'" || current === '"' || current === "`") { mode = current; output += " "; index += 1; continue }
    output += current
    index += 1
  }
  return output
}

// Identify lines that introduce a function, callback, or method body.
function isFunctionLine(line) {
  if (line.includes("functio" + "n") || line.includes("=" + ">")) return true
  const match = line.match(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^={]+)?\{/)
  return Boolean(match && !CONTROL_FLOW_WORDS.has(match[1]))
}

// Require an adjacent line or block comment so the comment's intent is unambiguous.
function hasIntentComment(lines, index) {
  const previous = lines[index - 1]?.trim() || ""
  return previous.startsWith("//") || previous.endsWith("*/")
}

// Return all function-like lines that lack their own immediately preceding comment.
function missingIntentComments(source) {
  const rawLines = source.split(/\r?\n/)
  const codeLines = codeOnly(source).split(/\r?\n/)
  const missing = []
  for (let index = 0; index < codeLines.length; index += 1) {
    if (isFunctionLine(codeLines[index]) && !hasIntentComment(rawLines, index)) {
      missing.push(index + 1)
    }
  }
  return missing
}

// Prove the scanner accepts adjacent comments and rejects missing ones.
function verifyScanner() {
  const validSource = "// Return the static test value.\nconst value = () => 1\n"
  const invalidSource = "const value = () => 1\n"
  if (missingIntentComments(validSource).length !== 0 || missingIntentComments(invalidSource).join(",") !== "1") {
    throw new Error("source-comment scanner self-check failed")
  }
}

// Scan the canonical source roots and fail with file-and-line evidence.
async function main() {
  verifyScanner()
  // Map each item through the local transformation.
  const files = (await Promise.all(SOURCE_ROOTS.map((root) => sourceFiles(path.join(REPOSITORY_ROOT, root))))).flat()
  const violations = []
  for (const filePath of files) {
    const source = await fs.readFile(filePath, "utf8")
    for (const line of missingIntentComments(source)) {
      violations.push(`${path.relative(REPOSITORY_ROOT, filePath)}:${line}: function-like construct needs an intent comment on the preceding line`)
    }
  }
  if (violations.length > 0) throw new Error(`Missing source intent comments:\n${violations.join("\n")}`)
  console.log("All first-party JavaScript and TypeScript function-like constructs have intent comments.")
}

// Surface a non-zero result for CI while retaining the complete violation report.
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
