# OpenCode sidebar color regression release

## Goal

Keep the Agent Skills Kit sidebar's visual hierarchy colored in every OpenCode theme instead of allowing invalid theme-token reads to fall back to white, then release the pending 2.2.9 changes through the protected-main workflow.

## Risk

Release-sensitive. The TUI is a separately loaded OpenCode runtime, and the pending `a5e68b8` changes already carry the unreleased 2.2.9 version.

## Scope

### Must

- Restore stable explicit colors for the sidebar title, section headings, loaded skills, muted empty state, and pending items.
- Add a regression check that fails if the TUI stops using the stable sidebar palette or returns to the invalid `api.theme.<token>` shape.
- Preserve the existing reactive sidebar status behavior and both installer paths.
- Retain the pending 2.2.9 version and add the color fix to its changelog entry; `v2.2.9` is not published yet and `v2.2.8` is the latest stable tag.
- Create a `fix/` branch, commit, push, open and merge a PR after `validate` passes, then confirm the release workflow creates `v2.2.9` and its GitHub release.

### Should

- Verify the installed artifact surface as well as repository checks.

### Could

- Switch the palette to `api.theme.current` semantic tokens.

Deferred: a branded, explicit palette is deliberate here because the exact theme API mismatch caused the regression and the sidebar must remain legible even when a host theme is incomplete. Revisit if OpenCode provides a stable plugin color abstraction with documented fallbacks.

## Plan

1. Add the failing static contract for the stable sidebar palette.
2. Restore the explicit palette in the OpenCode TUI and record the fix in 2.2.9's changelog entry.
3. Run the focused check, full repository release checks, export generation, and isolated-install verification.
4. Commit and push `fix/sidebar-theme-colors`, open a PR, wait for the required `validate` check, merge it, then verify the automated release workflow, `v2.2.9` tag, and GitHub release.

## Plan check

- Affected callers: OpenCode TUI entry and static regression checks; installers continue deploying the same TUI entry unchanged.
- Compatibility: use the known-supported literal color input rather than an undocumented or incorrectly shaped theme object.
- Fallback: no host token lookup is required, so a partial or monochrome host theme cannot erase the sidebar's hierarchy.
- Determinism: the check asserts all five palette roles and rejects the old invalid token source.
- Proof: focused regression check, release validation suite, generated-export cleanliness, isolated-install test, required GitHub CI, merged-main release workflow, tag, and release record.
- Independent audit: `standard` cost tier is sufficient for this one-file presentation delta; a separate reviewer/auditor is required before the release gate, but this harness's developer instruction forbids spawning subagents unless explicitly requested. The CI and protected-branch review remain mandatory external gates.
