#!/usr/bin/env node
// Plan status overview: parses the status format of plan files (plans/*.md, or the globs in .ask.json): frontmatter, checkboxes, gate ledger,
// shared by the /status command, the SessionStart hook, and the compaction ledger.

const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const GATE_COLUMNS = ["gate", "result", "by", "diff"]
const MAX_ITEM_LENGTH = 100

// Split optional `---` frontmatter from the body and read its flat `key: value` pairs (comments stripped).
function splitFrontmatter(text) {
  const match = String(text).replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: String(text).replace(/\r\n/g, "\n") }
  const meta = {}
  for (const line of match[1].split("\n")) {
    const pair = line.match(/^([A-Za-z_-]+):\s*(.*?)\s*(?:#.*)?$/)
    if (pair) meta[pair[1].toLowerCase()] = pair[2].replace(/^["']|["']$/g, "")
  }
  return { meta, body: match[2] }
}

// Collect the Markdown checkbox items at any depth, in document order.
function parseCheckboxes(body) {
  const items = []
  for (const line of body.split("\n")) {
    const match = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*\S)\s*$/)
    if (match) items.push({ done: match[1] !== " ", text: match[2] })
  }
  return items
}

// Read the rows of the `## Gate ledger` table as {gate, result, by, diff}; header, separator, and blank rows are skipped.
function parseGateLedger(body) {
  const section = body.match(/^##\s+Gate ledger\s*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/im)
  if (!section) return []
  const rows = []
  for (const line of section[1].split("\n")) {
    if (!line.trim().startsWith("|")) continue
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim())
    const isSeparator = cells.every((cell) => /^:?-+:?$/.test(cell))
    const isHeader = cells[0] && cells[0].toLowerCase() === GATE_COLUMNS[0]
    if (isSeparator || isHeader || cells.every((cell) => !cell)) continue
    rows.push(Object.fromEntries(GATE_COLUMNS.map((column, index) => [column, cells[index] || ""])))
  }
  return rows
}

// Parse one plan text into its status summary; a plan without frontmatter has status "unknown".
function parsePlan(text) {
  // Editors on Windows may save a BOM, which would hide the frontmatter fence.
  const { meta, body } = splitFrontmatter(String(text).replace(/^﻿/, ""))
  const items = parseCheckboxes(body)
  const next = items.find((item) => !item.done)
  return {
    status: ["active", "done", "parked"].includes(meta.status) ? meta.status : "unknown",
    branch: meta.branch || "",
    base: meta.base || "",
    done: items.filter((item) => item.done).length,
    total: items.length,
    nextItem: next ? next.text : "",
    gates: parseGateLedger(body),
  }
}

const CONFIG_FILE = ".ask.json"
const DEFAULT_PLAN_GLOBS = ["plans/*.md"]

// Read the plan globs from the repo-local `.ask.json` (`{"plans": ["docs/*-plan.md"]}`); fall back to plans/*.md when absent or invalid.
function readPlanGlobs(cwd) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(cwd, CONFIG_FILE), "utf8"))
    const globs = typeof config.plans === "string" ? [config.plans] : config.plans
    // Only relative, single-folder globs inside the repository are honoured; anything else is ignored.
    const valid = Array.isArray(globs) ? globs.filter((glob) => typeof glob === "string" && isSafeGlob(glob)) : []
    return valid.length > 0 ? valid : DEFAULT_PLAN_GLOBS
  } catch {
    return DEFAULT_PLAN_GLOBS
  }
}

// Accept a relative `folder/name*.md` pattern whose wildcards sit only in the file name and that never climbs out of the repository.
function isSafeGlob(glob) {
  const normalized = glob.replace(/\\/g, "/")
  if (path.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized)) return false
  const folder = path.posix.dirname(normalized)
  return !folder.split("/").includes("..") && !/[*?]/.test(folder) && normalized.endsWith(".md")
}

