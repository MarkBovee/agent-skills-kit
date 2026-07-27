# Changelog

All notable changes to `nebu-skills` live here.

Format follows Keep a Changelog. Stable releases use SemVer tags in `vX.Y.Z` form.

## [0.5.0] - 2026-07-27

### Changed

- **Agent self-selects skills via beslisboom.** Router no longer does automatic phrase-based skill matching. Instead, `buildSkillOverview()` injects a decision tree every prompt — agent evaluates the task and loads via `skill(name: '...')`. Eliminates false positives and gives the agent full autonomy. README diagram and Router section updated.
- **Context-aware nudges in router.** Tracks tool usage, code edits, and skill-load events. Nudges when code is edited without review, or when many tools run without loading any skill. Session-start audit shows all available skills with descriptions.
- **Skill triggers enriched.** `develop` (rewrite, refactor, coordinator), `debugging` (slow startup, timeout, crash loop, None), `verification` (test de fix, cleanup, validate), `code-review` (check de wijziging, review changes, second look). Corresponding cascade phrase lists updated.
- **hasPhraseSignal uses word-boundary regex.** Prevents false positives (e.g. "prove" matching inside "improve") for the completion-state check.
- **Plugin error handling.** `tui.prompt.append` wrapped in try/catch — plugin errors don't break the session.
- **rules/nebu-skills.md ships with installer.** Beslisboom usage instructions registered in `opencode.json` instructions array so every new session has the decision tree context. Both `install.sh` and `install.ps1` updated.
- **AGENTS.md updated.** New-session validation steps (beslisboom check, plugin registration check, export check).

## [0.5.1] - 2026-07-27

### Fixed

- **install.sh copies rules instead of symlinks.** Bootstrap/update uses a temp checkout (`/tmp/nebu-skills-release-*/`) — symlinks broke after cleanup. Rules (`coding-standards.md`, `nebu-skills.md`) now copied to target for stable persistence across reboots and upgrades.

## [0.5.2] - 2026-07-27

### Changed

- **First-action instructie in plugin hook.** `buildSkillOverview` toont "Load matching skill *now*" tot een skill geladen is, daarna "Beslisboom — load different skill". Niet langer afhankelijk van passief `rules/nebu-skills.md` document.
- **rules/nebu-skills.md terug naar pure referentie.** Geen "first action" instructie meer — plugin hook injecteert de directive copy.
- **Dubbele const fix** in `buildSkillOverview` (router-core.js).

## Unreleased

## [0.4.1] - 2026-07-24

### Changed

- **Renamed `github-issues` → `session-review`.** Skill refocused on agent self-review of skill usage and filing improvements in `MarkBovee/nebu-skills`. General issue filing kept as secondary mode. Router cascade updated to new skill name and phrases.
- **Router cascade reordered by lifecycle stage:** Start → Execute → Validate → Improve → Coordinate → Product. README diagram and legend updated accordingly.

## [0.4.0] - 2026-07-24

### Added

- **Git workflow als standaard in `develop` skill.** Feature/bugfix/hotfix branches, meteen draft PR, squash merge, cleanup. Vervangt `dev-release-flow` (verwijderd).

### Changed

- **Skills hernoemd (breaking):** `kaizen`→`develop`, `kickoff`→`intake`, `writing-nebu-skills`→`write-skill`. Router constants, plugin, cross-refs, exports, README, AGENTS.md, install scripts allemaal mee.
- **Router cascade:** `DEV_FLOW_PHRASES` verwijderd, `WRITING_PHRASES`→`WRITE_SKILL_PHRASES`.
- **Export script:** hardcoded skill references geüpdatet (CLAUDE.md, copilot-instructions.md).

### Fixed

- **`home-assistant` frontmatter:** YAML folded scalar (`>`) brak `parseFrontmatter`. Omgerekend naar single-line description.
- **`home-assistant` te lang:** 353→83 regels SKILL.md + aparte REFERENCE.md (128 regels). Skill verplaatst naar persoonlijke `~/.config/opencode/skills/`.

### Removed

- **`dev-release-flow` skill verwijderd.** Git workflow zit nu in `develop` als standaard.
- **Install scripts:** stale skill lijst uitgebreid met `kaizen`, `nebu-kaizen`, `kickoff`, `nebu-kickoff`, `refactor`, `nebu-refactor`.

## [0.3.8] - 2026-07-23

### Changed

