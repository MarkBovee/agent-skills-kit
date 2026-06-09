# Changelog

All notable changes to `nebu-skills` live here.

Format follows Keep a Changelog. Stable releases use SemVer tags in `vX.Y.Z` form.

## Unreleased

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
