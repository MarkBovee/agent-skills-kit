# nebu-skills Agent Instructions

## Project

Multi-platform skill-pack for OpenCode, GitHub Copilot, Claude Code. Ships workflow skills, router plugin, generated platform exports, install scripts. No build step, no runtime, no package manager.

## Structure

- `skills/<name>/SKILL.md` — one skill per directory
- `plugins/nebu-skills-router.js` — OpenCode plugin: deterministic cascade routing, injects routing hints into system prompt
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

- Workflow skills: `nebu-<topic>` (e.g. `nebu-debugging`, `nebu-kaizen`)
- Meta/router skills: `writing-nebu-skills`
- Utility: prefer `nebu-` prefix too

### Cross-references

When one skill leads into another, add `## Use with` with one-line descriptions. Keep bidirectional where sensible.

### Rules

- Self-contained: usable without loading other skills
- No repo-specific paths in generic skills
- No external deps unless documented
- Support files live in skill's own directory

## Router plugin

`plugins/nebu-skills-router.js` uses deterministic cascade: signal phrases in priority order, first match wins. When changing:

- `node -e "require('./plugins/nebu-skills-router.js')"` — verify it loads
- `node -e "const {cascadeRoute,loadSkills}=require('./core/router-core'); loadSkills(['./skills']).then(s=>console.log(cascadeRoute('fix this bug',s,{})))"` — test cascade
- Keep plugin stateless except session-scoped match cache

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
2. Router loads: `node -e "require('./plugins/nebu-skills-router.js')"`
3. Exports regenerate: `node ./scripts/export-platform-skills.js`
4. Install/bootstrap scripts idempotent: run twice, same output
5. No hardcoded workspace-specific paths in generic skills
