#!/usr/bin/env node
// Plan status overview: parses the status format of plans/*.md (frontmatter, checkboxes, gate ledger),
// shared by the /status command, the SessionStart hook, and the compaction ledger.

const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const GATE_COLUMNS = ["gate", "result", "by", "diff"]
const MAX_ITEM_LENGTH = 100
const MAX_MISSING_REFS = 10

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

// Collect the Markdown checkbox items at any depth, in document order, each tagged with the nearest `##`/`###` heading above it.
function parseCheckboxes(body) {
  const items = []
  let group = ""
  let fence = ""
  for (const line of body.split("\n")) {
    // Lines inside a ``` or ~~~ code block are examples, never headings or work items.
    const fenceMark = line.match(/^\s*(```|~~~)/)
    if (fenceMark) {
      fence = fence === "" ? fenceMark[1] : fence === fenceMark[1] ? "" : fence
      continue
    }
    if (fence !== "") continue
    const heading = line.match(/^#{2,3}\s+(.*\S)\s*$/)
    if (heading) {
      group = heading[1]
      continue
    }
    const match = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*\S)\s*$/)
    if (match) items.push({ done: match[1] !== " ", text: match[2], group })
  }
  return items
}

// Summarise the items per heading, in first-seen order, as [{ title, done, total, items }]; items above any heading share the title "".
function groupProgress(items) {
  const groups = new Map()
  for (const item of items) {
    const entry = groups.get(item.group) || { title: item.group, done: 0, total: 0, items: [] }
    entry.items.push({ text: item.text, done: item.done })
    entry.total += 1
    if (item.done) entry.done += 1
    groups.set(item.group, entry)
  }
  return [...groups.values()]
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

// Read the plan's first `# ` heading as its title, without a leading "Plan:" label; "" when there is none.
function parseTitle(body) {
  const heading = body.match(/^#\s+(.*\S)\s*$/m)
  return heading ? heading[1].replace(/^plan:\s*/i, "") : ""
}

// Count the ticked items.
function countDone(items) {
  // Keep only ticked items.
  return items.filter((item) => item.done).length
}

// Parse one plan text into its status summary; a plan without frontmatter has status "unknown".
function parsePlan(text) {
  // Editors on Windows may save a BOM, which would hide the frontmatter fence.
  const { meta, body } = splitFrontmatter(String(text).replace(/^﻿/, ""))
  const items = parseCheckboxes(body)
  // The next item is the first one still open.
  const next = items.find((item) => !item.done)
  const doneCount = countDone(items)
  return {
    title: parseTitle(body),
    status: ["active", "done", "parked"].includes(meta.status) ? meta.status : "unknown",
    branch: meta.branch || "",
    base: meta.base || "",
    done: doneCount,
    total: items.length,
    nextItem: next ? next.text : "",
    gates: parseGateLedger(body),
    groups: groupProgress(items),
  }
}

// Read one plan file with its modification time; null when it is not a readable file (a directory, a broken link).
function readPlanFile(plansDir, name) {
  try {
    const filePath = path.join(plansDir, name)
    const stat = fs.statSync(filePath)
    return stat.isFile() ? { name, mtimeMs: stat.mtimeMs, text: fs.readFileSync(filePath, "utf8") } : null
  } catch {
    return null
  }
}

// Find repo paths the plan names in backticks that no longer exist under cwd; at most MAX_MISSING_REFS, in document order.
function missingRefs(cwd, body) {
  const missing = []
  for (const match of body.matchAll(/`([^`\n]+)`/g)) {
    // Drop a trailing :line or :line:col, as in `src/a.js:12`.
    const ref = match[1].trim().replace(/:\d+(:\d+)?$/, "")
    if (!looksLikeRepoPath(ref) || missing.includes(ref)) continue
    if (!fs.existsSync(path.join(cwd, ref))) missing.push(ref)
    if (missing.length >= MAX_MISSING_REFS) break
  }
  return missing
}

// Accept only relative repo paths: a directory part plus a file extension or a trailing slash (`scripts/a.js`, `hooks/`).
// Bare names (`a.js`), code (`tool.call`, `try/finally`), home, placeholders, globs, variables, and URLs never count.
function looksLikeRepoPath(ref) {
  if (/[\s~<>*$|{}()"'@]/.test(ref) || ref.startsWith("/") || ref.includes("://")) return false
  return /^[\w.][\w.\-]*(\/[\w.\-]+)*\/([\w\-][\w.\-]*\.[a-z][a-z0-9]{0,4})?$/i.test(ref)
}

// List the plans in <cwd>/plans/*.md with their parsed status, newest first; never reads outside that folder.
function listPlans(cwd) {
  const plansDir = path.join(cwd, "plans")
  let names
  try {
    names = fs.readdirSync(plansDir)
  } catch {
    return []
  }
  return names
    // Only Markdown files are plans.
    .filter((name) => name.endsWith(".md"))
    // An unreadable entry drops out alone instead of emptying the list.
    .map((name) => readPlanFile(plansDir, name))
    // Keep only the files that could be read.
    .filter(Boolean)
    // Newest first.
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    // Parse each plan, keep its repo-relative path, and list the paths it names that are gone.
    .map(({ name, text }) => ({ path: `plans/${name}`, ...parsePlan(text), missingRefs: missingRefs(cwd, splitFrontmatter(text).body) }))
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
  if (plans.length === 0) return "No plans found in plans/."
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
    if (plan.missingRefs && plan.missingRefs.length > 0) lines.push(`  missing refs: ${plan.missingRefs.join(", ")}`)
  }
  return lines.join("\n")
}

// Build the machine-readable overview: every plan with its parsed status, raw next item, and drift text.
function renderJson(cwd, plans) {
  // Drift needs git in cwd, so it is computed here rather than in the pure parser.
  return JSON.stringify({ plans: plans.map((plan) => ({ ...plan, drift: driftText(cwd, plan.base) })) })
}

// Split CLI arguments into flags and the optional directory: `plan-status.js [--json] [cwd]`.
function parseArgs(argv) {
  const json = argv.includes("--json")
  // The first argument that is not a flag is the directory, wherever the flag sits.
  const cwdArg = argv.find((arg) => !arg.startsWith("--"))
  return { json, cwd: path.resolve(cwdArg || process.cwd()) }
}

// CLI entry: print the overview for the given directory (default: current), as text or with --json as JSON.
function main() {
  const { json, cwd } = parseArgs(process.argv.slice(2))
  const plans = listPlans(cwd)
  console.log(json ? renderJson(cwd, plans) : renderOverview(cwd, plans))
}

if (require.main === module) main()

module.exports = { parsePlan, listPlans, activePlanLine, renderOverview, renderJson, parseArgs }
