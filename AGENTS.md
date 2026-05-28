# nebu-skills Agent Instructions

## Project

This is a multi-platform skill-pack repo for OpenCode, GitHub Copilot, and Claude Code. It ships workflow skills, a router plugin, generated platform exports, and install scripts. It is not an application — there is no build step, no runtime, and no package manager.

## Structure

- `skills/<name>/SKILL.md` — one skill per directory, always named `SKILL.md`
- `plugins/nebu-skills-router.js` — OpenCode plugin that scores skills against user messages and injects routing hints into the system prompt
- `scripts/` — install/update/bootstrap scripts (bash + PowerShell parity required)
- `README.md` — public docs for users
- `AGENTS.md` — this file, for AI agents working in the repo

## Coding standards

- Follow DRY and SOLID. Before adding code, check whether the behavior already exists and extract shared helpers instead of duplicating logic.
- Prefer small, focused functions with clear names and a single level of abstraction. Use guard clauses and early returns to keep control flow flat.
- Prefer pure helpers when practical. Keep orchestration separate from object construction, formatting, parsing, and normalization helpers.
- Fail fast on invalid input and return errors with enough context for diagnostics.
- Keep code self-documenting. Add short intent comments only for non-obvious logic or lifecycle coupling.
- When editing code, add comments generously. By default, place at least one short intent comment above each function unless the repo or file has a stronger local convention.
- Keep the relevant checks warning-free and error-free before finishing a change.
- Prefer focused helper extraction or switch-style dispatch over growing conditional chains in routing, hook, tool, and script dispatch code.
- Normalize and canonicalize filesystem paths at the boundary where paths enter the system so caches, generated artifacts, and routing logic agree on the same real path.
- Keep public API and tool behavior changes minimal and explicit. Avoid widening behavior accidentally when fixing path, session, routing, or export bugs.
- Reuse existing core helpers before adding new utility layers.
- Keep cross-shell and cross-platform behavior aligned when practical. If startup, hook, install, or generated artifact behavior changes, update the paired scripts, cleanup flow, and README usage together.
- Prefer explicit data shapes and descriptive names over loose catch-all payloads or generic naming.
- Prefer concrete test models and narrow validation commands before widening scope.
- Centralize cross-cutting concerns such as normalization, timestamp-like metadata, or save-pipeline state handling instead of scattering them through feature logic.

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
- Meta/router skills: `nebu-using-nebu-skills`, `nebu-writing-nebu-skills`
- Utility skills: prefer the `nebu-` prefix too (e.g. `nebu-workspace-wrapup`)

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
- `scripts/bootstrap-copilot.*` — clone/update repo + delegate to Copilot install
- `scripts/install-copilot.*` — copy generated Copilot skills and instructions to the user profile
- `scripts/update-copilot.*` — optionally pull latest, then reinstall Copilot assets
- `scripts/bootstrap-claude-code.*` — clone/update repo + delegate to Claude install
- `scripts/install-claude-code.*` — copy generated Claude Code skills and rules to the user profile
- `scripts/update-claude-code.*` — optionally pull latest, then reinstall Claude assets
- `scripts/install-opencode.*` — copy skills and plugin to OpenCode config dir
- `scripts/update-opencode.*` — git pull + reinstall

When changing any script, update both `.sh` and `.ps1` versions.

## Validation

After changes, verify:

1. Every `skills/*/SKILL.md` has valid frontmatter with `name`, `description`, and `triggers`.
2. The router plugin loads without errors: `node -e "require('./plugins/nebu-skills-router.js')"`.
3. Exported Copilot and Claude artifacts regenerate cleanly: `node ./scripts/export-platform-skills.js`.
4. Install and bootstrap scripts run idempotently: run twice, expect same output.
5. No hardcoded paths specific to a particular workspace in generic skills.
