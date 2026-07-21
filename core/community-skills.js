const fs = require("node:fs/promises")
const path = require("node:path")
const { stripFrontmatter, toSingleLine, unique } = require("./router-core")

const DEFAULT_REPO = "github/awesome-copilot"
const DEFAULT_REF = "main"
const DEFAULT_INDEX_PATH = path.join(__dirname, "community-skills-index.json")
const DEFAULT_FINDER_STATE_RELATIVE = path.join(".agents", ".nebu-skill-finder-state.json")
const DEFAULT_FINDER_STATE_VERSION = 1
const DEFAULT_MAX_AGE_DAYS = 7
const DEFAULT_MAX_DEPTH = 3
const DEFAULT_RAW_FETCH_CONCURRENCY = 6
const DEFAULT_DESCRIPTION_FETCH_LIMIT = 60
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  "out",
  ".venv",
  "venv",
  "vendor",
  ".terraform",
  "cdk.out",
  ".next",
  ".nuxt",
  ".cache",
  ".opencode",
  ".agents",
  ".claude",
  ".github",
])

const VS_CODE_ONLY_SIGNALS = [
  "vscode",
  "vs-code",
  " vs code",
  "copilot cli",
  "github actions",
  "joyride",
  "copilot spaces",
  "copilot chat",
  "vs code extension",
  "gh copilot",
  "github copilot cli",
  "ext install",
]

const STOP_KEYWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "with",
  "without",
  "use",
  "when",
  "this",
  "that",
  "your",
  "you",
  "are",
  "is",
  "be",
  "by",
  "in",
  "on",
  "to",
  "of",
  "as",
  "it",
  "at",
])

// Tokenize a free-form string into lowercase matchable keywords.
function extractKeywords(text) {
  if (!text) return []
  const matches = String(text).toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || []
  return unique(matches.flatMap((word) => word.split("-")).filter((word) => word.length > 1 && !STOP_KEYWORDS.has(word)))
}

// Resolve the cache file path so callers can override the default location.
function resolveIndexPath(overridePath) {
  return overridePath || DEFAULT_INDEX_PATH
}

// Read the cached community-skills index from disk or return null when absent.
async function loadIndex(overridePath) {
  const indexPath = resolveIndexPath(overridePath)
  try {
    const raw = await fs.readFile(indexPath, "utf8")
    return JSON.parse(raw)
  } catch (error) {
    if (error && error.code === "ENOENT") return null
    throw error
  }
}

// Persist the community-skills index to disk as deterministic JSON.
async function saveIndex(data, overridePath) {
  const indexPath = resolveIndexPath(overridePath)
  await fs.mkdir(path.dirname(indexPath), { recursive: true })
  await fs.writeFile(indexPath, `${JSON.stringify(data, null, 2)}\n`, "utf8")
}

// Decide whether the cached index should be refreshed based on its age.
function isIndexStale(index, maxAgeDays = DEFAULT_MAX_AGE_DAYS, now = new Date()) {
  if (!index || !index.fetched_at) return true
  const fetched = new Date(index.fetched_at)
  if (Number.isNaN(fetched.getTime())) return true
  const ageMs = now.getTime() - fetched.getTime()
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000
}

// Fetch a JSON resource with a sane timeout and clear error reporting.
async function fetchJson(url, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "nebu-skill-finder", accept: "application/vnd.github+json" },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Request failed (${response.status} ${response.statusText}) for ${url}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

// Fetch a text resource with the same timeout and error conventions as JSON fetches.
async function fetchText(url, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "nebu-skill-finder", accept: "text/plain" },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Request failed (${response.status} ${response.statusText}) for ${url}`)
    }
    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

// Pull the awesome-copilot git tree and translate it into a flat item list.
async function fetchTree({ repo = DEFAULT_REPO, ref = DEFAULT_REF } = {}) {
  const url = `https://api.github.com/repos/${repo}/git/trees/${ref}?recursive=1`
  const data = await fetchJson(url)
  const tree = Array.isArray(data && data.tree) ? data.tree : []
  return { tree, sha: data && data.sha, ref }
}

