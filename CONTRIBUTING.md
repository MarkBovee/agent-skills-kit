# Contributing to agent-skills-kit

Thanks for contributing! This project ships workflow skills and routing support
for coding agents across OpenCode, GitHub Copilot, Claude Code, and dsh. It has
no build step, no runtime, and no package manager — everything is plain files
and small Node scripts.

## Getting started

```bash
gh repo clone MarkBovee/agent-skills-kit
cd agent-skills-kit
```

Node.js 22 is required only for the validation scripts — the shipped assets
(`skills/`, `core/`, `plugins/`, `scripts/`) run without any install step.

## How to add a skill

1. Create `skills/<name>/SKILL.md`.
2. Use the required frontmatter:

   ```yaml
   ---
   name: skill-name
   description: One accurate sentence describing when to use the skill — say when, not how.
   triggers:
     - keyword or phrase
   ---
   ```

3. Keep the skill self-contained and 30–90 lines: one-line purpose, numbered
   pattern/flow, optional `## Use with` cross-references and `## Avoid`
   anti-patterns. Name workflow skills `ask-<topic>` (e.g. `ask-develop`).
4. No repo-specific paths in generic skills; support files live in the skill's
   own directory.
5. Regenerate the platform exports and commit the result:

   ```bash
   node ./scripts/export-platform-skills.js
   git diff --exit-code -- .github/skills/*/SKILL.md .claude/skills/*/SKILL.md .dsh/skills/*/SKILL.md
   ```

## Validation

Before opening a pull request, run all four checks locally:

```bash
node ./scripts/validate-plugin.js          # plugin/hooks contract + skill frontmatter
node ./scripts/check-trigger-overlap.js    # no conflicting skill triggers
node ./scripts/check-release-readiness.js  # VERSION/CHANGELOG state
node ./scripts/export-platform-skills.js   # regenerate exports (must produce no diff)
```

The CI workflow (`validate` check) runs the same steps on every push and pull
request. Keep generated exports and `CLAUDE.md`/`.github/copilot-instructions.md`
committed — CI fails if they drift.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `refactor:`, `test:`.

## Release flow

- User-visible fixes to shipped assets (`skills/`, `core/`, `plugins/`,
  `scripts/`) require a patch bump in `VERSION` **and** a matching entry in
  `CHANGELOG.md` in the same change.
- Doc-only or internal changes can stay unreleased.
- Releases are tagged `vX.Y.Z`. Use the helpers instead of tagging by hand:

  ```bash
  bash ./scripts/tag-release.sh --dry-run   # validate release state
  bash ./scripts/tag-release.sh --push      # create annotated tag + push
  ```

  PowerShell equivalents: `.\scripts\tag-release.ps1 -DryRun` /
  `.\scripts\tag-release.ps1 -Push`. Shared helpers live in
  `scripts/release-helpers.sh` / `scripts/release-helpers.ps1`.
- CI publishes a GitHub Release from the changelog entry when `VERSION` or
  `CHANGELOG.md` changes on `main`. Installers resolve the latest stable tag,
  not `main`.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind,
assume good faith, and report unacceptable behavior by opening an issue.

## Skill contribution checklist

When contributing a new skill or revising an existing one, verify the following:

- Frontmatter `name`, `description`, and `triggers` are complete and use kebab-case
- Body is 30–90 lines excluding frontmatter
- No private project names, model names, or provider names in generic skills
- No Dutch body prose (trigger words are deliberately multilingual and stay untouched)
- No tmp-pagenumber or /tmp paths in the skill body
- Skill passes `validate-plugin.js` (frontmatter + rules contract)
- Skill passes `check-trigger-overlap.js` (no duplicate triggers)
- Skill passes `check-router-nudges.js` (decision tree intact)
- Skill passes `check-dsh-plugin.js` (dependency-free, config defaults)
- exports regenerated via `node ./scripts/export-platform-skills.js` in an authorized worktree without hand-edits
- No repo-specific path recipes in the skill body (support files live in the skill's own directory)
