# nebu-skills Agent Instructions

## Project

Multi-platform skill-pack for OpenCode, GitHub Copilot, Claude Code. Ships workflow skills, router plugin, generated platform exports, install scripts. No build step, no runtime, no package manager.

## Structure

- `skills/<name>/SKILL.md` — one skill per directory
- `plugins/nebu-skills-router.mjs` — OpenCode plugin: deterministic cascade routing, injects routing hints into system prompt
- `core/router-core.js` — shared router helpers (cascade routing, session state, frontmatter parsing)
- `scripts/` — install/update/bootstrap scripts (bash + PowerShell parity)
- `README.md` — public docs
- `AGENTS.md` — this file, for AI agents

## Coding standards

See `rules/coding-standards.md`. Hard requirements: intent comments above every function, DRY+SOLID, small focused functions, no generated-artifact hand-edits.

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

- Workflow skills: `nebu-<topic>` (e.g. `nebu-debugging`, `nebu-develop`)
- Meta/router skills: `nebu-write-skill`
- Utility: prefer `nebu-` prefix too

### Cross-references

When one skill leads into another, add `## Use with` with one-line descriptions. Keep bidirectional where sensible.

### Rules

- Self-contained: usable without loading other skills
- No repo-specific paths in generic skills
- No external deps unless documented
- Support files live in skill's own directory

## Router plugin

`plugins/nebu-skills-router.mjs` injects a beslisboom (decision tree) every prompt — agent self-selects skills via `skill(name: '...')`. No automatic phrase matching. When changing:

- `node --input-type=module -e "import('./plugins/nebu-skills-router.mjs')"` — verify it loads
- `node -e "const {buildSkillOverview,createEmptySessionState}=require('./core/router-core'); const s=createEmptySessionState(); s.matchedSkills=[{name:'develop'}]; console.log(buildSkillOverview(s))"` — test beslisboom output
- `node -e "import('./plugins/nebu-skills-router.mjs').then(async m=>{const p=await m.NebuSkillsRouter(); await p['session.created'](); const r=await p['tui.prompt.append']({prompt:'test'}); console.log(r?.append?.slice(0,200))})"` — test plugin hooks
- Keep plugin stateless except session-scoped state (tool tracking, skill-load events, audit flag)

### New-session validation

Before claiming a fix ships:

1. `node -e "import('./plugins/nebu-skills-router.mjs')"` — plugin loads without error
2. `node ./scripts/export-platform-skills.js` — exports regenerate
3. Beslisboom check: `node -e "const {buildSkillOverview,createEmptySessionState}=require('./core/router-core'); console.log(buildSkillOverview(createEmptySessionState()))"` — output contains `╌ Nebu Skills ╌` and all 10 skills
4. OpenCode plugin check: in a test session, verify `╌ Nebu Skills ╌` appears in the system prompt with the beslisboom. If missing, check `opencode.json` `plugins` array includes `./plugins/nebu-skills-router.mjs` and the file exists at that path.

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
- Doc-only/internal changes can stay unreleased

## Validation

After changes:

1. Every `skills/*/SKILL.md` has valid frontmatter (`name`, `description`, `triggers`)
2. Router loads: `node -e "import('./plugins/nebu-skills-router.mjs')"`
3. Exports regenerate: `node ./scripts/export-platform-skills.js`
4. Install/bootstrap scripts idempotent: run twice, same output
5. No hardcoded workspace-specific paths in generic skills
