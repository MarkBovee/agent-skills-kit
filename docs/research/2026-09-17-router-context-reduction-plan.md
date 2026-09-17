# Router Context Reduction Plan

## Risk

Release-sensitive. The router controls skill-loading nudges and tool gates across installed OpenCode configurations.

## Scope

### Must

- Keep first-prompt routing audit and the full decision tree.
- Replace OpenCode follow-up prompt tree injection with compact live status.
- Preserve route-match, lifecycle, interaction-guard, code-review, design-review, and improvement nudges.
- Stop adding `rules/workflow.md` to OpenCode's active `instructions` array.
- Preserve the workflow rule for every non-OpenCode installation target.
- Update installer checks, user-facing documentation, version, changelog, and generated exports.

### Out

- No change to routing priority, `OVERVIEW_ROWS`, tool blocking, TUI status, dsh prompt behavior, or skill content.
- Do not remove the installed OpenCode `rules/workflow.md` file; only remove automatic loading from `opencode.json`.

## Design

Add an OpenCode-only compact prompt renderer in `core/router-core.js`. It emits the kit header, workflow state, active route, and existing actionable nudges. `buildSkillOverview()` remains the canonical full decision-tree renderer used for first-prompt audit, blocked tool errors, documentation drift checks, and dsh.

`plugins/agent-skills-router/server.mjs` selects the full renderer only during the existing first-prompt audit. It selects the compact renderer for later prompts.

The Bash and PowerShell installers keep copying `workflow.md` but set OpenCode `instructions` to only `coding-standards.md` and `agent-skills-kit.md`. Installer validation must assert the workflow rule remains installed yet absent from OpenCode's active instructions.

## Plan Check

- Compatibility: full renderer remains unchanged where another host or tool gate depends on it.
- Fallback: a matched but unloaded skill retains its explicit `Match:` nudge from `processPrompt()`.
- Determinism: compact lines reuse existing state fields and ordering; no new state or route logic.
- Safety: `routingHintLines()` still supplies the complete blocked-tool guidance before skill load.
- Proof: update nudge checks for first and follow-up prompts; run router, lifecycle, dsh, widget, installer, export, and plugin validations.

## Release Gate Cost

Use a standard independent audit after validation. The delta is small, but it changes shared prompt injection and installer output.
