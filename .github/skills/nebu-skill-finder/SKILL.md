---
name: "nebu-skill-finder"
description: "Use when starting work in a project and wondering whether better community skills, instructions, or hooks exist for the detected stack. Searches the cached awesome-copilot catalog, ranks candidates against the project's languages and tooling (including IaC, containers, and orchestration), and proposes installs to `.agents/` in the active project. Common triggers: find skills, skill finder, community skills, awesome-copilot, adopt skill, which skills fit, missing skill, skill for this stack, find skill for, community skill."
---
# Nebu Skill Finder

Surface community skills, instructions, and hooks that fit the active project, and install them into `.agents/` so compatible hosts can pick them up on the next session.

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

1. Decide whether the current host can use local skill files and run local Node helpers from this skill directory
2. Detect the active project stack — languages, frameworks, and tooling (including IaC, containers, orchestration)
3. Load the cached community-skills index from `./runtime/community-skills-index.json`
4. Refresh the cache when it is older than 7 days or missing
5. Filter out VS Code-only, Copilot-CLI-only, and GitHub-Actions-only items that do not translate to OpenCode
6. Match and rank remaining items against the detected stack using keyword overlap
7. Filter out items the user has already seen or installed in this project
8. Present a top-N proposal grouped by type
9. After explicit approval, copy the selected item into the active project at `.agents/skills/`, `.agents/instructions/`, or `.agents/hooks/`
10. Record each decision (installed or dismissed) in the per-project state file so the same suggestions never repeat
11. Report what was installed and where

## Modes

### Execute mode

Use execute mode only when all minimum capabilities are present:

- the host can read files from this skill's `./runtime/` directory
- the host can run the bundled local Node helpers or refresh script directly
- the host can inspect the active project and write approved installs into `.agents/`

### Proposal mode

Use proposal mode when the host cannot safely execute local helpers. In proposal mode, inspect the active project, explain that the bundled runtime is unavailable from this host, and stop after a ranked recommendation list plus explicit next commands the user can run in a compatible environment.

## Host capability rubric

| Host | Default stance | Execute-mode gate |
| --- | --- | --- |
| OpenCode | Usually capable in a normal local session, but still verify | Use execute mode only when you can read `./runtime/`, run the local Node helper or refresh script, and write approved files into `.agents/` in the active project |
| GitHub Copilot | Capability depends on the active Copilot surface; do not assume from the product name alone | Use execute mode only when this session exposes local file reads, local shell or Node execution, and workspace writes; otherwise switch to proposal mode |
| Claude Code | Capability depends on the active Claude surface; do not assume from the product name alone | Use execute mode only when this session exposes local file reads, local shell or Node execution, and workspace writes; otherwise switch to proposal mode |
| Unknown or other host | Treat as untrusted by default | Stay in proposal mode unless all three minimum capabilities are explicitly available |

## Helpers

- `./runtime/community-skills.js` exposes the full helper surface: `detectProjectStack`, `loadIndex`, `saveIndex`, `isIndexStale`, `fetchIndex`, `rankCandidates`, `formatProposal`, `installItem`, `targetPathForItem`, `isVSCodeOnly`, plus the per-project state helpers `loadFinderState`, `saveFinderState`, `filterSeenCandidates`, `recordFinderDecision`, `setFinderOptOut`, `createEmptyFinderState`
- `./runtime/fetch-community-skills-index.js` is the standalone cache refresh script; supports `--force`, `--with-descriptions`, `--description-limit N`
- `./runtime/community-skills-index.json` is the tracked cache snapshot that ships with the skill

## Workflow