- **copilot-instructions.md:** "always invoke code-review after every edit" → only for meaningful/subtle/risky changes. Trivial edits skip review.
- **code-review triggers verscherpt:** `diff`, `after code changes`, `after coding`, `before claiming done` verwijderd. Laadt alleen nog bij expliciete review-intent.

## [0.3.6] - 2026-07-21

### Changed

- **skills/nebu-agent-workflows/SKILL.md** aangescherpt: default-delegate reflex, partial/blocked/timeout contract, stuck recovery. Overlap verwijderd, 124→106 lines strakker. (`## Good fit`, `## Context retention`, `### Output contract`, `### Concrete flows`)

## [0.3.5] - 2026-07-21

### Changed

- **skills/nebu-agent-workflows/SKILL.md** uitgebreid met context-retentie denkkader, output contract, concrete flow voorbeelden, en keep/delegeer tabel. Beter subagent gebruik bespaart hoofdcontext. (`## Not a good fit`, `## Context retention`, `### Output contract`, `### Concrete flows`)
- **Cavecrew skill verwijderd** uit opencode — vervangen door context-retentie patronen in agent-workflows skill.

## [0.3.4] - 2026-07-21

### Removed

- **nebu-skill-finder** verwijderd. `core/community-skills.js`, `core/community-skills-index.json` (257KB), `scripts/fetch-community-skills-index.js` en alle runtime bundling verwijdert. AI agent context niet langer belast met ~290KB aan community index data.

### Changed

- **AGENTS.md gecomprimeerd naar caveman format.** ~60% korter (8KB→3.3KB). Minder tokens per sessie.
- **AGENTS.md coding-standards inline vervangen met verwijzing naar `rules/coding-standards.md`.** Geen dubbele content meer.
- **Router hints gecomprimeerd.** `buildRoutingLines()` output ~70% korter (~1KB→~300B per prompt injectie).
- **router-core.js + plugin gecomprimeerd.** router-core 16KB→13.5KB, plugin 6KB→4.9KB. Total ~8KB besparing in verplichte context per sessie.
- **update.sh/update.ps1 opgeschoond.** Geen community-skills index refresh meer tijdens update.
- **README opgeschoond.** Platform matrix, maintenance, repo map zonder skill-finder references.

## [0.3.3] - 2026-07-21

### Fixed

- **coding-standards.md made language-agnostic.** Removed C#-specific rules, added intent-comments hard rule, per-language sections (JS/TS, Python, Go, Rust, Shell), expanded delivery patterns and quality checklist.
- **AGENTS.md description rule relaxed.** No longer enforces "Use when..." prefix — requires accurate, informative description.
- **DRY fixes: duplicate helpers consolidated into router-core.** `unique()`, `toSingleLine()`, `stripFrontmatter()` defined once, imported everywhere.
- **cascadeRoute comment numbering fixed.** Duplicate step 3 removed, cascade order 1-11 matches body.

## [0.3.2] - 2026-07-21

### Fixed

- **plugin.json version drift synced with VERSION.** plugin.json was stuck at 0.1.19 while VERSION read 0.3.1. Bumped to match canonical VERSION source.
- **validate-plugin.js now accepts `nebu-{name}` directory pattern.** Skills use `nebu-` prefix for directory names (`nebu-debugging/`) but frontmatter `name` strips it (`debugging`). Validator now accepts both exact match and `nebu-{name}` convention, fixing 10 false-positive errors.

## [0.3.1] - 2026-07-21

### Fixed

- **nebu-skills-router plugin rewritten for OpenCode's actual plugin API.** The old plugin used `chat.message`, `experimental.chat.system.transform`, and `tool.definition` hooks that do not exist in OpenCode. Replaced with `tui.prompt.append` (routing hints injected per-prompt), `session.created`, and the existing `tool.execute.before`/`after` that already worked. Plugin format changed from CommonJS to ESM for OpenCode compatibility.
- **Plugin now finds nebu skills in installed location.** Previously hardcoded to `../skills` relative to plugin dir (which resolves to `~/.config/opencode/skills/` — only caveman skills). Now prefers `~/.agents/skills/` where the installer deploys them, with fallback to project-relative path in development.
- **Installer now symlinks managed skills into `~/.config/opencode/skills/`** so OpenCode's native Agent Skills system discovers nebu skills globally, not just inside the nebu-skills project directory.

## [0.3.0] - 2026-07-21

### Changed

