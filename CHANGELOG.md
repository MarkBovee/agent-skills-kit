# Changelog

All notable changes to `nebu-skills` live here.

Format follows Keep a Changelog. Stable releases use SemVer tags in `vX.Y.Z` form.

## Unreleased

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