1. **Decide the mode first.** Check all three minimum capabilities first: read `./runtime/`, run the local Node helper path, and write approved files into `.agents/`. If any capability is missing or uncertain, switch to proposal mode immediately and say which capability blocked execute mode.
2. **Inspect the project.** In execute mode, run `detectProjectStack` from `./runtime/community-skills.js` against the active working directory with `maxDepth: 3`. Confirm the detected languages and tooling look right before proceeding.
3. **Load the per-project state.** Call `loadFinderState(projectRoot)`. The state file lives at `.agents/.nebu-skill-finder-state.json`. If `state.opted_out` is true, exit immediately without suggesting.
4. **Load the index.** Call `loadIndex()` from the bundled helper. If absent or older than 7 days, call `fetchIndex()` and `saveIndex()` directly, or run `node ./runtime/fetch-community-skills-index.js --force` when a standalone refresh command is easier in the current host.
5. **Match candidates.** Call `rankCandidates(items, stack, { limit: 10, minScore: 0.05 })`. The minScore filter drops items with no real keyword overlap.
6. **Filter VS Code-only items.** `isVSCodeOnly(item)` is applied inside `rankCandidates` by default. Surface any dropped VS Code-only candidates separately so the user knows they exist but were intentionally skipped.
7. **Filter already-seen items.** Call `filterSeenCandidates(matches, state)`. Items already in `state.installed` or `state.dismissed` are removed so they are not proposed again.
8. **Present the proposal.** Render with `formatProposal(remainingMatches, { limit: 10 })`. Group by type: `skill`, `instruction`, `hook`. If the remaining list is empty, exit with a one-line "no new candidates" message.
9. **Get explicit approval.** Never install without the user saying yes. Show the proposed target path for each item.
10. **Install.** For each approved item, call `installItem(item, projectRoot)`. This writes to:
   - `.agents/skills/<name>/SKILL.md` for `type: skill`
   - `.agents/instructions/<name>.instructions.md` for `type: instruction`
   - `.agents/hooks/<name>/<file>` for `type: hook`
11. **Record decisions.** For every item the user reacted to, call `recordFinderDecision(state, { type, name, decision: 'installed' | 'dismissed' })`. Installed and dismissed are mutually exclusive.
12. **Persist the state.** Call `saveFinderState(state, projectRoot)`.
13. **Handle opt-out.** If the user says "do not suggest again for this project", call `setFinderOptOut(state, true)` and save. The next run will exit at step 3. To re-enable later, set the flag back to false or delete the state file.
14. **Report.** Per item: name, type, target path, score, one-line description. Also report which dismissed items were skipped to make the no-repeat behavior visible.

## Hook caveat for `type: hook`

Awesome-copilot hooks are GitHub Copilot Chat events. OpenCode does not run a hook runtime, so hooks are parked in `.agents/hooks/` for archival or for use in a Copilot context. Always tell the user this before installing a hook.

## Source and cache

- Source repo: `github/awesome-copilot` (`main` branch)
- Bundled helper: `./runtime/community-skills.js` (tracked, self-contained runtime)
- Bundled refresh script: `./runtime/fetch-community-skills-index.js`
- Catalog cache: `./runtime/community-skills-index.json` (tracked, commit-pinned)
- Per-project state: `.agents/.nebu-skill-finder-state.json` (project-local, gitignored by convention; tracks `last_checked`, `installed`, `dismissed`, `opted_out`)
- Catalog refresh triggers: the bundled refresh script, direct `fetchIndex({ force: true })`, reinstalling an updated release, or staleness over 7 days
- State refresh triggers: every decision (install or dismiss) writes back; the next run reads it
- No network calls happen during the proposal step; the catalog cache is loaded first

## Use with

- `nebu-kickoff` — offer this skill as an optional step when starting work
- `nebu-skill-improvement` — if the user finds a better community match than what nebu ships
- `nebu-using-nebu-skills` — for discovery inside the nebu pool itself
- `nebu-writing-nebu-skills` — when the right answer is a new nebu skill instead of an adopted one

## Avoid

- Installing items without explicit user approval
- Filtering out stack-relevant items because their score is low; surface them and let the user decide
- Hand-editing the bundled runtime files; regenerate them via `node ./scripts/export-platform-skills.js`
- Running network calls during the proposal step; load the cache first
- Suggesting items in a different scope than `.agents/` without flagging the change
- Treating awesome-copilot items as nebu skills; they are community-contributed and may follow different conventions
- Re-suggesting items the user has already installed or dismissed in this project; the state file is the single source of truth for that
- Forgetting to write the state file back; without it the same proposals will repeat on every run