- **Skill display names stripped of `nebu-` prefix.** Frontmatter `name`, router constants, cascade text, docs, cross-refs, and generated exports all use short names (`debugging`, `kaizen`, `code-review`, etc.). Directory names and file paths keep the `nebu-` prefix for namespace isolation.

## [0.2.2] - 2026-07-21

### Fixed

- **nebu-skills-router plugin now actually activates.** Installer patched `opencode.json` `plugin` array to include `./plugins/nebu-skills-router.js`. Previously the file was copied but never registered — plugin never ran, so no routing hints were injected and no skills were auto-suggested.
- **First-turn routing blind spot fixed.** `system.transform` hook now runs `cascadeRoute` directly on the user's message when session state has no prior matches, so routing hints are available from turn 1 instead of turn 2+.
- **Hardened skill-loading enforcement.** System prompt now includes a CRITICAL instruction: the model MUST call `skill` at task start before any code or tools. Same mandate injected into the `skill` tool's definition description.

## [0.2.1] - 2026-07-21

### Added

- **Global coding standards injected via OpenCode instructions.** `rules/coding-standards.md` ships coding principles, C# rules, EF Core practices, and quality checklist. Installer copies it to `$OPENCODE_DIR/rules/` and patches `opencode.json` `instructions` array so it loads every session automatically. Supports idempotent reinstall — already-present entry is never duplicated.

## [0.2.0] - 2026-07-20

### Changed

- **Skills reduced from 17 to 10.** Merged overlapping skills to eliminate redundancy and make routing predictable:
  - `nebu-brainstorming` + `nebu-planning` + `nebu-kickoff` → `nebu-kickoff` (pre-execution: design, scoping, planning)
  - `nebu-implementation` → `nebu-kaizen` (mode selection + cheap-first escalation absorbed into default baseline)
  - `nebu-workspace-wrapup` → `nebu-verification` (wrap-up pattern merged into verification)
  - `nebu-refactoring` → `nebu-improve` (refactoring as a category in the audit skill)
  - `nebu-skill-improvement` → `nebu-writing-nebu-skills` (one meta-skill for writing + improvement)
  - `nebu-using-nebu-skills` removed (router always active; fallback skill served no purpose)
- **Router rewired from score-based to deterministic cascade.** Signal phrases checked in priority order; first match wins. No more ad-hoc scoring + 5 correction layers.
- **`execution_tier` added to all 10 skills.** Every skill declares its cost tier (`light`/`standard`/`heavy`):
  - `light`: `nebu-agent-workflows`, `nebu-github-issues` → Flash model, mini subagent
  - `standard`: `nebu-kaizen`, `nebu-kickoff`, `nebu-code-review`, `nebu-debugging`, `nebu-verification`, `nebu-writing-nebu-skills` → Flash model, default agent
  - `heavy`: `nebu-improve`, `nebu-ui-ux` → Pro model, high agent
- System prompt injection now shows the cascade order for transparency.
- Export script references updated: `nebu-skill-improvement` → `nebu-writing-nebu-skills`.

### Removed

- 7 skills: `nebu-brainstorming`, `nebu-planning`, `nebu-implementation`, `nebu-workspace-wrapup`, `nebu-refactoring`, `nebu-skill-improvement`, `nebu-using-nebu-skills`.
- Scoring functions (`scoreSkill`, `findMatches`) and 5 ad-hoc routing correction functions from `router-core.js`.

### Added

- `cascadeRoute()` in `router-core.js` — deterministic cascade router with phrase-based signal detection.
- Per-cascade-step signal phrase sets: `BUG_PHRASES`, `IMPROVE_PHRASES`, `UI_PHRASES`, `ISSUE_PHRASES`, `AGENT_PHRASES`, `WRITING_PHRASES`, `COMPLETION_PHRASES`, `AMBIGUITY_PHRASES`.

## [0.1.19] - 2026-07-14

### Added

- README now documents the cost-aware execution-profile mechanism (`execution_tier`/`delegation_default` frontmatter, tier table, and how hosts should read the injected "Suggested execution profile" hint).
- `nebu-improve` and `nebu-github-issues` now declare `execution_tier`/`delegation_default` (`heavy`/`prefer-subagent` and `light`/`prefer-subagent` respectively) so cheap-first routing reflects their actual default scope.
- `nebu-agent-workflows`, `nebu-planning`, `nebu-refactoring`, and `nebu-verification` gained `## Use with` cross-references for better skill-to-skill collaboration.
- The Copilot `SessionStart` hook now surfaces the same cost-aware default hint as the OpenCode router plugin.
- `scripts/validate-plugin.js` now validates `execution_tier`/`delegation_default` frontmatter values against the enums exported from `core/router-core.js`.

