# nebu-skills Agent Instructions

## Project

This is a skill-pack repo for OpenCode. It ships workflow skills, a router plugin, and install scripts. It is not an application — there is no build step, no runtime, and no package manager.

## Structure

- `skills/<name>/SKILL.md` — one skill per directory, always named `SKILL.md`
- `plugins/nebu-skills-router.js` — OpenCode plugin that scores skills against user messages and injects routing hints into the system prompt
- `scripts/` — install/update/bootstrap scripts (bash + PowerShell parity required)
- `README.md` — public docs for users
- `AGENTS.md` — this file, for AI agents working in the repo

## Skill conventions

### Frontmatter (required)

Every SKILL.md must start with YAML frontmatter containing:

```yaml
---
name: skill-name
description: One sentence starting with "Use when..." — say when to use, not how.
triggers:
  - keyword or phrase
  - another trigger
---
```

All three fields (`name`, `description`, `triggers`) are required. The router plugin uses them for scoring.

### Structure

Keep skills short (30-90 lines). Prefer this shape:

1. One-line purpose statement
2. Pattern, flow, or core loop (numbered steps)
3. Optional "Use with" section for cross-references to other skills
4. "Avoid" section for anti-patterns

### Naming

- Workflow skills: `nebu-<topic>` (e.g. `nebu-debugging`, `nebu-kaizen`)
- Meta/router skills: `using-nebu-skills`, `writing-nebu-skills`
- Utility skills: descriptive name (e.g. `workspace-wrapup`)

### Cross-references

When one skill naturally leads into another, add a `## Use with` section with one-line descriptions. Keep it bidirectional where it makes sense (e.g. debugging references TDD, TDD references debugging).

### Rules

- Skills are self-contained — each skill must be usable without loading others.
- No repo-specific file paths or branded artifact trees in generic skills.
- No external code dependencies unless the skill explicitly documents them (see `nebu-ui-ux`).
- Support files (scripts, data) belong in the skill's own directory.

## Router plugin

The router (`plugins/nebu-skills-router.js`) reads frontmatter from all installed skills, scores them against user messages, and injects hints into the system prompt. When changing the router:

- Test with `node -e "const r = require('./plugins/nebu-skills-router.js'); ..."` to verify it loads and parses.
- Verify frontmatter parsing with the `parseFrontmatter` function against a sample skill.
- Keep the plugin stateless except for the session-scoped match cache.

## Install scripts

- `scripts/bootstrap-opencode.*` — clone/update repo + delegate to install
- `scripts/install-opencode.*` — copy skills and plugin to OpenCode config dir
- `scripts/update-opencode.*` — git pull + reinstall

When changing any script, update both `.sh` and `.ps1` versions.

## Validation

After changes, verify:

1. Every `skills/*/SKILL.md` has valid frontmatter with `name`, `description`, and `triggers`.
2. The router plugin loads without errors: `node -e "require('./plugins/nebu-skills-router.js')"`.
3. Install scripts run idempotently: run twice, expect same output.
4. No hardcoded paths specific to a particular workspace in generic skills.
