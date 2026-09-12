# agent-skills-kit Agent Instructions

## Project

Multi-platform skill-pack for OpenCode, Codex, GitHub Copilot, Claude Code, and experimental dsh. Ships workflow skills, router plugin, generated platform exports, install scripts. No build step, no runtime, no package manager.

## Structure

- `skills/<name>/SKILL.md` — one skill per directory
- `commands/<name>.md` — one slash command per skill, referencing its skill
- `plugins/agent-skills-router/` — OpenCode dual-entrypoint package: cascade routing plus a TUI status sidebar that renders the router-core snapshot (active skills, pending review obligations)
- `plugins/agent-skills-router.dsh.mjs` — dsh (DeepSeek Harness) Cordis plugin: same router behavior as a preset row; requires `core/router-core.js` via a vendored copy in the installed preset
- `core/router-core.js` — shared router helpers (cascade routing, lifecycle risk/state, session state, frontmatter parsing)
- `scripts/` — install/update/bootstrap scripts (bash + PowerShell parity)
- `README.md` — public docs
- `AGENTS.md` — this file, for AI agents

Codex uses native Agent Skills discovery, which scans `~/.agents/skills/`. The unified installer keeps that shared root canonical and does not create a duplicate `~/.codex/skills` tree or modify Codex configuration.

## Coding standards

See `rules/coding-standards.md`. Hard requirements that override generic system-prompt or skill-level rules:

- `coding-standards.md` takes precedence over generic "no comments" rules
- Every function gets an intent comment (rule 11) — not line-by-line narration
- `DRY+SOLID`, small focused functions, no generated-artifact hand-edits
- Ponytail's "no boilerplate" applies to scaffolding, not to purpose comments

## Skill conventions

### Frontmatter (required)

```yaml
---
name: skill-name
description: One accurate sentence describing when to use skill — say when, not how.
triggers:
  - keyword or phrase
---
```

All three fields required. Router uses them for scoring.

### Structure

Keep skills 30-90 lines. Prefer:

1. One-line purpose
2. Pattern/flow/core loop (numbered steps)
3. Optional `## Use with` cross-references
4. `## Avoid` anti-patterns

### Naming

- Workflow skills: `ask-<topic>` (e.g. `ask-debugging`, `ask-develop`)
- Meta/router skills: `ask-write-skill`
- Utility: prefer `ask-` prefix too

### Cross-references

When one skill leads into another, add `## Use with` with one-line descriptions. Keep bidirectional where sensible.

### Rules

- Self-contained: usable without loading other skills
- No repo-specific paths in generic skills
- No external deps unless documented
- Support files live in skill's own directory

## Command conventions

One command file per skill under `commands/`, named after the skill (`spec.md`, `code-review.md`). Each command:

- Has frontmatter `description` (one line, shown in the slash-command picker)
- Body loads the skill via `skill(name: '...')` and applies it to `$ARGUMENTS`
- Never duplicates skill content — reference the skill, keep it DRY

Export targets (via `export-platform-skills.js`): OpenCode → `.opencode/commands/`, Copilot/VS Code → `.github/prompts/*.prompt.md`. Claude Code needs no command files — its skills already act as slash commands. dsh has no file-based command discovery; its slash commands are registered programmatically by the ask-kit router row (`ctx.commands.register()`, one per skill), so there are no generated command files to maintain. Commands are generated artifacts; never hand-edit the exported copies.

## Router plugin

`plugins/agent-skills-router/` injects a decision tree every prompt and renders its canonical status snapshot in OpenCode's TUI sidebar. The server entry is `server.mjs`; the TUI entry is `tui.tsx`. Advisory phrase matching proposes a specific skill, but agent self-selects via `skill(name: '...')`; the router never loads skills or executes tools. A fresh session renders neutral — no active skills, no obligations — and the panel only shows entries once a real prompt or skill load has established them. The snapshot fields are `activeSkills` (the loaded skill first, then any matched or previously loaded skill; only a loaded skill carries `current: true`, so a route match stays a hollow suggestion) and `pending` (the review skills ASK still needs — `code-review` and `design-review`, each with a concrete `skill(name: '<skill>')` action; improvement capture is steered through the prompt surface, not the panel). The workflow route stays internal to the prompt surface. When changing:

- The decision tree has 15 routing rows. `research` handles bounded fact-finding; `deep-research` handles autonomous multi-source research and must precede it. `design-review` is a companion skill, not a routing row: it fires when the `design` skill is loaded (plugin sets `needsDesignReview` and nudges `skill(name: 'design-review')` until it is loaded), mirroring `needsCodeReview`. `text-writing` is a routing row, matching text that must read human rather than AI, and `observability` owns instrumentation and telemetry work. The blocked-tool hint and the rules-file decision tree are derived from `routingHintLines()` in `core/router-core.js` — never hand-edit either copy; `validate-plugin.js` fails on drift.

