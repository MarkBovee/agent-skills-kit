---
name: verification
description: Use when about to claim something works, is fixed, or ready to hand off — and when a task changed one or more repos and needs intentional cleanup before stopping.
execution_tier: standard
triggers:
  - verify
  - verifiëren
  - prove
  - controleren of het werkt
  - bewijzen dat het werkt
  - claim success
  - done
  - finished
  - ready
  - handoff
  - klaar
  - gereed
  - wrap up
  - hand off
  - task complete
  - finishing work
  - workspace done
  - afronden
  - afgerond
  - inleveren
  - cleanup
  - test de fix
  - check result
  - prove it works
  - check of het klopt
  - validate
  - valideren
  - werkt het
  - is het klaar
---

# ASK Verification

Match the proof to the claim. Bigger claim, stronger evidence.

For delegated validation, report `ASK_WORKFLOW_PASS phase=VALIDATE`, `ASK_WORKFLOW_FINDINGS phase=VALIDATE`, `ASK_WORKFLOW_BLOCKED phase=VALIDATE`, or `ASK_WORKFLOW_FAILED phase=VALIDATE` with commands and evidence. Never turn a timeout, missing output, or tool failure into a pass.

Validation proves defined technical checks. It does not replace review, independent audit, or release-gate evaluation.

## Verification

Match the proof to the claim. Bigger claim, stronger evidence.

- **One bug fixed:** reproduce the bug path and show the focused proof now passes
- **Feature works:** run targeted tests and exercise the important path
- **Ready to merge or hand off:** run the relevant suite, build, or lint checks that cover the touched surface
- **Installer or deployer changed:** run the installer into an isolated home and verify the installed copies of user-visible surfaces match the repo, including a refresh over a stale existing install — a green repo-side suite says nothing about what actually got deployed
- **Any meaningful code change:** run a proportional smell scan after the main proof. Scan changed files for unbounded loops, sync-over-async, swallowed exceptions, missing cancellation, duplicated I/O or N+1 queries, hardcoded configuration, runtime artifacts, silent unknown-event handling, and relevant test gaps. Expand to a repository-wide scan for cross-module changes, audits, or explicit tech-debt work.

### Rules

1. Use fresh evidence, not memory.
2. Verify the original symptom when possible, not just nearby tests.
3. Report smell findings only with file and line or symbol evidence, concrete impact, and severity.
4. Validate likely false positives before calling them defects; classify intentional trade-offs explicitly.
5. Say plainly what was not checked.
6. Do not inflate a partial check into a full-success statement.
7. Treat repository-style preservation as a release gate: confirm the active file and nearby local style were inspected, formatting was scoped by language/file type, and a representative example still matches. For C#, verify ASK's 240-character default was applied unless `.editorconfig` explicitly overrides it; fitting signatures and calls must remain compact, newline braces must remain intact, and comments must mark meaningful workflow boundaries. Confirm that the complete Git tree has no unintended generated output or tracked `bin/`/`obj/` files. If any part is missing, do not claim completion.
8. **Discover the repository's own proof commands** from manifests, CI workflows, and documented commands; never assume a default runner.

## Quality floor

The standing bar every change must clear, separate from per-task acceptance criteria. Raising the bar is silent; lowering it is loud:

- No new lint/type suppressions, stubs, or skipped or deleted tests to get to green.
- No weakened thresholds, assertions stripped out, or previously enforced checks disabled without an explicit, accepted rationale.
- A regression test guards the original symptom and fails without its fix.

## Workspace wrap-up

Close out multi-repo work: verify integrated state, leave the workspace intentional.

1. Identify every repo touched by the task.
2. Use the repo's existing wrap-up helper or state system when one exists.
3. Check each repo: branch of record, remote target, working tree cleanliness.
4. Define the proof target for each repo before mutating anything.
5. Remove disposable worktrees before disposable branches; leave branch of record clean.
6. Before final claim, check whether the session exposed a reusable workflow improvement or skill usage gap. If so, run `session-review` to file an improvement issue.
7. Claim completion only when every touched repo is either reconciled or explicitly blocked.

## Use with

- `code-review` before verification when meaningful code changed
- `agent-workflows` when multiple agents or terminals touched different repos
- `session-review` when the session uncovered skill usage gaps worth tracking
- `write-skill` when improvement needs a new or revised skill
## Avoid

- "Should work now"
- Equating green unit tests with full integration confidence
- Hiding unverified risk behind confident wording
- Guessing integration steps when branch or remote intent is unclear
- Saying the task is done while touched repos still disagree about final state