// Map a tree entry to a normalized item record, or return null when the path is unsupported.
function treeEntryToItem(entry, repo, ref) {
  if (!entry || entry.type !== "blob") return null
  const filePath = entry.path || ""

  if (filePath.startsWith("skills/") && filePath.endsWith("/SKILL.md")) {
    const name = filePath.slice("skills/".length, -"/SKILL.md".length)
    if (!name || name.includes("/")) return null
    return buildItem({ name, type: "skill", filePath, repo, ref, sha: entry.sha })
  }

  if (filePath.startsWith("instructions/") && filePath.endsWith(".instructions.md")) {
    const name = filePath.slice("instructions/".length, -".instructions.md".length)
    if (!name || name.includes("/")) return null
    return buildItem({ name, type: "instruction", filePath, repo, ref, sha: entry.sha })
  }

  if (filePath.startsWith("hooks/") && (filePath.endsWith("/hooks.json") || filePath.endsWith("/HOOK.md"))) {
    const parts = filePath.split("/")
    if (parts.length < 3) return null
    const name = parts[1]
    if (!name) return null
    return buildItem({ name, type: "hook", filePath, repo, ref, sha: entry.sha })
  }

  return null
}

// Assemble a normalized item record from a tree entry plus repo metadata.
function buildItem({ name, type, filePath, repo, ref, sha }) {
  const slug = name.toLowerCase()
  const descriptionKeywords = extractKeywords(slug.replace(/-/g, " "))
  return {
    name,
    type,
    path: filePath,
    sha: sha || null,
    description: "",
    raw_url: `https://raw.githubusercontent.com/${repo}/${ref}/${filePath}`,
    match_keywords: unique([...descriptionKeywords, ...extractKeywords(slug), slug]),
  }
}

// Map a raw tree into a deduplicated list of awesome-copilot items.
function treeToItems(tree, repo, ref) {
  const items = []
  for (const entry of tree) {
    const item = treeEntryToItem(entry, repo, ref)
    if (item) items.push(item)
  }

  const byKey = new Map()
  for (const item of items) {
    const key = `${item.type}:${item.name}`
    if (!byKey.has(key)) byKey.set(key, item)
  }
  return [...byKey.values()]
}

// Fetch the first lines of a SKILL/INSTRUCTION/HOOK markdown file to extract a description.
async function fetchDescription(rawUrl) {
  try {
    const text = await fetchText(rawUrl, { timeoutMs: 10000 })
    const trimmed = text.trim()
    if (!trimmed) return ""
    return toSingleLine(stripFrontmatter(trimmed), 240)
  } catch {
    return ""
  }
}

// Run a list of async producer functions with bounded concurrency.
async function runWithConcurrency(producers, limit) {
  const results = new Array(producers.length)
  let cursor = 0

  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= producers.length) return
      results[index] = await producers[index]()
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, producers.length)) }, () => worker())
  await Promise.all(workers)
  return results
}

// Refresh the community-skills index, optionally refreshing descriptions too.
async function fetchIndex({
  repo = DEFAULT_REPO,
  ref = DEFAULT_REF,
  refreshDescriptions = false,
  descriptionLimit = DEFAULT_DESCRIPTION_FETCH_LIMIT,
  concurrency = DEFAULT_RAW_FETCH_CONCURRENCY,
} = {}) {
  const { tree, sha } = await fetchTree({ repo, ref })
  const items = treeToItems(tree, repo, ref)

  if (refreshDescriptions && items.length > 0) {
    const limit = Math.min(descriptionLimit, items.length)
    const targets = items.slice(0, limit)
    const producers = targets.map((item) => async () => {
      const description = await fetchDescription(item.raw_url)
      if (description) {
        item.description = description
        item.match_keywords = unique([...item.match_keywords, ...extractKeywords(description)])
      }
    })
    await runWithConcurrency(producers, concurrency)
  }

  return {
    source: repo,
    commit: sha || ref,
    fetched_at: new Date().toISOString(),
    items,
  }
}

// Decide whether an item is too Copilot-CLI or VS Code-specific to recommend in OpenCode.
function isVSCodeOnly(item) {
  const haystack = `${item.name} ${item.description || ""}`.toLowerCase()
  return VS_CODE_ONLY_SIGNALS.some((signal) => haystack.includes(signal))
}

// Check whether a filesystem path is a regular file.
async function isFile(target) {
  try {
    const stat = await fs.stat(target)
    return stat.isFile()
  } catch {
    return false
  }
}

