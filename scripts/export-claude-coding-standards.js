#!/usr/bin/env node

// Generate Claude Code path-scoped coding standards from the canonical rules/coding-standards.md.
// Claude Code loads unscoped rules every session and `paths`-scoped rules only when a matching file is read or
// edited, so language sections move to their own files. Other hosts keep the full canonical file.
//
// Usage: export-claude-coding-standards.js [--check | --install [--force]]
//   (no flag)  write rules/claude/*.md
//   --check    fail when rules/claude/*.md differs from what the canonical file generates
//   --install  copy the generated files into ~/.claude/rules (CLAUDE_DIR overrides ~/.claude); never overwrites
//              a differing file without --force

const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")

const REPO_ROOT = path.resolve(__dirname, "..")
const SOURCE_PATH = path.join(REPO_ROOT, "rules", "coding-standards.md")
const OUTPUT_DIR = path.join(REPO_ROOT, "rules", "claude")
const CORE_FILE = "coding-standards.md"

// One entry per language section of the canonical file; `paths` are the globs that load its rule file.
const LANGUAGES = [
  { slug: "csharp", title: ".NET/C#", paths: ["**/*.{cs,csx,csproj,sln,slnx,slnf,props,targets,razor,cshtml}", "**/.editorconfig", "**/Directory.Build.*"] },
  { slug: "javascript-typescript", title: "JavaScript / TypeScript", paths: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"] },
  { slug: "python", title: "Python", paths: ["**/*.{py,pyi,pyw}"] },
  { slug: "go", title: "Go", paths: ["**/*.go"] },
  { slug: "rust", title: "Rust", paths: ["**/*.rs", "**/Cargo.toml"] },
  { slug: "shell", title: "Shell", paths: ["**/*.{sh,bash,zsh,ksh,bats}", "**/.{bashrc,bash_profile,bash_aliases,zshrc,zprofile,profile,envrc}"] },
]

// The core gate no longer names C# call shapes, so the C# file keeps that clause next to its width rule.
const CSHARP_WIDTH_CLAUSE = "preserve fitting method signatures, calls, and fluent expressions on one line."
const CSHARP_WIDTH_CLAUSE_EXTENDED = "preserve fitting method signatures, calls, and fluent expressions on one line; keep a fitting method signature, event-store call, and projection call on one line rather than wrapping them to a generic default width."

const POINTER_ANCHOR = "### All typed languages\n"
const POINTER_TEXT = "\nLanguage-specific rules live in `coding-standards-<language>.md` and load when a matching file is read or edited. Extensionless scripts match no pattern, so read `coding-standards-shell.md` yourself before editing one.\n"
const WIDTH_SENTENCE = " For C#, ASK's default maximum line width is 240 characters; keep a fitting method signature, event-store call, and projection call on one line rather than wrapping them to a generic default width. A repository's explicit `.editorconfig` width overrides this default."
const WIDTH_REPLACEMENT = " A repository's explicit `.editorconfig` width overrides any default; language defaults (for example C#'s 240 characters) live in the language rules file."

// Fail fast when the canonical file no longer has the shape this generator relies on.
function requireIncludes(source, fragment, description) {
  if (!source.includes(fragment)) throw new Error(`rules/coding-standards.md no longer contains ${description}; update scripts/export-claude-coding-standards.js`)
}

// Find the heading line and body of one `###` language section.
function findSection(source, title) {
  const heading = `### ${title}\n`
  const start = source.indexOf(heading)
  if (start === -1) throw new Error(`rules/coding-standards.md has no "### ${title}" section`)
  const next = source.slice(start + heading.length).search(/^#{2,3} /m)
  const end = next === -1 ? source.length : start + heading.length + next
  return { start, end, body: source.slice(start + heading.length, end).trim() }
}

// Build the always-loaded core: the canonical file minus language sections, plus a pointer to them.
function buildCoreFile(source) {
  requireIncludes(source, POINTER_ANCHOR, "the \"All typed languages\" section")
  requireIncludes(source, WIDTH_SENTENCE, "the C# line-width sentence in the style-preservation gate")
  let core = source
  for (const language of LANGUAGES) {
    const { start, end } = findSection(core, language.title)
    core = core.slice(0, start) + core.slice(end)
  }
  core = core.replace(POINTER_ANCHOR, POINTER_ANCHOR + POINTER_TEXT).replace(WIDTH_SENTENCE, WIDTH_REPLACEMENT)
  return `${core.replace(/\n{3,}/g, "\n\n").trimEnd()}\n`
}

// Build one language file whose frontmatter scopes it to matching paths.
function buildLanguageFile(source, language) {
  // The path scope replaces the canonical "Applies to" sentence.
  let body = findSection(source, language.title).body.replace(/^\*\*Applies to:\*\*.*\n\n/, "")
  if (language.slug === "csharp") {
    requireIncludes(body, CSHARP_WIDTH_CLAUSE, "the C# line-width bullet")
    body = body.replace(CSHARP_WIDTH_CLAUSE, CSHARP_WIDTH_CLAUSE_EXTENDED)
  }
  const frontmatter = `---\npaths:\n${language.paths.map(buildPathLine).join("")}---\n\n`
  return `${frontmatter}# Coding Standards: ${language.title}\n\nExtends \`coding-standards.md\`; loads when matching files are read or edited.\n\n${body}\n`
}

// Render one YAML list item for the paths frontmatter.
function buildPathLine(glob) {
  return `  - "${glob}"\n`
}

// Build every generated file as a name -> content map.
function buildFiles(source) {
  const files = new Map([[CORE_FILE, buildCoreFile(source)]])
  for (const language of LANGUAGES) files.set(`coding-standards-${language.slug}.md`, buildLanguageFile(source, language))
  return files
}

// Read a file, returning null when it does not exist.
async function readIfPresent(filePath) {
  try {
    return await fs.readFile(filePath, "utf8")
  } catch (error) {
    if (error.code === "ENOENT") return null
    throw error
  }
}

// Write the generated files into rules/claude, removing stale generated files first.
async function writeOutputs(files) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  for (const entry of await fs.readdir(OUTPUT_DIR)) {
    if (entry.endsWith(".md") && !files.has(entry)) await fs.rm(path.join(OUTPUT_DIR, entry))
  }
  for (const [name, content] of files) await fs.writeFile(path.join(OUTPUT_DIR, name), content, "utf8")
  console.log(`Wrote ${files.size} Claude coding-standards files to rules/claude/.`)
}

// Compare rules/claude with the generated files and report every drifted or stale file.
async function checkOutputs(files) {
  const problems = []
  for (const [name, content] of files) {
    if ((await readIfPresent(path.join(OUTPUT_DIR, name))) !== content) problems.push(`${name} is out of date`)
  }
  // A missing output directory simply means nothing is stale.
  for (const entry of await fs.readdir(OUTPUT_DIR).catch(() => [])) {
    if (entry.endsWith(".md") && !files.has(entry)) problems.push(`${entry} is not generated any more`)
  }
  if (problems.length > 0) {
    console.error(`${problems.join("\n")}\nRun node ./scripts/export-claude-coding-standards.js and commit rules/claude/.`)
    process.exitCode = 1
    return
  }
  console.log("Claude coding-standards files match rules/coding-standards.md.")
}

// Copy the generated files into the user's Claude rules directory; a differing file needs --force.
async function installOutputs(files, force) {
  const rulesDir = path.join(process.env.CLAUDE_DIR || path.join(os.homedir(), ".claude"), "rules")
  await fs.mkdir(rulesDir, { recursive: true })
  for (const [name, content] of files) {
    const target = path.join(rulesDir, name)
    const existing = await readIfPresent(target)
    if (existing === content) {
      console.log(`unchanged  ${target}`)
    } else if (existing === null || force) {
      await fs.writeFile(target, content, "utf8")
      console.log(`${existing === null ? "created  " : "replaced "}  ${target}`)
    } else {
      console.log(`skipped    ${target} (differs; rerun with --force to replace it)`)
      process.exitCode = 1
    }
  }
}

// Dispatch the requested mode.
async function main() {
  const args = new Set(process.argv.slice(2))
  const files = buildFiles(await fs.readFile(SOURCE_PATH, "utf8"))
  if (args.has("--check")) return checkOutputs(files)
  if (args.has("--install")) return installOutputs(files, args.has("--force"))
  return writeOutputs(files)
}

if (require.main === module) {
  // Report generator failures as a plain message and a failing exit code.
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = { buildFiles }
