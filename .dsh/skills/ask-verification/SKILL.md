---
name: "verification"
description: "Use when about to claim something works, is fixed, or ready to hand off — and when a task changed one or more repos and needs intentional cleanup before stopping. Common triggers: verify, verifiëren, prove, controleren of het werkt, bewijzen dat het werkt, claim success, done, finished, ready, handoff, klaar, gereed, wrap up, hand off, task complete, finishing work, workspace done, afronden, afgerond, inleveren, cleanup, test de fix, check result, prove it works, check of het klopt, validate,..."
whenToUse: "Common triggers: verify, verifiëren, prove, controleren of het werkt, bewijzen dat het werkt, claim success, done, finished, ready, handoff, klaar, gereed, wrap up, hand off, task complete, finishing work, workspace done, afronden, afgerond, inleveren, cleanup, test de fix, check result, prove it works, check of het klopt, validate, valideren, werkt het, is het klaar."
---
# ASK Verification

Match the proof to the claim. Bigger claim, stronger evidence.

## Verification

Match the proof to the claim. Bigger claim, stronger evidence.

- **One bug fixed:** reproduce the bug path and show the focused proof now passes
- **Feature works:** run targeted tests and exercise the important path
- **Ready to merge or hand off:** run the relevant suite, build, or lint checks that cover the touched surface

### Rules

1. Use fresh evidence, not memory.
2. Verify the original symptom when possible, not just nearby tests.
3. Say plainly what was not checked.
4. Do not inflate a partial check into a full-success statement.

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