// Check whether a filesystem path is a directory.
async function isDirectory(target) {
  try {
    const stat = await fs.stat(target)
    return stat.isDirectory()
  } catch {
    return false
  }
}

// Read a file as UTF-8 text, returning an empty string when the file is missing.
async function readTextFile(target) {
  try {
    return await fs.readFile(target, "utf8")
  } catch (error) {
    if (error && error.code === "ENOENT") return ""
    throw error
  }
}

// Extract keyword and framework hints from a package.json document.
function parsePackageJson(content) {
  if (!content) return { language: "javascript", frameworks: [], keywords: [] }
  let data
  try {
    data = JSON.parse(content)
  } catch {
    return { language: "javascript", frameworks: [], keywords: [] }
  }
  const deps = { ...(data.dependencies || {}), ...(data.devDependencies || {}) }
  const frameworks = Object.keys(deps)
  const hasTypeScript = Boolean(data.devDependencies && data.devDependencies.typescript) || /\.tsx?$/.test(data.scripts && Object.values(data.scripts).join(" ") || "")
  return {
    language: hasTypeScript ? "typescript" : "javascript",
    frameworks,
    keywords: Object.keys(deps).map((name) => name.toLowerCase()),
  }
}

// Pull framework hints out of a .csproj file using simple XML-ish line matching.
function parseCsproj(content) {
  if (!content) return { language: "csharp", frameworks: [], keywords: [] }
  const packageRefs = [...content.matchAll(/<PackageReference\s+Include="([^"]+)"/g)].map((m) => m[1].toLowerCase())
  const frameworkMatch = content.match(/<TargetFramework>([^<]+)<\/TargetFramework>/)
  const target = frameworkMatch ? frameworkMatch[1].toLowerCase() : ""
  return {
    language: "csharp",
    frameworks: packageRefs,
    keywords: unique([...packageRefs, ...extractKeywords(target), "dotnet", ".net", "csharp", "c#"]),
  }
}

