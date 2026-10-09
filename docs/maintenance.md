# Maintenance and releases

Contributor commands. Which files are hand-edited versus generated, and the contributor gotchas, are in [ARCHITECTURE.md](../ARCHITECTURE.md); binding rules are in [AGENTS.md](../AGENTS.md).

## Contents

- Regenerate and validate
- Releases
- Notes

## Regenerate and validate

Regenerate exported platform assets:

```bash
node ./scripts/export-platform-skills.js
```

Check trigger ownership and routing hygiene:

```bash
node ./scripts/check-trigger-overlap.js
```

Validate router nudge behavior (audit, blocked-tool guard, auto-match, review nudges):

```bash
node ./scripts/check-router-nudges.js
```

Validate the VS Code plugin contract:

```bash
node ./scripts/validate-plugin.js
```

Load the router plugin directly:

```bash
node -e "import('./plugins/agent-skills-router/server.mjs')"
```

Check release metadata before tagging:

```bash
node ./scripts/check-release-readiness.js
node ./scripts/check-release-readiness.js --require-version-entry
bash ./scripts/tag-release.sh --dry-run
```

**Windows — PowerShell:**

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\tag-release.ps1 -DryRun
```

The release-readiness check also fails when shipped install surfaces changed since the latest stable tag but `VERSION` was not bumped above that tag yet.

Issue helper for duplicate checks before filing follow-up work:

```bash
skills/ask-session-review/check-existing-issue.sh "<query>" [owner/repo]
```

## Releases

* `VERSION` is the canonical repo version.
* `CHANGELOG.md` keeps `Unreleased` plus released version entries.
* Stable bootstrap and update scripts resolve the latest `vX.Y.Z` tag before install.
* Until the first stable tag exists, bootstrap and update scripts fall back to the current checkout and print that fallback.
* User-visible fixes to shipped assets should bump at least the patch version before handoff; bootstrap and update users do not receive the fix until the matching `vX.Y.Z` tag exists.

Suggested release flow:

1. Update `VERSION` with at least a patch bump for any shipped fix.
2. Move finished items from `Unreleased` into `## [x.y.z] - YYYY-MM-DD` in `CHANGELOG.md`.
3. Run `node ./scripts/check-release-readiness.js --require-version-entry`.
4. Run `node ./scripts/export-platform-skills.js` and relevant validation commands.
5. Create the release tag from `VERSION` with `bash ./scripts/tag-release.sh` or `pwsh -NoLogo -NoProfile -File .\scripts\tag-release.ps1`.
6. Add `--push` or `-Push` when you want the current branch and tag pushed to `origin` in one step.

The tag helpers refuse dirty worktrees, require a matching changelog entry, and create an annotated `vX.Y.Z` tag directly from `VERSION`.

GitHub Actions runs the same validation on every push and pull request. A push to `main` that changes `VERSION` or `CHANGELOG.md` automatically validates the release, creates the matching annotated tag, and publishes a GitHub Release using that changelog entry. `workflow_dispatch` can be used to publish the current `VERSION` manually.

## Notes

* Claude Code is the primary harness; OpenCode and dsh reuse the shared routing core.
* Codex support is native skill discovery only; no supported Codex widget/router hook is currently available to ASK.
* Visual assets live in `assets/social-preview.png`.
* For GitHub repo cards, use `assets/social-preview.png` as the social preview image.
* Restart OpenCode after install or update.
* Bootstrap scripts store a managed checkout in `REPO_DIR` when set. Default path is `XDG_DATA_HOME/agent-skills-kit` when available, otherwise `LOCALAPPDATA\agent-skills-kit` on PowerShell, then `~/.local/share/agent-skills-kit`.
* Stable updates use the newest SemVer tag available in the managed checkout.
* `design` includes Python scripts and CSV data for design guidance and requires Python `3.8+`.
* Installers overwrite only `agent-skills-kit` managed assets and preserve unrelated user customizations.
* Installers also remove stale managed skills during reinstall or update, including skills retired from the pack.
* The unified installer writes `.agent-skills-kit-install.txt` metadata in the shared `~/.agents/` root.
* Generated platform artifacts are derived output. Edit `skills/*/SKILL.md`, then re-export.
* `rules/workflow.md` is the canonical cross-platform workflow mandate. Installers copy it to OpenCode and Claude, propagate its requirements to Copilot and dsh, and merge it into OpenCode `AGENTS.md` with an idempotent marker section.
