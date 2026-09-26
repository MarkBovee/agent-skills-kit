# Release plan: bounded workflows, diff-safe gates, and focused discovery 2.4.0

## Goal

Release the completed workflow-safety and research-efficiency changes from issues #99, #101, and #102 as 2.4.0. Install the release into isolated homes, verify the installed surfaces, then close the three issues only after the release is merged and verified.

## Risk

Release-sensitive. The release changes shared router state in both hosts, workflow guidance and generated exports, release metadata, and installer-visible artifacts.

## Invariant and review boundary

- **Invariant:** no validation, review, audit, or release-gate evidence may complete a release-sensitive workflow unless it names the current immutable diff identity; every code edit invalidates evidence for the previous identity.
- **Direct callers:** `core/router-core.js` workflow state/evidence helpers, `plugins/agent-skills-router/server.mjs` OpenCode edit hook, `plugins/agent-skills-router.dsh.mjs` dsh edit hook, and the canonical/generated workflow and research skill copies.
- **Excluded behavior:** no redesign of MCP servers, no unrelated router routing changes, and no issue work outside #99, #101, and #102.

## Scope

| Priority | Item | Validation |
| --- | --- | --- |
| Must | Implement #99: bounded narrow-fix review/audit workflow and metadata-only release fast path. | Focused guidance/lifecycle contract checks, source-comment checks, full repository validation. |
| Must | Implement #101: bind workflow evidence to the current immutable diff identity and invalidate completed gates/release status after code edits in OpenCode and dsh. | Regression tests for post-gate edits, both host adapters, workflow lifecycle checks. |
| Must | Implement #102: bound Home Assistant/MCP discovery searches to one capability and the smallest useful projection before fetching full schemas. | Source/export drift checks and focused research-skill contract checks. |
| Must | Keep source skills, generated exports, `VERSION`, `CHANGELOG.md`, and `.claude-plugin/plugin.json` synchronized at 2.4.0. | Export, release-readiness, installed-artifact, and diff checks. |
| Must | Merge through protected `main`, tag `v2.4.0` only after merge, install from the stable release, and verify the installed copies. | Independent review, audit, release-gate evidence, tag/release verification, isolated installer run. |
| Should | Add deterministic regression coverage for the #99 bounded-path rules and #102 discovery guidance, not only static text assertions. | Targeted checks in the existing repository validation suite. |
| Could | Improve discovery APIs or add a compact MCP projection implementation beyond repository guidance. | Defer unless implementation evidence shows the guidance alone cannot bound payload size. |
| Explicitly out | Unrelated inbox work or broad router redesign. | Revisit only from a new issue with reproduction and scope. |

## Stages and gates

1. **Plan-check:** confirm the combined scope, compatibility impact, generated-export boundaries, and release order.
2. **Implement #101:** add one shared invalidation helper, wire both hosts to it, and add regression coverage before changing behavior further.
3. **Implement #102:** update the canonical `ask-research` skill, regenerate platform exports, and add the focused contract check.
4. **Integrate #99:** retain the bounded release guidance from the existing draft implementation and resolve any conflict with diff invalidation.
5. **Validate:** run the required checks, inspect the complete tree, and verify `git diff --check`.
6. **Independent review and audit:** use separate contexts; verify requirements, stale-evidence bypasses, host parity, generated artifacts, and release metadata.
7. **Release gate:** confirm final immutable diff evidence, clean branch, merged PR, tag after merge, stable install, and live installed-artifact assertions.

## Audit cost decision and evidence record

Use the standard independent tier. The cross-cutting router change needs separate review and audit, but the affected callers are known and the regression surface is bounded. Use the #99 budget: one five-minute review, one five-minute audit, at most one three-minute delta review and one three-minute delta audit, followed by one final full validation and release gate. Do not reset the 16-minute review/audit budget across edits, handoffs, or agents.

At the release gate, record the final commit SHA as the immutable diff identity and attach separate validation, review, audit, and release-gate evidence to that SHA. Do not close issues or tag before this record exists.

## Compatibility and rollback

- Existing workflow status remains neutral for fresh sessions and non-code follow-ups.
- A code edit intentionally invalidates prior release-sensitive workflow gates; agents must rerun the affected phases for the new diff.
- Both OpenCode and dsh must expose equivalent invalidation behavior.
- Block merge, tag, install, or issue closure on failed checks or unresolved audit findings. Roll back with a follow-up revert or patch; never move an existing tag.

## Issue closure criteria

- Close #99 after the bounded workflow and metadata fast path are present in the released 2.4.0 artifacts.
- Close #101 after a post-gate code edit demonstrably returns release status to pending in both hosts.
- Close #102 after the canonical and installed research guidance requires narrow, one-capability discovery and avoids repeated broad schema searches.