### Changed

- `nebu-agent-workflows` cheap-first guidance now also calls out picking the smallest/cheapest model class when a delegation surface exposes a model parameter.

## [0.1.18] - 2026-07-13

### Added

- VS Code and GitHub Copilot agent-plugin manifest with native Agent Skills and lifecycle hooks.
- Lightweight hook routing that reuses the canonical skill router without executing tools or commands.

## [0.1.17] - 2026-07-01

### Changed

- Copilot and Claude exports now push the best matching Nebu skill at task start by default, so manual skill triggers are less necessary when the fit is clear.

## [0.1.16] - 2026-06-30

### Fixed

- repaired the managed skill reinstall path so exported skill frontmatter stays parseable in editor-native skill roots

## [0.1.15] - 2026-06-30

### Added

- `nebu-improve` skill for structured codebase audits and audit-driven implementation plans

### Changed

- Router trigger hygiene: removed duplicate triggers (`version bump`, `bump version`, `release notes`, `changelog`) from `nebu-implementation` (owned by `nebu-agent-workflows`); removed `code review` from `nebu-improve` (owned by `nebu-code-review`)

### Fixed

- `check-trigger-overlap.js` now passes cleanly with no duplicate triggers

## [0.1.14] - 2026-06-09

### Changed

- remove the per-host bootstrap and update alias scripts in favor of one generic `scripts/bootstrap.*` and one generic `scripts/update.*` entrypoint per shell
- simplify the README and agent docs to document one bootstrap flow, one install flow, and one update flow instead of six host-named wrappers

## [0.1.13] - 2026-06-09

### Changed

- replace the three per-platform install entrypoints with one unified installer per shell (`scripts/install.sh` and `scripts/install.ps1`)
- centralize managed skills under `~/.agents/skills/` as the single source of truth for VS Code / Copilot and OpenCode skill discovery
- bootstrap and update entrypoints now delegate to the unified installer instead of separate per-platform install scripts
- non-default install roots now flow through `AGENTS_DIR`, `COPILOT_DIR`, `OPENCODE_DIR`, and `CLAUDE_DIR` environment variables instead of the old per-script positional installer arguments

### Fixed

- unified installer now removes older managed skill copies from `~/.copilot/skills/`, `~/.config/opencode/skills/`, and `~/.claude/skills/` so stale duplicated installs do not survive the new shared-root layout
- when `~/.claude/` already exists, the installer now recreates `~/.claude/skills` as a link back to `~/.agents/skills/` while still maintaining Claude rules under `~/.claude/rules/`

## [0.1.12] - 2026-06-09

### Changed

- centralize managed-skill cleanup and manifest helpers in the shared release helper scripts so Copilot, Claude Code, and OpenCode installers no longer duplicate the same stale-skill logic in each installer entrypoint

### Fixed

- Copilot and Claude Code installers now clean up older legacy installs from `~/.agents/skills/` during upgrades instead of leaving that legacy global path behind on machines that moved to editor-native install roots
- document the verified editor-specific install roots and clarify that `~/.agents/` is a legacy cleanup location, not the single canonical global install target across all supported editors

## [0.1.11] - 2026-06-09

### Fixed

- close the lingering issue loop around `nebu-skill-finder` host-capability gating by shipping the execute-versus-proposal rubric already present on `main` and validating that unsupported hosts fall back cleanly to proposal mode
- close the lingering PowerShell bootstrap helper-path issue by validating the managed-checkout bootstrap flow end-to-end and shipping the clearer incomplete-checkout handling already present in the bootstrap scripts

## [0.1.10] - 2026-06-09

### Changed

- router scoring now emits a cost-aware execution profile so bounded chores such as version bumps, changelog edits, and release notes default to a cheap `mini`/small-agent path with subagent preference when the host supports it
- `nebu-agent-workflows`, `nebu-implementation`, and `nebu-kaizen` now encode an explicit cheap-first escalation path so simple mechanical work stays off high-cost agents until scope or validation demands escalation

## [0.1.9] - 2026-06-05

### Changed

- `nebu-code-review`: mandatory after every code edit; review depth scales with risk but no edit skips review — tiny changes get a quick checklist pass instead of self-review bypass
- `export-platform-skills.js`: generated Copilot and Claude instructions now enforce always-invoke review rule instead of the softer handoff-only trigger