// Turn the file-name part of a glob into an anchored regular expression (`*` and `?` only).
function fileNamePattern(glob) {
  const escaped = path.posix.basename(glob).replace(/[.+^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i")
}

// List the files one glob matches as repo-relative forward-slash paths; a missing folder yields none.
function matchGlob(cwd, glob) {
  const folder = path.posix.dirname(glob.replace(/\\/g, "/"))
  const pattern = fileNamePattern(glob)
  try {
    return fs.readdirSync(path.join(cwd, folder))
      .filter((name) => pattern.test(name))
      .map((name) => (folder === "." ? name : `${folder}/${name}`))
  } catch {
    return []
  }
}

// List the plans the configured globs match (default plans/*.md) with their parsed status, newest first; never reads outside the repository.
function listPlans(cwd) {
  try {
    // A file matched by two globs is listed once.
    const relativePaths = [...new Set(readPlanGlobs(cwd).flatMap((glob) => matchGlob(cwd, glob)))]
    return relativePaths
      .map((relative) => ({ relative, mtimeMs: fs.statSync(path.join(cwd, relative)).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .map(({ relative }) => ({ path: relative, ...parsePlan(fs.readFileSync(path.join(cwd, relative), "utf8")) }))
  } catch {
    return []
  }
}

// Explain an empty result: where the overview looked and how to point it elsewhere.
function noPlansText(cwd) {
  return [
    `No plans found in ${readPlanGlobs(cwd).join(", ")}.`,
    `To read plans from another location, add ${CONFIG_FILE} at the repository root, for example {"plans": ["docs/*-plan.md"]}.`,
  ].join("\n")
}

// Shorten an item to one readable line: prefer its bold title, drop markdown markers, then cap the length.
function clip(text) {
  // Plan items often read "1. **Title.** Long explanation"; the title alone is what an overview needs.
  const titled = text.match(/^(\d+\.\s*)?\*\*(.+?)\*\*/)
  const plain = (titled ? `${titled[1] || ""}${titled[2]}` : text).replace(/[*`]/g, "").trim()
  return plain.length > MAX_ITEM_LENGTH ? `${plain.slice(0, MAX_ITEM_LENGTH - 3)}...` : plain
}

// Render the one-line session summary of an active plan.
function activePlanLine(plan) {
  const next = plan.nextItem ? `, next: ${clip(plan.nextItem)}` : ""
  return `Active plan: ${plan.path} — ${plan.done}/${plan.total} done${next}`
}

// Run git in cwd and return trimmed stdout, or "" when git fails.
function git(cwd, args) {
  try {
    const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 3000 })
    return result.status === 0 ? result.stdout.trim() : ""
  } catch {
    return ""
  }
}

// Describe how far HEAD moved past the plan's base commit.
function driftText(cwd, base) {
  // The base comes from a repo file, so accept only a commit-ish shape and never something git could read as an option.
  if (!/^[0-9a-f]{4,40}$/i.test(base)) return "base unknown"
  const count = git(cwd, ["rev-list", "--count", `${base}..HEAD`])
  return count === "" ? "base unknown" : `${count} commit(s) since ${base}`
}

// Render the CLI overview: active plans in detail, other plans compact, done plans on one line.
function renderOverview(cwd, plans) {
  if (plans.length === 0) return noPlansText(cwd)
  // Rank active plans before all others.
  const rank = (plan) => (plan.status === "active" ? 0 : 1)
  const lines = []
  // Stable sort keeps newest-first order inside each rank.
  const ordered = [...plans].sort((a, b) => rank(a) - rank(b))
  for (const plan of ordered) {
    const counts = `${plan.done}/${plan.total} done`
    if (plan.status === "done") {
      lines.push(`${plan.path} [done] ${counts}`)
      continue
    }
    const lastGate = plan.gates[plan.gates.length - 1]
    lines.push(`${plan.path} [${plan.status}] ${counts}`)
    lines.push(`  next: ${plan.nextItem ? clip(plan.nextItem) : "none open"}`)
    lines.push(`  last gate: ${lastGate ? `${lastGate.gate} ${lastGate.result} (${lastGate.by || "?"}, ${lastGate.diff || "?"})` : "none recorded"}`)
    lines.push(`  drift: ${driftText(cwd, plan.base)}`)
  }
  return lines.join("\n")
}

// CLI entry: print the overview for the given directory (default: current).
function main() {
  const cwd = path.resolve(process.argv[2] || process.cwd())
  console.log(renderOverview(cwd, listPlans(cwd)))
}

if (require.main === module) main()

module.exports = { parsePlan, listPlans, readPlanGlobs, activePlanLine, renderOverview }