// Pick the language and keyword hints from a requirements.txt document.
function parseRequirementsTxt(content) {
  if (!content) return { language: "python", frameworks: [], keywords: [] }
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"))
  const packages = lines.map((line) => line.split(/[=<>~!;\[]/)[0].trim().toLowerCase()).filter(Boolean)
  return { language: "python", frameworks: packages, keywords: packages }
}

// Pull a few well-known sections from a pyproject.toml file.
function parsePyproject(content) {
  if (!content) return { language: "python", frameworks: [], keywords: [] }
  const deps = []
  const blockRegex = /\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/g
  for (const match of content.matchAll(blockRegex)) {
    for (const dep of match[1].matchAll(/["']([^"']+)["']/g)) {
      deps.push(dep[1].split(/[=<>~!;\[]/)[0].trim().toLowerCase())
    }
  }
  return { language: "python", frameworks: deps, keywords: unique([...deps, "python"]) }
}

// Read a go.mod file to extract Go module dependencies.
function parseGoMod(content) {
  if (!content) return { language: "go", frameworks: [], keywords: [] }
  const requireBlock = content.match(/require\s+\(([\s\S]*?)\)/)
  const inlineRequires = [...content.matchAll(/^\s*([A-Za-z0-9._\-\/]+)\s+v[0-9]/gm)].map((m) => m[1].toLowerCase())
  const blockDeps = requireBlock
    ? [...requireBlock[1].matchAll(/^\s*([A-Za-z0-9._\-\/]+)\s+v[0-9]/gm)].map((m) => m[1].toLowerCase())
    : []
  const packages = unique([...inlineRequires, ...blockDeps])
  return { language: "go", frameworks: packages, keywords: unique([...packages, "go", "golang"]) }
}

// Read a Cargo.toml file and extract dependency names.
function parseCargoToml(content) {
  if (!content) return { language: "rust", frameworks: [], keywords: [] }
  const deps = []
  const sectionRegex = /\[(dependencies|dev-dependencies)\]([\s\S]*?)(?=\[|$)/g
  for (const match of content.matchAll(sectionRegex)) {
    for (const dep of match[2].matchAll(/^([A-Za-z0-9_\-]+)\s*=/gm)) {
      deps.push(dep[1].toLowerCase())
    }
  }
  return { language: "rust", frameworks: deps, keywords: unique([...deps, "rust", "cargo"]) }
}

// Pull Java/Kotlin dependencies from a pom.xml file using simple regex heuristics.
function parsePomXml(content) {
  if (!content) return { language: "java", frameworks: [], keywords: [] }
  const deps = [...content.matchAll(/<artifactId>([^<]+)<\/artifactId>/g)].map((m) => m[1].toLowerCase())
  const isKotlin = /<kotlin\./i.test(content) || /kotlin-stdlib/.test(content)
  return {
    language: isKotlin ? "kotlin" : "java",
    frameworks: deps,
    keywords: unique([...deps, isKotlin ? "kotlin" : "java", "jvm", "maven"]),
  }
}

// Read Gradle dependencies using simple heuristic line matches.
function parseBuildGradle(content) {
  if (!content) return { language: "java", frameworks: [], keywords: [] }
  const deps = [...content.matchAll(/(?:implementation|api|compile)\s*\(?["']([^"':]+)/g)].map((m) => m[1].toLowerCase())
  const isKotlin = /kotlin\(|org\.jetbrains\.kotlin/i.test(content)
  return {
    language: isKotlin ? "kotlin" : "java",
    frameworks: deps,
    keywords: unique([...deps, isKotlin ? "kotlin" : "gradle"]),
  }
}

// Extract gem names from a Ruby Gemfile.
function parseGemfile(content) {
  if (!content) return { language: "ruby", frameworks: [], keywords: [] }
  const gems = [...content.matchAll(/gem\s+["']([^"']+)["']/g)].map((m) => m[1].toLowerCase())
  return { language: "ruby", frameworks: gems, keywords: unique([...gems, "ruby", "rails"]) }
}

// Extract composer require package names from composer.json.
function parseComposerJson(content) {
  if (!content) return { language: "php", frameworks: [], keywords: [] }
  let data
  try {
    data = JSON.parse(content)
  } catch {
    return { language: "php", frameworks: [], keywords: [] }
  }
  const packages = Object.keys({ ...(data.require || {}), ...(data["require-dev"] || {}) })
    .filter((name) => name !== "php")
    .map((name) => name.toLowerCase())
  return { language: "php", frameworks: packages, keywords: unique([...packages, "php", "composer"]) }
}

// Read Pulumi.yaml stack metadata for language and project hints.
function parsePulumiYaml(content) {
  if (!content) return { language: "iac", frameworks: ["pulumi"], keywords: ["pulumi", "iac"] }
  let data
  try {
    data = JSON.parse(content)
  } catch {
    data = {}
  }
  return {
    language: "iac",
    frameworks: ["pulumi"],
    keywords: unique([...(data.runtime ? [String(data.runtime).toLowerCase()] : []), "pulumi", "iac"]),
  }
}

// Pull CDK project hints from cdk.json.
function parseCdkJson(content) {
  if (!content) return { language: "iac", frameworks: ["aws-cdk"], keywords: ["aws-cdk", "iac", "cdk"] }
  let data
  try {
    data = JSON.parse(content)
  } catch {
    data = {}
  }
  return {
    language: "iac",
    frameworks: ["aws-cdk"],
    keywords: unique([
      ...Object.keys(data.context || {}).map((k) => k.toLowerCase()),
      "aws-cdk",
      "cdk",
      "iac",
    ]),
  }
}

// Recognize the IaC, container, and orchestration flavors represented by filenames.
function classifyManifestByName(name) {
  const lower = name.toLowerCase()
  if (lower === "package.json") return { parser: parsePackageJson, kind: "javascript" }
  if (lower.endsWith(".csproj")) return { parser: parseCsproj, kind: "csharp" }
  if (lower === "requirements.txt" || lower === "pipfile") return { parser: parseRequirementsTxt, kind: "python" }
  if (lower === "pyproject.toml") return { parser: parsePyproject, kind: "python" }
  if (lower === "go.mod") return { parser: parseGoMod, kind: "go" }
  if (lower === "cargo.toml") return { parser: parseCargoToml, kind: "rust" }
  if (lower === "pom.xml") return { parser: parsePomXml, kind: "java" }
  if (lower.endsWith("build.gradle") || lower.endsWith("build.gradle.kts") || lower === "settings.gradle" || lower === "settings.gradle.kts") {
    return { parser: parseBuildGradle, kind: "java" }
  }
  if (lower === "gemfile") return { parser: parseGemfile, kind: "ruby" }
  if (lower === "composer.json") return { parser: parseComposerJson, kind: "php" }
  if (lower === "pulumi.yaml" || lower.startsWith("pulumi.")) return { parser: parsePulumiYaml, kind: "iac" }
  if (lower === "cdk.json") return { parser: parseCdkJson, kind: "iac" }
  if (lower.endsWith(".tf") || lower.endsWith(".tfvars") || lower.endsWith(".hcl")) {
    return { parser: null, kind: "terraform" }
  }
  if (lower.endsWith(".bicep") || lower.endsWith(".bicepparam")) {
    return { parser: null, kind: "bicep" }
  }
  if (lower === "template.yaml" || lower === "template.json" || lower === "cloudformation.yaml") {
    return { parser: null, kind: "cloudformation" }
  }
  if (lower === "ansible.cfg" || lower === "playbook.yml" || lower === "playbook.yaml") {
    return { parser: null, kind: "ansible" }
  }
  if (lower === "kustomization.yaml" || lower === "kustomization.yml") {
    return { parser: null, kind: "kubernetes" }
  }
  if (lower === "chart.yaml") {
    return { parser: null, kind: "helm" }
  }
  if (lower === "docker-compose.yml" || lower === "docker-compose.yaml" || lower === "compose.yml" || lower === "compose.yaml") {
    return { parser: null, kind: "docker-compose" }
  }
  if (lower === "vagrantfile") return { parser: null, kind: "vagrant" }
  if (lower.endsWith(".pkr.hcl") || lower.endsWith(".pkr.json")) return { parser: null, kind: "packer" }
  return null
}

// Walk a project tree up to a max depth, returning a flat list of manifest records.
async function walkProject(root, { maxDepth = DEFAULT_MAX_DEPTH, ignore = IGNORED_DIRS } = {}) {
  const manifests = []
  const ignoreSet = new Set(ignore)

  async function visit(dir, depth) {
    if (depth > maxDepth) return
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (ignoreSet.has(entry.name)) continue
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await visit(entryPath, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      const classification = classifyManifestByName(entry.name)
      if (!classification) continue
      manifests.push({
        filePath: entryPath,
        relativePath: path.relative(root, entryPath) || entry.name,
        kind: classification.kind,
        parser: classification.parser,
      })
    }
  }

  await visit(root, 0)
  return manifests
}

// Detect the languages, frameworks, and tooling present in the active project.
async function detectProjectStack(cwd, options = {}) {
  const { maxDepth = DEFAULT_MAX_DEPTH, ignore } = options
  const manifests = await walkProject(cwd, { maxDepth, ignore })
  const stack = {
    languages: new Set(),
    frameworks: new Set(),
    keywords: new Set(),
    manifests: [],
  }

  for (const manifest of manifests) {
    if (!manifest.parser) {
      stack.languages.add(manifest.kind)
      stack.keywords.add(manifest.kind)
      stack.manifests.push({ filePath: manifest.filePath, kind: manifest.kind })
      continue
    }
    const content = await readTextFile(manifest.filePath)
    if (!content) continue
    const parsed = manifest.parser(content)
    if (!parsed) {
      stack.languages.add(manifest.kind)
      stack.keywords.add(manifest.kind)
      stack.manifests.push({ filePath: manifest.filePath, kind: manifest.kind })
      continue
    }
    if (parsed.language) stack.languages.add(parsed.language)
    for (const fw of parsed.frameworks || []) stack.frameworks.add(fw)
    for (const kw of parsed.keywords || []) stack.keywords.add(kw)
    if (parsed.language) stack.keywords.add(parsed.language)
    stack.manifests.push({ filePath: manifest.filePath, kind: parsed.language || manifest.kind })
  }

  return {
    languages: [...stack.languages],
    frameworks: [...stack.frameworks],
    keywords: unique([...stack.keywords, ...stack.languages, ...stack.frameworks]),
    manifests: stack.manifests,
  }
}

// Score one item against the detected project stack.
function scoreItem(item, stackKeywords) {
  if (!item.match_keywords || item.match_keywords.length === 0) return 0
  const stackSet = new Set(stackKeywords)
  let hits = 0
  for (const keyword of item.match_keywords) {
    if (stackSet.has(keyword)) hits += 1
  }
  if (hits === 0) return 0
  return hits / item.match_keywords.length
}

// Match, score, and rank community items against the detected project stack.
function rankCandidates(items, stack, { limit = 10, minScore = 0.05, includeVSCodeOnly = false } = {}) {
  if (!stack || !Array.isArray(stack.keywords) || stack.keywords.length === 0) return []
  const candidates = []
  for (const item of items) {
    if (!includeVSCodeOnly && isVSCodeOnly(item)) continue
    const score = scoreItem(item, stack.keywords)
    if (score < minScore) continue
    candidates.push({ item, score })
  }
  candidates.sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name))
  return candidates.slice(0, limit).map((entry) => ({ ...entry.item, score: entry.score }))
}

// Build a human-readable proposal grouped by item type.
function formatProposal(matches, { limit = 10 } = {}) {
  const top = matches.slice(0, limit)
  const groups = { skill: [], instruction: [], hook: [] }
  for (const match of top) {
    if (!groups[match.type]) groups[match.type] = []
    groups[match.type].push(match)
  }
  const lines = []
  for (const type of ["skill", "instruction", "hook"]) {
    if (!groups[type] || groups[type].length === 0) continue
    lines.push(`### ${type}s`)
    for (const item of groups[type]) {
      const score = typeof item.score === "number" ? ` (score ${item.score.toFixed(2)})` : ""
      const description = item.description ? `: ${item.description}` : ""
      lines.push(`- \`${item.name}\`${score}${description}`)
    }
    lines.push("")
  }
  return lines.join("\n").trim()
}

// Translate an item type into the relative subdirectory under the active project.
function targetSubdirForType(type) {
  if (type === "instruction") return "instructions"
  if (type === "hook") return "hooks"
  return "skills"
}

// Compute the target file path under the active project for an awesome-copilot item.
function targetPathForItem(item, projectRoot) {
  const subdir = targetSubdirForType(item.type)
  if (item.type === "skill") return path.join(projectRoot, ".agents", subdir, item.name, "SKILL.md")
  if (item.type === "instruction") return path.join(projectRoot, ".agents", subdir, `${item.name}.instructions.md`)
  return path.join(projectRoot, ".agents", subdir, item.name, path.basename(item.path))
}

// Copy a remote awesome-copilot item into the active project's .agents/ namespace.
async function installItem(item, projectRoot, { fetchImpl = fetchText, overwrite = false } = {}) {
  const targetPath = targetPathForItem(item, projectRoot)
  if (!overwrite && (await isFile(targetPath))) {
    return { ok: false, targetPath, reason: "exists" }
  }
  const content = await fetchImpl(item.raw_url)
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.writeFile(targetPath, content, "utf8")
  return { ok: true, targetPath }
}

// Resolve the path to the per-project state file that tracks suggestions, decisions, and opt-out.
function resolveFinderStatePath(projectRoot, overridePath) {
  return overridePath || path.join(projectRoot, DEFAULT_FINDER_STATE_RELATIVE)
}

// Build a fresh empty state record with the current schema version.
function createEmptyFinderState() {
  return {
    version: DEFAULT_FINDER_STATE_VERSION,
    last_checked: null,
    installed: {},
    dismissed: {},
    opted_out: false,
  }
}

// Coerce an unversioned or older state record into the current schema shape.
function normalizeFinderState(raw) {
  const state = createEmptyFinderState()
  if (!raw || typeof raw !== "object") return state
  if (Number.isInteger(raw.version)) state.version = raw.version
  if (typeof raw.last_checked === "string") state.last_checked = raw.last_checked
  if (raw.installed && typeof raw.installed === "object") state.installed = mergeNameBuckets(raw.installed)
  if (raw.dismissed && typeof raw.dismissed === "object") state.dismissed = mergeNameBuckets(raw.dismissed)
  state.opted_out = raw.opted_out === true
  return state
}

// Coerce legacy flat arrays or arbitrary per-type buckets into the { type: [name] } shape.
function mergeNameBuckets(value) {
  const out = {}
  if (Array.isArray(value)) {
    if (value.length > 0) out.skill = unique(value.map((entry) => String(entry).trim()).filter(Boolean))
    return out
  }
  if (value && typeof value === "object") {
    for (const [type, names] of Object.entries(value)) {
      if (!Array.isArray(names)) continue
      const cleaned = unique(names.map((entry) => String(entry).trim()).filter(Boolean))
      if (cleaned.length > 0) out[type] = cleaned
    }
  }
  return out
}

// Read the per-project state file or return a fresh empty state when absent.
async function loadFinderState(projectRoot, overridePath) {
  const statePath = resolveFinderStatePath(projectRoot, overridePath)
  try {
    const raw = await fs.readFile(statePath, "utf8")
    return normalizeFinderState(JSON.parse(raw))
  } catch (error) {
    if (error && error.code === "ENOENT") return createEmptyFinderState()
    throw error
  }
}

// Persist the per-project state file with deterministic JSON formatting.
async function saveFinderState(state, projectRoot, overridePath) {
  const statePath = resolveFinderStatePath(projectRoot, overridePath)
  await fs.mkdir(path.dirname(statePath), { recursive: true })
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

// Flatten the { type: [name] } buckets into a single quick-lookup set of `${type}:${name}` keys.
function buildSeenKeySet(buckets) {
  const keys = new Set()
  if (!buckets || typeof buckets !== "object") return keys
  for (const [type, names] of Object.entries(buckets)) {
    if (!Array.isArray(names)) continue
    for (const name of names) keys.add(`${type}:${name}`)
  }
  return keys
}

// Drop candidates the user has already seen (installed or dismissed) from a ranked list.
function filterSeenCandidates(matches, state) {
  if (!Array.isArray(matches) || matches.length === 0) return []
  const seen = new Set([
    ...buildSeenKeySet(state && state.installed),
    ...buildSeenKeySet(state && state.dismissed),
  ])
  return matches.filter((match) => !seen.has(`${match.type}:${match.name}`))
}

// Record one decision against the state without mutating other buckets.
function recordFinderDecision(state, { type, name, decision }) {
  if (!state || !type || !name) return state
  const next = {
    ...state,
    installed: { ...(state.installed || {}) },
    dismissed: { ...(state.dismissed || {}) },
  }
  if (decision === "installed") {
    next.installed[type] = unique([...(next.installed[type] || []), name])
    if (Array.isArray(next.dismissed[type])) {
      next.dismissed[type] = next.dismissed[type].filter((entry) => entry !== name)
    }
  } else if (decision === "dismissed") {
    next.dismissed[type] = unique([...(next.dismissed[type] || []), name])
    if (Array.isArray(next.installed[type])) {
      next.installed[type] = next.installed[type].filter((entry) => entry !== name)
    }
  }
  next.last_checked = new Date().toISOString()
  return next
}

// Flip the project-wide opt-out flag so the skill stops suggesting entirely.
function setFinderOptOut(state, optedOut) {
  const next = { ...(state || createEmptyFinderState()) }
  next.opted_out = optedOut === true
  next.last_checked = new Date().toISOString()
  return next
}

module.exports = {
  DEFAULT_DESCRIPTION_FETCH_LIMIT,
  DEFAULT_FINDER_STATE_RELATIVE,
  DEFAULT_FINDER_STATE_VERSION,
  DEFAULT_MAX_AGE_DAYS,
  DEFAULT_MAX_DEPTH,
  DEFAULT_RAW_FETCH_CONCURRENCY,
  DEFAULT_REPO,
  DEFAULT_REF,
  buildSeenKeySet,
  classifyManifestByName,
  createEmptyFinderState,
  detectProjectStack,
  extractKeywords,
  fetchDescription,
  fetchIndex,
  fetchJson,
  fetchText,
  filterSeenCandidates,
  formatProposal,
  installItem,
  isIndexStale,
  isVSCodeOnly,
  loadFinderState,
  loadIndex,
  mergeNameBuckets,
  normalizeFinderState,
  parseCargoToml,
  parseCdkJson,
  parseComposerJson,
  parseCsproj,
  parseGemfile,
  parseGoMod,
  parsePackageJson,
  parsePomXml,
  parseBuildGradle,
  parsePulumiYaml,
  parsePyproject,
  parseRequirementsTxt,
  rankCandidates,
  recordFinderDecision,
  resolveFinderStatePath,
  runWithConcurrency,
  saveFinderState,
  saveIndex,
  setFinderOptOut,
  targetPathForItem,
  targetSubdirForType,
  toSingleLine,
  treeToItems,
  unique,
  walkProject,
}