## [0.1.8] - 2026-06-03

### Fixed

- bootstrap scripts now recover older managed checkouts that are dirty only because generated `.github`, `.claude`, or `CLAUDE.md` artifacts drifted locally before retrying `git pull`
- update scripts now use the same generated-artifact recovery path before pulling a managed checkout forward

## [0.1.7] - 2026-06-03

### Changed

- `nebu-skill-finder` now defines an explicit execute-mode capability rubric for OpenCode, GitHub Copilot, Claude Code, and unknown hosts, and now falls back to proposal mode immediately when any required local runtime capability is missing or uncertain

### Fixed

- PowerShell bootstrap scripts now stop on failed `git clone` and `git pull` calls instead of surfacing a misleading missing-helper error after native git failures
- bootstrap scripts now report incomplete managed checkouts with a direct delete-and-rerun recovery hint across PowerShell and shell entrypoints

## [0.1.6] - 2026-06-03

### Changed

- `nebu-skill-finder` now ships a self-contained runtime bundle under `skills/nebu-skill-finder/runtime/`, including the helper module, cached community index, and standalone refresh script
- `scripts/export-platform-skills.js` now resyncs the bundled skill-finder runtime from the canonical helper and fetch-script sources before regenerating Copilot and Claude exports
- documented the bundled skill-finder runtime and platform packaging behavior in `README.md`

### Fixed

- fixed `nebu-skill-finder` references so OpenCode, Copilot, and Claude exports no longer depend on missing repo-root helper or script paths at runtime
- fixed concurrent Copilot and Claude installer runs so shared export generation now serializes instead of racing on `.github/skills/` and `.claude/skills/`

## [0.1.4] - 2026-06-03

### Changed

- router scoring now loads `nebu-kickoff` more aggressively for ambiguous or close-call starts and pulls `nebu-kaizen` in earlier for concrete executable requests
- `nebu-kaizen` and `nebu-kickoff` frontmatter triggers now cover more real user phrasing so both skills surface earlier from the router

## [0.1.3] - 2026-06-03

### Added

- added `scripts/tag-release.sh` and `scripts/tag-release.ps1` so release tags now derive automatically from `VERSION`, with optional push support for the current branch and tag

### Changed

- `scripts/check-release-readiness.js` now treats `scripts/tag-release.*` as release-sensitive shipped surfaces
- documented the version-based release tagging flow and dry-run checks in `README.md`

## [0.1.2] - 2026-06-03

### Changed

- `nebu-ui-ux` now defaults Playwright screenshot capture examples to `--wait-for-timeout 6000` and explicitly prefers a small `networkidle` script for lazy-loaded or highly animated pages
- `nebu-ui-ux` now tells screenshot-based vision review loops to locate each issue and apply the fix immediately unless the overall visual direction itself is in doubt

## [0.1.1] - 2026-06-03

### Changed

- documented release discipline for agents so shipped fixes now require a patch bump unless explicitly kept unreleased
- release guidance and readiness checks now call out that bootstrap and update users only receive shipped fixes after the matching stable tag exists

### Fixed

- `scripts/check-release-readiness.js` now fails when shipped install surfaces changed since the latest stable tag but `VERSION` was not bumped above that tag

## [0.1.0] - 2026-06-03

### Added

- added root `VERSION` file as the canonical release version source
- added per-platform `.nebu-skills-install.txt` manifests so users can inspect installed version, ref, and commit locally
- added `scripts/check-release-readiness.js` to validate `VERSION` and changelog structure before a release tag is cut
- added this root `CHANGELOG.md` and linked it from `README.md`

### Changed

- bootstrap and update scripts now resolve the latest stable SemVer tag before reinstalling managed assets
- stable update scripts now report the current and target managed version instead of always pulling the active branch blindly
- documented the stable release flow, release metadata, and bootstrap fallback behavior in `README.md`
- removed the `nebu-test-driven-development` skill and folded proof-oriented guidance back into `nebu-kaizen`, `nebu-debugging`, and `nebu-verification`

### Fixed

- aligned `nebu-using-nebu-skills` with the full 17-skill roster so fallback routing now explicitly covers `nebu-github-issues` and `nebu-skill-finder`
- installers and updates now remove stale managed skills during reinstall, including retired skills such as `nebu-test-driven-development`
