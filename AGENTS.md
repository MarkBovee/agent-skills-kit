# agent-skills-kit Agent Instructions

## Project

Multi-platform skill-pack for OpenCode, GitHub Copilot, Claude Code. Ships workflow skills, router plugin, generated platform exports, install scripts. No build step, no runtime, no package manager.

## Structure

- `skills/<name>/SKILL.md` — one skill per directory
- `commands/<name>.md` — one slash command per skill, referencing its skill
- `plugins/agent-skills-router.mjs` — OpenCode plugin: deterministic cascade routing, injects routing hints into system prompt
- `plugins/agent-skills-router.dsh.mjs` — dsh (DeepSeek Harness) Cordis plugin: same router behavior as a preset row; requires `core/router-core.js` via a vendored copy in the installed preset
- `core/router-core.js` — shared router helpers (cascade routing, session state, frontmatter parsing)
- `scripts/` — install/update/bootstrap scripts (bash + PowerShell parity)
- `README.md` — public docs
- `AGENTS.md` — this file, for AI agents

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

`plugins/agent-skills-router.mjs` injects a beslisboom (decision tree) every prompt — agent self-selects skills via `skill(name: '...')`. No automatic phrase matching. When changing:

- The beslisboom has 12 routing rows. `design-review` is a companion skill, not a routing row: it fires when the `ui-ux` skill is loaded (plugin sets `needsDesignReview` and nudges `skill(name: 'design-review')` until it is loaded), mirroring `needsCodeReview`. `text-writing` is a routing row, matching text that must read human rather than AI. The blocked-tool hint and the rules-file beslisboom are derived from `routingHintLines()` in `core/router-core.js` — never hand-edit either copy; `validate-plugin.js` fails on drift.

- `node --input-type=module -e "import('./plugins/agent-skills-router.mjs')"` — verify it loads
- `node -e "const {buildSkillOverview,createEmptySessionState}=require('./core/router-core'); const s=createEmptySessionState(); s.matchedSkills=[{name:'develop'}]; console.log(buildSkillOverview(s))"` — test beslisboom output
- `node -e "import('./plugins/agent-skills-router.mjs').then(async m=>{const p=await m.AgentSkillsRouter(); await p['session.created'](); const r=await p['tui.prompt.append']({prompt:'test'}); console.log(r?.append?.slice(0,200))})"` — test plugin hooks
- Keep plugin stateless except session-scoped state (tool tracking, skill-load events, audit flag)

### dsh router variant

`plugins/agent-skills-router.dsh.mjs` is the DeepSeek Harness counterpart, loaded as an `ask-kit` agent-preset row (`name: ./plugins/ask-kit-router.mjs`, installed by `install.*`). It appends the beslisboom section through the `system-prompt/assemble` waterfall, registers one slash command per kit skill through a lazy `ctx.inject(["commands"])` (beslisboom rows double as picker descriptions; companion skills `design-review`/`gh-inbox` are explicit and must not drift from `commands/<name>.md`), tracks skill/review state via `tools/pre-execute` / `tools/result` / `agent/inbox/inserted`, and gates tools only when row config `blockUntilSkillLoaded` is true (default false). The file must stay dependency-free — preset-local rows cannot resolve bare specifiers such as `@deepseek-ai/schemastery`, so row config is normalized manually in `apply()`. All beslisboom rows come from `routingHintLines()`; `node ./scripts/check-dsh-plugin.js` validates exports, dependency-freedom, event wiring, gating, cascade routing, the slash-command surface, and beslisboom drift against `core/router-core.js`.

### New-session validation

Before claiming a fix ships:

1. `node -e "import('./plugins/agent-skills-router.mjs')"` — plugin loads without error
2. `node ./scripts/export-platform-skills.js` — exports regenerate
3. Beslisboom check: `node -e "const {buildSkillOverview,createEmptySessionState}=require('./core/router-core'); console.log(buildSkillOverview(createEmptySessionState()))"` — output contains `╌ Agent Skills Kit ╌` and all 12 skills
4. `node ./scripts/check-router-nudges.js` — nudge behavior (audit, blocked-tool guard, auto-match, review nudges) passes
5. `node ./scripts/check-dsh-plugin.js` — dsh router variant passes (exports, config defaults, event wiring, strict gate, beslisboom drift)
6. OpenCode plugin check: in a test session, verify `╌ Agent Skills Kit ╌` appears in the system prompt with the beslisboom. If missing, check `opencode.json` `plugins` array includes `./plugins/agent-skills-router.mjs` and the file exists at that path.
7. `./scripts/check-installed-artifacts.sh` — installs into isolated homes (fake dsh shim on PATH) and asserts the deployed user-visible strings — preset.yml description, router prompt header, widget status bar — match the repo, including refresh migration of a stale pre-English preset

## Install scripts

- `scripts/bootstrap.*` — clone/update managed checkout, delegate to unified installer
- `scripts/install.*` — copy shared skills + host-specific instructions/plugins
- `scripts/update.*` — pull managed checkout to latest stable tag, reinstall

Change both `.sh` and `.ps1` together.

## Release discipline

- Bootstrap/update installs latest stable `vX.Y.Z` tag, not `main`
- User-visible fix to shipped assets (`skills/`, `core/`, `plugins/`, `scripts/`) → patch bump in `VERSION`
- `VERSION` bump + matching `CHANGELOG.md` entry in same change
- Fix ships to stable users only after `vX.Y.Z` tag exists
- When `main` is protected, create and push a fix branch, open a PR, and tag the release only after that PR is merged; never push directly to `main`
- Doc-only/internal changes can stay unreleased

## Validation

After changes:

1. Every `skills/*/SKILL.md` has valid frontmatter (`name`, `description`, `triggers`)
2. Router loads: `node -e "import('./plugins/agent-skills-router.mjs')"`
3. Exports regenerate: `node ./scripts/export-platform-skills.js`
4. Install/bootstrap scripts idempotent: run twice, same output
5. No hardcoded workspace-specific paths in generic skills
6. Installers deploy current user-visible strings: `./scripts/check-installed-artifacts.sh`
