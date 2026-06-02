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
6. Filter out items the user has already seen or installed in this project
7. Present a top-N proposal grouped by type
8. After explicit approval, copy the selected item into the active project at `.agents/skills/`, `.agents/instructions/`, or `.agents/hooks/`
9. Record each decision (installed or dismissed) in the per-project state file so the same suggestions never repeat
10. Report what was installed and where

## Helpers

- `core/community-skills.js` exposes the full helper surface: `detectProjectStack`, `loadIndex`, `saveIndex`, `isIndexStale`, `fetchIndex`, `rankCandidates`, `formatProposal`, `installItem`, `targetPathForItem`, `isVSCodeOnly`, plus the per-project state helpers `loadFinderState`, `saveFinderState`, `filterSeenCandidates`, `recordFinderDecision`, `setFinderOptOut`, `createEmptyFinderState`
- `scripts/fetch-community-skills-index.js` is the standalone cache refresh script; supports `--force`, `--with-descriptions`, `--description-limit N`

## Workflow

1. **Inspect the project.** Run `detectProjectStack` against the active working directory with `maxDepth: 3`. Confirm the detected languages and tooling look right before proceeding.
2. **Load the per-project state.** Call `loadFinderState(projectRoot)`. The state file lives at `.agents/.nebu-skill-finder-state.json`. If `state.opted_out` is true, exit immediately without suggesting.
3. **Load the index.** Call `loadIndex()`. If absent or older than 7 days, call `fetchIndex()` (or run `node ./scripts/fetch-community-skills-index.js --force`) and `saveIndex()`.
4. **Match candidates.** Call `rankCandidates(items, stack, { limit: 10, minScore: 0.05 })`. The minScore filter drops items with no real keyword overlap.
5. **Filter VS Code-only items.** `isVSCodeOnly(item)` is applied inside `rankCandidates` by default. Surface any dropped VS Code-only candidates separately so the user knows they exist but were intentionally skipped.
6. **Filter already-seen items.** Call `filterSeenCandidates(matches, state)`. Items already in `state.installed` or `state.dismissed` are removed so they are not proposed again.
7. **Present the proposal.** Render with `formatProposal(remainingMatches, { limit: 10 })`. Group by type: `skill`, `instruction`, `hook`. If the remaining list is empty, exit with a one-line "no new candidates" message.
8. **Get explicit approval.** Never install without the user saying yes. Show the proposed target path for each item.
9. **Install.** For each approved item, call `installItem(item, projectRoot)`. This writes to:
   - `.agents/skills/<name>/SKILL.md` for `type: skill`
   - `.agents/instructions/<name>.instructions.md` for `type: instruction`
   - `.agents/hooks/<name>/<file>` for `type: hook`
10. **Record decisions.** For every item the user reacted to, call `recordFinderDecision(state, { type, name, decision: 'installed' | 'dismissed' })`. Installed and dismissed are mutually exclusive.
11. **Persist the state.** Call `saveFinderState(state, projectRoot)`.
12. **Handle opt-out.** If the user says "do not suggest again for this project", call `setFinderOptOut(state, true)` and save. The next run will exit at step 2. To re-enable later, set the flag back to false or delete the state file.
13. **Report.** Per item: name, type, target path, score, one-line description. Also report which dismissed items were skipped to make the no-repeat behavior visible.

## Hook caveat for `type: hook`

Awesome-copilot hooks are GitHub Copilot Chat events. OpenCode does not run a hook runtime, so hooks are parked in `.agents/hooks/` for archival or for use in a Copilot context. Always tell the user this before installing a hook.

## Source and cache

- Source repo: `github/awesome-copilot` (`main` branch)
- Catalog cache: `core/community-skills-index.json` (tracked, commit-pinned)
- Per-project state: `.agents/.nebu-skill-finder-state.json` (project-local, gitignored by convention; tracks `last_checked`, `installed`, `dismissed`, `opted_out`)
- Catalog refresh triggers: explicit `update-opencode.sh` / `update-copilot.sh` hook, `fetchIndex({ force: true })`, or staleness over 7 days
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
- Hand-editing the cached index; regenerate it via the fetch script
- Running network calls during the proposal step; load the cache first
- Suggesting items in a different scope than `.agents/` without flagging the change
- Treating awesome-copilot items as nebu skills; they are community-contributed and may follow different conventions
- Re-suggesting items the user has already installed or dismissed in this project; the state file is the single source of truth for that
- Forgetting to write the state file back; without it the same proposals will repeat on every run
