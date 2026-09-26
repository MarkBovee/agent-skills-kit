# Release plan: validation-first final gates 2.4.1

This plan covers the current candidate, metadata, and release tag: 2.4.1 / `v2.4.1`.

## Goal

Release the lifecycle correction that requires technical validation before final review, final audit, and release-gate decisions. Verify both installer paths from the merged stable tag.

## Risk

Release-sensitive. The change affects shared workflow state, OpenCode and dsh adapters, workflow guidance, generated exports, release metadata, and installer-visible documentation.

## Invariant and review boundary

- **Invariant:** unit, build/lint, and applicable integration/server validation must pass before final review; final audit must consume accepted review evidence for the exact current workflow diff; missing host diff identity blocks release-sensitive edits.
- **Direct callers:** `core/router-core.js`, `plugins/agent-skills-router/server.mjs`, `plugins/agent-skills-router.dsh.mjs`, `scripts/agent-skills-hook.js`, workflow guidance, generated exports, and release metadata.
- **Excluded behavior:** no unrelated router routing, installer architecture, or external integration changes.

## Scope

| Priority | Item | Validation |
| --- | --- | --- |
| Must | Enforce `VALIDATE → REVIEW → AUDIT → RELEASE_GATE`; make `ITERATE` conditional on findings. | Lifecycle regression checks and adapter checks. |
| Must | Prevent stale, premature, or rejected review evidence from clearing review debt. | OpenCode/dsh plugin checks and exact-diff counterexamples. |
| Must | Block release-sensitive edits when the host provides no commit or diff identity. | Adapter regression checks. |
| Must | Synchronize source skills, generated exports, release metadata, and user-facing guidance at 2.4.1. | Export, plugin, release-readiness, and diff checks. |
| Must | Merge through protected `main`, tag `v2.4.1` only after merge, and verify stable-tag installers. | Independent review, audit, release-gate, and isolated bash/PowerShell installer checks. |

## Stages and gates

1. Implement lifecycle ordering and adapter acceptance checks.
2. Run unit/targeted checks, repository checks, and installer/integration checks before review.
3. Run independent final review on the validated diff.
4. Fix findings, rerun validation, and repeat review if the diff changes.
5. Run independent final audit on the final validated and reviewed diff.
6. Commit, push a branch, merge through `main`, tag `v2.4.1`, and install from the stable tag.

## Evidence boundary

The final commit SHA after merge is the immutable release diff identity. Validation, final review, final audit, release-readiness, tag, and installer evidence must reference that merged commit or stable tag. Do not tag or release with unresolved findings or stale evidence.

## Rollback

Block merge, tag, or install on failed checks or unresolved findings. Roll back with a follow-up revert or patch; never move an existing tag.
