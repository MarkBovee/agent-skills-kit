# agent-skills-kit Agent Instructions

## Project

Portable skill pack for OpenCode, Codex, GitHub Copilot, Claude Code, and dsh. Ships workflow skills, router plugins, generated exports, and installers. No build step or package manager.

## Layout

- `skills/<name>/SKILL.md`: source skill.
- `commands/<name>.md`: source slash command.
- `core/router-core.js`: shared routing, lifecycle, state, and frontmatter helpers.
- `plugins/`: OpenCode and dsh routers plus TUI/widget code.
- `scripts/`: install, update, export, and validation scripts.
- `rules/`: shared coding and workflow guidance.
- `.github/`, `.dsh/`, `.opencode/`: generated exports; never hand-edit.
- `.claude-plugin/`, `hooks/`, `agents/`: Claude Code plugin manifest, marketplace, hooks, and read-only subagents (hand-maintained).

## Coding standards

Read `rules/coding-standards.md` before code edits. Every function-like construct needs a short intent comment. Preserve local style. Prefer small focused functions, DRY/SOLID, explicit data shapes, meaningful names, guard clauses, and pure helpers. Run source-comment checks when available.

## Skills

Every `skills/*/SKILL.md` needs frontmatter: `name` equal to its directory (`ask-<name>`), a one-sentence `description` that starts with the nice name (`Develop: ...`), and `triggers`. The router and exports keep using the bare name; `ask-` is the native id. Keep skills self-contained, normally 30–90 lines. Use `ask-` names for workflow/meta skills. Keep cross-references bidirectional where useful. Keep generic skills free of repository-specific paths.

## Router

`plugins/agent-skills-router/` audits the first OpenCode prompt, then emits compact live status. Its TUI reads router-core state; it never computes routing. Advisory matches suggest one skill; agents load skills explicitly. Fresh sessions stay neutral. Route matches remain hollow until loaded. Pending obligations are `code-review` and `design-review`.

Decision-tree rows come from `routingHintLines()`; never duplicate them manually. OpenCode server is auto-discovered; TUI still needs `tui.json` entry. Installers must not register the server twice. Keep plugin state session-scoped.

### dsh

`plugins/agent-skills-router.dsh.mjs` is dependency-free and installed as an ask-kit preset row. It derives routing rows from `routingHintLines()`, registers one command per skill, tracks state through events, and gates tools only when configured. Validate with `node ./scripts/check-dsh-plugin.js`.

## Workflow mandate

<!-- agent-skills-kit:opencode -->

# ASK Workflow Mandate

- Load most specific workflow skill before substantial work (OpenCode loads by its `ask-`-prefixed id: `skill(id: 'ask-<name>')`; dsh by bare name); router matches advise only.
- Large, exhaustive, compatibility-sensitive, or release-sensitive work: load `intake`, create plan artifact, classify risk, set must/should/could, complete plan-check.
- Delegate independent research, validation, review, and audit. Never self-declare release readiness; require independent evidence.
- Release-sensitive work needs independent validation, review, audit, and release-gate evidence.

<!-- /agent-skills-kit:opencode -->

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
node ./scripts/check-router-nudges.js
node ./scripts/check-workflow-lifecycle.js
node ./scripts/check-dsh-plugin.js
node ./scripts/check-widget-live-state.js
node ./scripts/check-research-workflow.js
node ./scripts/check-tier-vocabulary.js
node ./scripts/validate-plugin.js
node ./scripts/check-claude-code.js
node ./scripts/check-test-policy.js
node ./scripts/check-tmp-usage.js
node ./scripts/check-release-readiness.js --require-version-entry
./scripts/check-installed-artifacts.sh
```

Before handoff: inspect complete tree, run `git diff --check`, verify generated exports, installer parity, branch, remote, tag, and clean worktree. Run `session-review` when work exposes reusable workflow gaps.
