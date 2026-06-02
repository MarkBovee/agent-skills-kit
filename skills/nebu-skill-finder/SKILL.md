---
name: nebu-skill-finder
description: Use when starting work in a project and wondering whether better community skills, instructions, or hooks exist for the detected stack. Searches the cached awesome-copilot catalog, ranks candidates against the project's languages and tooling (including IaC, containers, and orchestration), and proposes installs to `.agents/` in the active project.
triggers:
  - find skills
  - skill finder
  - community skills
  - awesome-copilot
  - adopt skill
  - which skills fit
  - missing skill
  - skill for this stack
  - find skill for
  - community skill
---

# Nebu Skill Finder

Surface community skills, instructions, and hooks that fit the active project, and install them into `.agents/` so OpenCode picks them up on the next session.

## When to use

Use when:

- starting work in a new or unfamiliar project
- the active stack (languages, frameworks, IaC, containers) has clear community coverage in `github/awesome-copilot`
- you want to know if a stronger workflow skill exists before inventing one locally

Skip when:

- the active repo is this `nebu-skills` source repo itself
- the project stack is unknown and you only need discovery inside the existing nebu pool (use `nebu-using-nebu-skills` instead)
- the user wants to author a new nebu skill from scratch (use `nebu-writing-nebu-skills`)

## What it does

1. Detect the active project stack — languages, frameworks, and tooling (including IaC, containers, orchestration)
2. Load the cached community-skills index from `core/community-skills-index.json`
3. Refresh the cache when it is older than 7 days or missing
4. Filter out VS Code-only, Copilot-CLI-only, and GitHub-Actions-only items that do not translate to OpenCode
5. Match and rank remaining items against the detected stack using keyword overlap
6. Present a top-N proposal grouped by type
7. After explicit approval, copy the selected item into the active project at `.agents/skills/`, `.agents/instructions/`, or `.agents/hooks/`
8. Report what was installed and where

## Helpers

- `core/community-skills.js` exposes the full helper surface: `detectProjectStack`, `loadIndex`, `saveIndex`, `isIndexStale`, `fetchIndex`, `rankCandidates`, `formatProposal`, `installItem`, `targetPathForItem`, `isVSCodeOnly`
- `scripts/fetch-community-skills-index.js` is the standalone cache refresh script; supports `--force`, `--with-descriptions`, `--description-limit N`

## Workflow

1. **Inspect the project.** Run `detectProjectStack` against the active working directory with `maxDepth: 3`. Confirm the detected languages and tooling look right before proceeding.
2. **Load the index.** Call `loadIndex()`. If absent or older than 7 days, call `fetchIndex()` (or run `node ./scripts/fetch-community-skills-index.js --force`) and `saveIndex()`.
3. **Match candidates.** Call `rankCandidates(items, stack, { limit: 10, minScore: 0.05 })`. The minScore filter drops items with no real keyword overlap.
4. **Filter VS Code-only items.** `isVSCodeOnly(item)` is applied inside `rankCandidates` by default. Surface any dropped VS Code-only candidates separately so the user knows they exist but were intentionally skipped.
5. **Present the proposal.** Render with `formatProposal(matches, { limit: 10 })`. Group by type: `skill`, `instruction`, `hook`.
6. **Get explicit approval.** Never install without the user saying yes. Show the proposed target path for each item.
7. **Install.** For each approved item, call `installItem(item, projectRoot)`. This writes to:
   - `.agents/skills/<name>/SKILL.md` for `type: skill`
   - `.agents/instructions/<name>.instructions.md` for `type: instruction`
   - `.agents/hooks/<name>/<file>` for `type: hook`
8. **Report.** Per item: name, type, target path, score, one-line description.

## Hook caveat for `type: hook`

Awesome-copilot hooks are GitHub Copilot Chat events. OpenCode does not run a hook runtime, so hooks are parked in `.agents/hooks/` for archival or for use in a Copilot context. Always tell the user this before installing a hook.

## Source and cache

- Source repo: `github/awesome-copilot` (`main` branch)
- Cache path: `core/community-skills-index.json` (tracked, commit-pinned)
- Refresh triggers: explicit `update-opencode.sh` / `update-copilot.sh` hook, `fetchIndex({ force: true })`, or staleness over 7 days
- Refresh never runs as a hidden side effect during a normal skill run; it is always explicit

## Use with

- `nebu-kickoff` — offer this skill as an optional step when starting work
- `nebu-skill-improvement` — if the user finds a better community match than what nebu ships
- `nebu-using-nebu-skills` — for discovery inside the nebu pool itself
- `nebu-writing-nebu-skills` — when the right answer is a new nebu skill instead of an adopted one

## Avoid

- Installing items without explicit user approval
- Filtering out stack-relevant items because their score is low; surface them and let the user decide
- Hand-editing the cached index; regenerate it via the fetch script
- Running network calls during the proposal step; load the cache first
- Suggesting items in a different scope than `.agents/` without flagging the change
- Treating awesome-copilot items as nebu skills; they are community-contributed and may follow different conventions