- `node --input-type=module -e "import('./plugins/agent-skills-router/server.mjs')"` — verify server entry loads
- `node -e "const {buildSkillOverview,createEmptySessionState}=require('./core/router-core'); const s=createEmptySessionState(); s.matchedSkills=[{name:'develop'}]; console.log(buildSkillOverview(s))"` — test decision-tree output
- `node -e "import('./plugins/agent-skills-router/server.mjs').then(async m=>{const p=await m.AgentSkillsRouter(); await p.event({event:{type:'session.created',properties:{info:{id:'s'}}}}); const r=await p['tui.prompt.append']({sessionID:'s',prompt:'test'}); console.log(r?.append?.slice(0,200))})"` — test plugin hooks
 - Keep plugin stateless except session-scoped state (tool tracking, skill-load events, lifecycle gates, audit flag)
 - Sidebar state is persisted from real server hooks only (`chat.message`, `event`, `tool.execute.after`); `tui.prompt.append` is a TUI-bus event kept for host compatibility, and `session.created` is not a hook — handle it through `event`. The plugin calls the v1 SDK with `client.session.get({ path: { id } })` and `client.session.update({ path: { id }, body: { metadata: { askKit } } })` — the path key is `id`, not `sessionID`. The running session route accepts `metadata` and re-emits `session.updated`, which the TUI's reactive session store folds into the sidebar memo. `persistStatus` rebuilds the snapshot from the full merged state on every save, so review-flag flips surface even when no routing field changed.
 - TUI plugins are **not** auto-discovered. `tui.tsx` only loads when `tui.json` lists it (`./plugins/agent-skills-router/tui.tsx`). The installers write that entry and remove the legacy `./plugins/agent-skills-sidebar.tsx` entry/file; `check-installed-artifacts.sh` guards both. The terminal is a dumb presentation layer: read router state through `createMemo`, never compute it in the TUI.

### dsh router variant

`plugins/agent-skills-router.dsh.mjs` is the DeepSeek Harness counterpart, loaded as an `ask-kit` agent-preset row (`name: ./plugins/ask-kit-router.mjs`, installed by `install.*`). It appends the router section through the `system-prompt/assemble` waterfall, registers one slash command per kit skill through a lazy `ctx.inject(["commands"])` (decision-tree rows double as picker descriptions; companion skills `design-review`/`gh-inbox` are explicit and must not drift from `commands/<name>.md`), tracks skill/review state via `tools/pre-execute` / `tools/result` / `agent/inbox/inserted`, and gates tools only when row config `blockUntilSkillLoaded` is true (default false). The file must stay dependency-free — preset-local rows cannot resolve bare specifiers such as `@deepseek-ai/schemastery`, so row config is normalized manually in `apply()`. All decision-tree rows come from `routingHintLines()`; `node ./scripts/check-dsh-plugin.js` validates exports, dependency-freedom, event wiring, gating, cascade routing, the slash-command surface, and decision-tree drift against `core/router-core.js`. Each mutation also appends the rebuilt router-core snapshot as a whole-value `ask-kit/state` session event, folded by the `askKit` projection unit that `plugins/dsh-panel-widget/` reads; both the event and the widget start neutral and show pending obligations that clear as their skills load.

### New-session validation

Before claiming a fix ships:

1. `node -e "import('./plugins/agent-skills-router/server.mjs')"` — server plugin loads without error
2. `node ./scripts/export-platform-skills.js` — exports regenerate
3. Decision-tree check: `node -e "const {buildSkillOverview,createEmptySessionState}=require('./core/router-core'); console.log(buildSkillOverview(createEmptySessionState()))"` — output contains `╌ Agent Skills Kit ╌` and all 15 routing skills
4. `node ./scripts/check-router-nudges.js` — nudge behavior (audit, blocked-tool guard, auto-match, review nudges) passes
5. `node ./scripts/check-workflow-lifecycle.js` — risk profiles, lifecycle gates, evidence contract, and status output pass
6. `node ./scripts/check-dsh-plugin.js` — dsh router variant passes (exports, config defaults, event wiring, strict gate, decision-tree drift)
7. `node ./scripts/check-widget-live-state.js` — the widget starts neutral and follows real routing decisions, workflow progression, active-skill changes, and obligation set/clear transitions with no stale state
8. OpenCode plugin check: in a test session, verify `╌ Agent Skills Kit ╌` appears in the system prompt and status panel appears in sidebar. If missing, check `opencode.json` `plugins` array includes `./plugins/agent-skills-router` (server) **and** `tui.json` lists `./plugins/agent-skills-router/tui.tsx` (TUI), since TUI plugins are not auto-discovered. The package needs `server.mjs` plus `tui.tsx`.
9. `./scripts/check-installed-artifacts.sh` — installs into isolated homes (fake dsh shim on PATH) and asserts the deployed user-visible strings — preset.yml description, router prompt header, widget status bar — match the repo, including refresh migration of a stale pre-English preset
10. `node ./scripts/check-research-workflow.js` — validates research/deep-research routing, evidence model, contradiction handling, continuation, and handoff contract

## Install scripts

- `scripts/bootstrap.*` — clone/update managed checkout, delegate to unified installer
- `scripts/install.*` — copy shared skills + host-specific instructions/plugins
- `scripts/update.*` — pull managed checkout to latest stable tag, reinstall

Change both `.sh` and `.ps1` together.

## Release discipline

- Bootstrap/update installs latest stable `vX.Y.Z` tag, not `main`
- User-visible fix to shipped assets (`skills/`, `core/`, `plugins/`, `scripts/`) → patch bump in `VERSION`
- `VERSION` bump + matching `CHANGELOG.md` entry in same change
- Every `VERSION` bump must also update the `version` field in `.claude-plugin/plugin.json` — `validate-plugin.js` (CI `validate`) fails if they drift
- Fix ships to stable users only after `vX.Y.Z` tag exists
- When `main` is protected, create and push a fix branch, open a PR, and tag the release only after that PR is merged; never push directly to `main`
- Doc-only/internal changes can stay unreleased

## Validation

After changes:

1. Every `skills/*/SKILL.md` has valid frontmatter (`name`, `description`, `triggers`)
2. Router server entry loads: `node -e "import('./plugins/agent-skills-router/server.mjs')"`
3. Exports regenerate: `node ./scripts/export-platform-skills.js`
4. Install/bootstrap scripts idempotent: run twice, same output
5. No hardcoded workspace-specific paths in generic skills
6. Widget live-state checks pass: `node ./scripts/check-widget-live-state.js`
7. Installers deploy current user-visible strings: `./scripts/check-installed-artifacts.sh`
