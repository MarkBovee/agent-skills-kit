#!/usr/bin/env node

// Refresh the cached awesome-copilot index used by the nebu-skill-finder workflow.

const path = require("node:path")
const {
  DEFAULT_DESCRIPTION_FETCH_LIMIT,
  DEFAULT_REPO,
  DEFAULT_REF,
  fetchIndex,
  loadIndex,
  saveIndex,
} = require("../core/community-skills")

const REPO_ROOT = path.resolve(__dirname, "..")
const INDEX_PATH = path.join(REPO_ROOT, "core", "community-skills-index.json")

// Decide whether the script should refresh descriptions alongside the tree listing.
function shouldRefreshDescriptions(args) {
  if (args.includes("--with-descriptions")) return true
  if (args.includes("--descriptions")) return true
  return false
}

// Read a flag argument and return the integer value that follows it, or null when absent.
function readIntFlag(args, name) {
  const index = args.indexOf(name)
  if (index === -1) return null
  const value = args[index + 1]
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

// Refresh the community-skills cache and print a one-line summary.
async function run() {
  const args = process.argv.slice(2)
  const force = args.includes("--force")
  const refreshDescriptions = shouldRefreshDescriptions(args)
  const descriptionLimit = readIntFlag(args, "--description-limit") || DEFAULT_DESCRIPTION_FETCH_LIMIT

  if (!force) {
    const existing = await loadIndex(INDEX_PATH)
    if (existing) {
      console.log(`Existing index has ${existing.items.length} items, last fetched ${existing.fetched_at}.`)
    } else {
      console.log("No existing community-skills index found; fetching from scratch.")
    }
  }

  const data = await fetchIndex({
    repo: DEFAULT_REPO,
    ref: DEFAULT_REF,
    refreshDescriptions,
    descriptionLimit,
  })
  await saveIndex(data, INDEX_PATH)

  console.log(
    `Saved ${data.items.length} items from ${data.source}@${data.commit} to ${path.relative(REPO_ROOT, INDEX_PATH)}.` +
      (refreshDescriptions ? ` Refreshed descriptions for up to ${descriptionLimit} items.` : ""),
  )
}

run().catch((error) => {
  console.error(error && error.message ? error.message : error)
  process.exitCode = 1
})
