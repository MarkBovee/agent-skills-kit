# Release 2.2.19 Plan

**Risk:** release-sensitive.

## Goal

Release the OpenCode native `patch`-tool guard and the scoped ASK-only session review policy. Retire the stale `fix/opencode-v2-plugin-migration` branch without merging its superseded changes.

## Scope

### Must

1. Treat OpenCode's `patch` tool as a code edit in the core router, OpenCode router, and dsh router; keep regression checks for both the skill gate and code-review debt.
2. Restrict session-review self-review candidates to canonical ASK skills from the source checkout or installed/shared ASK root. Project-specific skills, including `ebusd-expert` owned by `MarkBovee/vaillant-ebus`, must not create an ASK issue or improvement flag.
3. Regenerate all platform skill exports and retain the source/export contract check.
4. Bump `VERSION`, `.claude-plugin/plugin.json`, and `CHANGELOG.md` to `2.2.19` with the scoped fixes.
5. Run the full release validation suite, source-comment check, generated-output check, installer verification, independent review, and independent audit.
6. Create, validate, merge, and verify a PR to `main`; confirm the main-triggered release workflow creates `v2.2.19` and its GitHub release.
7. Correct issue #90 to track the session-review scope defect, then close it only after the merged release contains the fix.
8. Delete local and remote `fix/opencode-v2-plugin-migration` after confirming its PR #78 was merged and its remaining commits are superseded by later `main` releases.

### Should

- Record the historical local/remote mismatches for annotated tags `v1.6.1` and `v1.9.2` without overwriting either tag.

### Could

- Repair the historical tag mismatch.

Deferred because it predates this release and changing published tags is destructive. Revisit if a fresh-clone release check or GitHub tag validation exposes a current integrity failure.

## Plan

1. Independently review the current release diff and audit branch-retirement evidence.
2. Update release metadata and generated artifacts; amend issue #90 to the actual session-review defect.
3. Run repository release checks and a clean-tree/tag dry run on the release candidate.
4. Create and push a release PR, require green CI and independent review/audit evidence, then merge to `main`.
5. Verify the release workflow, `v2.2.19` tag, GitHub release, issue closure, and branch deletion.

## Plan Check

- **Branch evidence:** PR #78 merged at `b069a21`; `fix/opencode-v2-plugin-migration` has four older unmerged commits from 2026-09-16. Their sidebar behavior is superseded by main's later v2.2.9 through v2.2.18 fixes. `git merge-tree` reports conflicts with current release metadata and sidebar logic, so merging is unsafe.
- **Compatibility:** `patch` joins existing `edit`, `write`, and `apply_patch` aliases without changing unrelated tools. Session-review keeps explicit general issue filing available for user-requested project issues.
- **Fallback:** external project skill gaps are reported with their owner/repository instead of silently being converted to ASK improvement debt.
- **Determinism:** static checks assert the session-review scope, while OpenCode V2 and dsh checks exercise the native `patch` tool path.
- **Audit cost:** standard independent audit, limited to the current diff, stale-branch retirement evidence, versioning, and release workflow. Escalate only if a compatibility or release-integrity finding appears.
- **Known constraint:** `git fetch --tags` reports divergent local historical objects for `v1.6.1` and `v1.9.2`; no published tag will be rewritten in this release.
