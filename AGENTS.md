# agent-skills-kit Agent Instructions

## Project

Workflow skill pack with Claude Code as the primary harness; it also supports OpenCode, Codex, GitHub Copilot, and dsh. Ships workflow skills, router plugins, generated exports, and installers. No build step or package manager.

## Layout

How the pieces fit, which files are generated, and contributor gotchas: `ARCHITECTURE.md` (read it first).

- `skills/<name>/SKILL.md`: source skill.
- `commands/<name>.md`: source slash command.
- `core/router-core.js`: shared routing, lifecycle, state, and frontmatter helpers.
- `plugins/`: OpenCode and dsh routers plus TUI/widget code.
- `scripts/`: install, update, export, and validation scripts.
- `rules/`: shared coding and workflow guidance. `rules/claude/` is generated from `rules/coding-standards.md` by `scripts/export-claude-coding-standards.js`; never hand-edit it.
- `.github/`, `.dsh/`, `.opencode/`: generated exports; never hand-edit.
- `.claude-plugin/`, `hooks/`, `agents/`: Claude Code plugin manifest, marketplace, hooks, and read-only subagents (hand-maintained).

## Coding standards

Read `rules/coding-standards.md` before code edits. Every function-like construct needs a short intent comment. Preserve local style. Prefer small focused functions, DRY/SOLID, explicit data shapes, meaningful names, guard clauses, and pure helpers. Run source-comment checks when available.

## Skills

Every `skills/*/SKILL.md` needs frontmatter: `name` equal to its directory (`ask-<name>`), a third-person `description` that starts with the nice name and says what the skill does and when to use it (`Develop: Drives normal implementation work ... Use when ...`), and `triggers`. The router and exports keep using the bare name; `ask-` is the native id. Router prompts, pending actions, and commands load a skill by reading `~/.agents/skills/ask-<name>/SKILL.md`; the native id only serves Claude Code's own skill listing, and leaf skills are never invoked through a native Skill tool. Keep skills self-contained (no links into other skills), normally 30–90 lines and never over 500. Reference files stay one level deep from `SKILL.md`, and any over 100 lines start with a `## Contents` list. Use forward slashes in paths. Use `ask-` names for workflow/meta skills. Keep cross-references bidirectional where useful. Keep generic skills free of repository-specific paths.

`triggers` feed only the ASK router; Claude Code selects skills from `description` alone, so the key use cases and terms belong in the description, which must stay at or under 160 characters to survive the shared listing budget. Keep each `SKILL.md` body compact and move procedures needed only in rare cases (for example release gates) to a one-level `references/` file. Each skill has at least three behavior scenarios in `evals/ask-<name>.json` (`query` plus `expected_behavior`); update them with the skill. Measure activation changes with `node ./scripts/eval-skill-activation.js` and behavior with `node ./scripts/eval-skill-behavior.js [--model haiku|sonnet|opus] [--baseline]` (both spend tokens; not part of CI).

## Router

`plugins/agent-skills-router/` audits the first OpenCode prompt, then emits compact live status. Its TUI reads router-core state; it never computes routing. Advisory matches suggest one skill; agents load skills explicitly. Fresh sessions stay neutral. Route matches remain hollow until loaded. Pending obligations are `code-review` and `design-review`.

Decision-tree rows come from `routingHintLines()`; never duplicate them manually. OpenCode server is auto-discovered; TUI still needs `tui.json` entry. Installers must not register the server twice. Keep plugin state session-scoped.

### dsh

`plugins/agent-skills-router.dsh.mjs` is dependency-free and installed as an ask-kit preset row. It derives routing rows from `routingHintLines()`, registers one command per skill, tracks state through events, and gates tools only when configured. Validate with `node ./scripts/check-dsh-plugin.js`.

## Workflow mandate

The canonical mandate is `rules/workflow.md`. Installers copy it into each host's rules, so it is not repeated here. In short: select the most specific workflow skill before substantial work, delegate independent research, validation, review, and audit, and never declare release readiness without independent evidence.

## Evidence reuse

Do not repeat intake, plan-check, review, or audit for a diff those gates already passed. Gate evidence is bound to the diff it examined; cite it instead of redoing it.

- Record each completed gate once in the PR body or plan: gate, result, who ran it (independent or not), and the diff reference (commit SHA or diff identity).
- Evidence stays valid for an identical diff. Updating the base branch, merging, or tagging does not invalidate it when the diff content against the base is unchanged; compare before assuming otherwise.
- Classify any follow-up change before choosing gates. Mechanical deltas (version bump, changelog, regenerated exports, comment or doc wording) need validation only. Behavioral deltas need focused validation plus one delta review and one delta audit limited to the changed paths, at `standard` tier; escalate to `deep` only for an open cross-cutting invariant or counter-evidence.
- Reused evidence must itself have been independent; self-review never becomes release evidence by being cited later. Never reuse evidence that is stale or mismatched against the current diff.
- State in the handoff which evidence was reused and which was produced fresh.

## Releases

User-visible shipped changes need a patch bump in `VERSION`, matching `CHANGELOG.md` entry, and matching `.claude-plugin/plugin.json` version. Stable releases use `vX.Y.Z` tags. Never tag before merge to `main`; release workflow publishes from `main`.

Install/update scripts must keep `.sh` and `.ps1` behavior aligned and idempotent. Bootstrap/update resolve latest stable tag. Do not push directly to protected `main`.

## Required checks

```bash
node -e "import('./plugins/agent-skills-router/server.mjs')"
node ./scripts/export-platform-skills.js
for check in router-nudges workflow-lifecycle dsh-plugin widget-live-state panel-widget opencode-v2-plugin research-workflow tier-vocabulary skill-best-practices trigger-overlap claude-code test-policy tmp-usage code-comments evidence-aware-communication model-agnostic-guidance; do node "./scripts/check-$check.js"; done
node ./scripts/export-claude-coding-standards.js --check
node ./scripts/validate-plugin.js
node ./scripts/check-release-readiness.js --require-version-entry
./scripts/check-installed-artifacts.sh
```

CI (`.github/workflows/ci.yml`) is the source of truth for this list; when a check is added there, add it here.

Before handoff: inspect complete tree, run `git diff --check`, verify generated exports, installer parity, branch, remote, tag, and clean worktree. Run `session-review` when work exposes reusable workflow gaps.
