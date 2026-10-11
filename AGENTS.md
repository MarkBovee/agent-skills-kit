# agent-skills-kit Agent Instructions

Workflow skill pack. Claude Code is the primary harness; OpenCode, Codex, GitHub Copilot, and dsh are supported through the same sources. The repo ships workflow skills, router plugins, generated exports, and installers. There is no build step and no package manager.

Read `ARCHITECTURE.md` first. It maps every path, says which files are generated, and lists the contributor gotchas. This file holds only the binding rules.

## Never hand-edit

- `.github/skills`, `.github/prompts`, `.github/copilot-instructions.md`, `.dsh/`, `.opencode/commands`: run `node ./scripts/export-platform-skills.js`.
- `rules/claude/`: run `node ./scripts/export-claude-coding-standards.js`; the source is `rules/coding-standards.md`.

Commit regenerated output together with the source change. CI fails on a diff.

## Coding standards

- Read `rules/coding-standards.md` before editing code.
- Put a short intent comment above every function-like construct, and run the repository's source-comment check.
- Keep the local style of the file you are in.
- Prefer small focused functions, DRY and SOLID, reuse over new helpers, explicit data shapes, meaningful names, guard clauses, and pure helpers.

## Skills

**Frontmatter**

- `name` equals the directory (`ask-<name>`). The router and exports use the bare name; the `ask-` id is native to Claude Code's skill listing.
- `description` is third person, starts with the nice name, says what the skill does and when to use it (`Develop: Drives normal implementation work ... Use when ...`), and stays at or under 160 characters. Claude Code selects skills from the description alone, so the key use cases and terms belong there.
- `triggers` feed only the ASK router.

**Loading.** Router prompts, pending actions, and commands load a skill by reading `~/.agents/skills/ask-<name>/SKILL.md`. Leaf skills are never invoked through a native Skill tool.

**Content**

- Keep each skill self-contained, with no links into other skills, and free of repository-specific paths.
- Length follows the steps. Put what every run needs inline in `SKILL.md` so it cannot be skipped; disclose into `references/` only a branch that just some runs reach (release gates, for example). The hard cap is 500 lines, enforced by `check-skill-best-practices`.
- Reference files stay one level deep from `SKILL.md`; one over 100 lines starts with a `## Contents` list.
- Use forward slashes in paths, `ask-` names for workflow and meta skills, and bidirectional cross-references where they help.

**Evals.** Every skill has at least three behavior scenarios (`query` plus `expected_behavior`) in `evals/ask-<name>.json`; update them with the skill. Measure activation changes with `node ./scripts/eval-skill-activation.js` and behavior with `node ./scripts/eval-skill-behavior.js [--model haiku|sonnet] [--baseline]` (Opus needs `--allow-opus`). Both spend tokens and stay out of CI.

## Router

- `plugins/agent-skills-router/` audits the first OpenCode prompt, then emits compact live status. Its TUI reads router-core state and never computes routing.
- A match suggests one skill and stays hollow until the agent reads the skill file. Fresh sessions stay neutral. Pending obligations are `code-review` and `design-review`.
- Decision-tree rows come from `routingHintLines()`; never duplicate them by hand.
- OpenCode's server is auto-discovered; the TUI still needs a `tui.json` entry. Installers must not register the server twice. Keep plugin state session-scoped.
- `plugins/agent-skills-router.dsh.mjs` is dependency-free and installed as an ask-kit preset row. It derives rows from `routingHintLines()`, registers one command per skill, tracks state through events, and gates tools only when configured. Validate with `node ./scripts/check-dsh-plugin.js`.

## Workflow

The canonical mandate is `rules/workflow.md`; installers copy it into each host's rules, so it is not repeated here. In short: pick the most specific workflow skill before substantial work, delegate independent research, validation, review, and audit, and never declare release readiness without independent evidence.

### Evidence reuse

Do not repeat intake, plan-check, review, or audit for a diff those gates already passed. Gate evidence is bound to the diff it examined; cite it instead of redoing it.

- Record each completed gate once, in the PR body or plan: gate, result, who ran it (independent or not), the diff reference (commit SHA or diff identity), and the subagent tokens it cost.
- Evidence stays valid for an identical diff. A base update, merge, or tag does not invalidate it when the diff content against the base is unchanged; compare before assuming otherwise.
- Classify a follow-up change before choosing gates. Mechanical deltas (version bump, changelog, regenerated exports, comment or doc wording) need validation only. Behavioral deltas need focused validation plus one delta gate on the changed paths at `standard` tier: a delta review for a review finding, a delta audit for an audit finding, never both. Escalate to `deep` only for an open cross-cutting invariant or counter-evidence.
- Gate once on the final diff, never while iterating. P2 notes become follow-ups, not new rounds.
- Reused evidence must itself have been independent. Self-review never becomes release evidence by being cited later, and stale or mismatched evidence is never reused.
- The handoff says which evidence was reused and which was produced fresh.

## Releases

- A user-visible shipped change needs a SemVer bump in `VERSION`, a matching `CHANGELOG.md` entry, and the same version in `.claude-plugin/plugin.json`.
- Stable releases use `vX.Y.Z` tags. Tag only after the merge to `main`; the release workflow publishes from `main`. Never push directly to the protected `main`.
- `scripts/install.*` and `scripts/update.*` keep `.sh` and `.ps1` behavior aligned and idempotent. Bootstrap and update resolve the latest stable tag.

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

CI (`.github/workflows/ci.yml`) is the source of truth for this list. When a check is added there, add it here.

Before handoff, inspect the complete tree and run `git diff --check`. Verify generated exports, installer parity, branch, remote, tag, and a clean worktree. Run `session-review` when the work exposed a reusable workflow gap.
