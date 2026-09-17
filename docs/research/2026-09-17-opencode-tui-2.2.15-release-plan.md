# Release plan: OpenCode TUI fix 2.2.15

## Risk

Release-sensitive. The change affects the globally installed OpenCode TUI plugin and is distributed by the installer.

## Scope

| Priority | Item | Evidence | Validation |
| --- | --- | --- | --- |
| Must | Remove the TUI's CommonJS named import. | OpenCode 2.0.3 reported `isAskSkillName` as a missing named export. | Standalone TUI load has no plugin failure. |
| Must | Keep the TUI ASK roster equal to the router core roster. | The TUI still filters native skill events. | OpenCode V2 plugin check compares both rosters. |
| Must | Publish version 2.2.15 after CI and release workflow pass. | Shipped runtime files changed. | PR checks, merged `main`, tagged GitHub release. |
| Should | Remove redundant explicit global TUI entries. | The local plugin is automatically discovered by OpenCode V2. | Standalone TUI setup succeeds via discovery. |
| Could | Upgrade OpenCode from 2.0.3 to 2.0.5. | An update is available. | Deferred: not needed for this root-cause fix; revisit for normal maintenance. |

## Execution and gates

1. Verify the focused router, lifecycle, widget, dsh, export, and diff checks.
2. Plan-check the CommonJS/ESM boundary, roster-drift guard, installer compatibility, and rollback path.
3. Commit on a fix branch, open a PR, and require GitHub checks.
4. Merge only after CI passes. Trigger the repository Release workflow on `main`; it validates, tags `v2.2.15`, and creates the GitHub release.

## Audit cost decision

Use a standard independent GitHub CI and release-workflow audit. The delta is a bounded ESM runtime boundary plus regression coverage; no deep audit is warranted unless CI produces contrary evidence.

## Rollback

If the release fails in a supported OpenCode version, remove the `v2.2.15` release/tag only after maintainer review and ship a corrective patch. Do not restore the failing CommonJS named import.
