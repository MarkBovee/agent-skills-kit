# nebu-skills Agent Instructions

## Project

This is a multi-platform skill-pack repo for OpenCode, GitHub Copilot, and Claude Code. It ships workflow skills, a router plugin, generated platform exports, and install scripts. It is not an application — there is no build step, no runtime, and no package manager.

## Structure

- `skills/<name>/SKILL.md` — one skill per directory, always named `SKILL.md`
- `plugins/nebu-skills-router.js` — OpenCode plugin that scores skills against user messages and injects routing hints into the system prompt
- `core/router-core.js` — shared router helpers (scoring, session state, frontmatter parsing)
- `core/community-skills.js` — helper for fetching, ranking, and installing community skills from `github/awesome-copilot`; consumed by `nebu-skill-finder`
- `core/community-skills-index.json` — cached awesome-copilot catalog, commit-pinned, refreshed by `scripts/fetch-community-skills-index.js`
- `scripts/` — install/update/bootstrap scripts (bash + PowerShell parity required)
- `README.md` — public docs for users
- `AGENTS.md` — this file, for AI agents working in the repo

## Coding standards

These rules are language-agnostic. They apply to every file the agent writes, edits, reviews, or generates, in any language, in any repo, unless an explicit, repo-local convention overrides them in writing.

- **DRY and SOLID.** Before adding code, check whether the behavior already exists and extract shared helpers instead of duplicating logic.
- **Small focused functions.** Prefer one clear level of abstraction per function. Use guard clauses and early returns to keep control flow flat.
- **Pure helpers.** Prefer side-effect-free helpers when practical. Keep orchestration separate from object construction, formatting, parsing, and normalization helpers.
- **Fail fast.** Validate input early and return errors with enough context for diagnostics.
- **Explicit data shapes.** Prefer named types, records, or DTOs over loose catch-all payloads, `object`, or `dynamic`. Three or more positional parameters belong in a request/options object.
- **Meaningful names.** Use intention-revealing names for identifiers, variables, parameters, and return values. Avoid generic `data`, `result`, `code`, `updated`.
- **Intent comments above every function (hard rule).** Every function, method, helper, closure handler, route handler, protocol dispatcher, and static utility gets a short comment above it stating its purpose. This is non-negotiable for reviewability of generated code. For non-obvious behavior, add a brief docstring covering parameters, return value, side effects, and any preconditions or invariants. Inline `why` comments stay focused on intent, not line-by-line narration.
- **Self-documenting body.** Use small named helpers, switch/pattern dispatch, and extracted builders instead of long `if/else` chains, deeply nested blocks, or growing parameter lists.
- **Centralize cross-cutting concerns.** Normalize paths, timestamps, locale, and other cross-cutting metadata at the boundary where they enter the system. Reuse existing core helpers before adding new utility layers.
- **Reuse over reinvention.** Reuse existing core helpers, plan/spec systems, and patterns before introducing new utility layers, parallel doc trees, or alternative config systems.
- **Keep public behavior narrow.** Public API and tool behavior changes are minimal and explicit. Avoid widening behavior accidentally when fixing path, session, routing, hook, or export bugs.
- **Cross-platform parity.** When startup, hook, install, or generated artifact behavior changes, update the paired `.sh` and `.ps1` scripts, the cleanup flow, and the README usage together.
- **Generated artifacts are derived.** Exported platform skills and instructions regenerate cleanly from the source skills. Do not hand-edit `.claude/skills/`, `.github/skills/`, `CLAUDE.md`, or `.github/copilot-instructions.md` — fix the source and re-export.
- **Warning-free finish.** Keep the relevant checks (lint, typecheck, tests) warning-free and error-free before claiming a change is done.

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

When one skill naturally leads into another, add a `## Use with` section with one-line descriptions. Keep it bidirectional where it makes sense (e.g. debugging references verification, verification references code review).

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

## Release discipline

- Bootstrap and update flows install the latest stable `vX.Y.Z` tag, not an arbitrary `main` commit.
- Any user-visible fix to shipped assets under `skills/`, `core/`, `plugins/`, or install/update/bootstrap helpers in `scripts/` should get at least a patch bump in `VERSION`, unless the user explicitly says the change should stay unreleased.
- When bumping `VERSION`, add the matching `CHANGELOG.md` entry in the same change.
- Do not claim a bootstrap or installer fix is shipped after commit and push alone; stable users only receive it after the matching `vX.Y.Z` tag exists.
- Doc-only or internal maintenance changes can stay unreleased when they do not affect shipped behavior.

## Validation

After changes, verify:

1. Every `skills/*/SKILL.md` has valid frontmatter with `name`, `description`, and `triggers`.
2. The router plugin loads without errors: `node -e "require('./plugins/nebu-skills-router.js')"`.
3. Exported Copilot and Claude artifacts regenerate cleanly: `node ./scripts/export-platform-skills.js`.
4. Install and bootstrap scripts run idempotently: run twice, expect same output.
5. No hardcoded paths specific to a particular workspace in generic skills.
6. The community-skills helpers load and the cached index is fresh: `node -e "require('./core/community-skills')"` and `node ./scripts/fetch-community-skills-index.js`.
