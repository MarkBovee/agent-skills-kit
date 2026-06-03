# Changelog

All notable changes to `nebu-skills` live here.

Format follows Keep a Changelog. Stable releases use SemVer tags in `vX.Y.Z` form.

## Unreleased

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
