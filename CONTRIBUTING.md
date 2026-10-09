# Contributing to agent-skills-kit

Thanks for contributing! This project ships workflow skills and routing support
for coding agents across Claude Code, Codex, GitHub Copilot, OpenCode, and dsh.
It has no build step, no runtime, and no package manager — everything is plain
files and small Node scripts.

[ARCHITECTURE.md](ARCHITECTURE.md) explains how the pieces fit and which files
are generated; [AGENTS.md](AGENTS.md) holds the binding contributor rules. Read
both before a larger change.

## Getting started

```bash
gh repo clone MarkBovee/agent-skills-kit
cd agent-skills-kit
```

Node.js 22 is required only for the validation scripts — the shipped assets
(`skills/`, `core/`, `plugins/`, `scripts/`) run without any install step.

## How to add a skill

1. Create `skills/ask-<name>/SKILL.md`. The directory name is the skill id.
2. Use the required frontmatter:

   ```yaml
   ---
   name: ask-<name>
   description: "Nice name: What the skill does in the third person. Use when <situation>."
   triggers:
     - keyword or phrase
   ---
   ```

   - `name` equals the directory name.
   - `description` is third person, starts with the nice name (for example
     `Develop: Drives normal implementation work ... Use when ...`), says when
     to use the skill ("Use when/for/before/after/to ..."), and stays at or
     under 160 characters. Claude Code selects skills from the description
     alone, so put the key use cases and terms there.
   - `triggers` feed only the ASK router.
3. Keep the skill self-contained: normally 30–90 lines, never over 500. Move
   procedures needed only in rare cases to a one-level `references/` file (a
   file over 100 lines starts with a `## Contents` list). Optional
   `## Use with` and `## Avoid` sections are welcome.
4. No repo-specific paths in generic skills; support files live in the skill's
   own directory.
5. Add the slash command `commands/<name>.md` and at least three behavior
   scenarios (`query` plus `expected_behavior`) in `evals/ask-<name>.json`.
6. Register the skill in `core/router-core.js`: add its name to
   `ASK_SKILL_NAMES` and its routing row to `OVERVIEW_ROWS`. Without that the
   router does not recognize it.
7. Regenerate the platform exports and commit the result:

   ```bash
   node ./scripts/export-platform-skills.js
   ```

   The exports (`.github/skills`, `.github/prompts`,
   `.github/copilot-instructions.md`, `.dsh/skills`, `.opencode/commands`) and
   `rules/claude/` are generated; never hand-edit them. CI fails when they
   drift from the sources.

`node ./scripts/validate-plugin.js` reports what is still out of sync, such as
the skill count in the README, a missing command file, or the decision-tree
rows in `rules/agent-skills-kit.md`.

## Changing code

Read [`rules/coding-standards.md`](rules/coding-standards.md) first and keep the
local style of the file you touch. Every function-like construct needs a short
intent comment above it, and `node ./scripts/check-code-comments.js` enforces
that. `rules/claude/` is generated from `rules/coding-standards.md` by
`node ./scripts/export-claude-coding-standards.js`.

## Validation

CI (`.github/workflows/ci.yml`, job `validate`) is the source of truth, and the
full list of local checks is in
[AGENTS.md](AGENTS.md#required-checks). Before opening a pull request, run at
least:

```bash
node ./scripts/validate-plugin.js                               # plugin/hooks contract, plugin.json version, skill frontmatter
node ./scripts/check-skill-best-practices.js                    # description, size, evals, and reference rules
node ./scripts/check-trigger-overlap.js                         # no conflicting skill triggers
node ./scripts/check-code-comments.js                           # intent comment above every function
node ./scripts/export-platform-skills.js                        # regenerate exports (no diff once the output is committed)
node ./scripts/export-claude-coding-standards.js --check        # rules/claude matches its source
node ./scripts/check-release-readiness.js --require-version-entry  # VERSION/CHANGELOG state
./scripts/check-installed-artifacts.sh                          # installer strings match the repo
```

Keep generated exports committed — CI fails if they drift.

## Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `refactor:`, `test:`.

`main` is protected: work on a branch and open a pull request instead of
pushing to `main`.

## Release flow

- User-visible changes to what ships (`skills/`, `core/`, `plugins/`,
  `hooks/`, `agents/`, `commands/`, `rules/`, `scripts/agent-skills-hook.js`,
  and the installer and update scripts) require a patch bump in `VERSION`, a
  matching entry in `CHANGELOG.md`, **and** the same version in
  `.claude-plugin/plugin.json`, all in the same change.
- Doc-only or internal changes can stay unreleased.
- Do not tag before the change is merged to `main`. When a push to `main`
  changes `VERSION` or `CHANGELOG.md`, `.github/workflows/release.yml` creates
  the annotated `vX.Y.Z` tag and publishes the GitHub Release from the
  changelog entry. Installers resolve the latest stable tag, not `main`.
- Never tag by hand. If a maintainer has to tag manually, use
  `scripts/tag-release.sh` (`scripts/tag-release.ps1` on Windows), which refuses
  to run from a dirty tree, from anything but `main` at `origin/main`, or for a
  tag that already exists. Shared helpers live in `scripts/release-helpers.sh`
  and `scripts/release-helpers.ps1`.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind,
assume good faith, and report unacceptable behavior by opening an issue.
