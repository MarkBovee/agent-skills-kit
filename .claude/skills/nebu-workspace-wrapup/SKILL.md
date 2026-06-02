---
name: "nebu-workspace-wrapup"
description: "Use when a task changed one or more repos in this workspace and you are about to claim completion, hand off work, or stop with done/fixed/finished wording."
when_to_use: "Common triggers: wrap up, hand off, task complete, finishing work, workspace done, afronden, afgerond, inleveren."
---
# Nebu Workspace Wrap-Up

Close out multi-repo work only after the integrated state is proven and the workspace is left intentional.

## Pattern

1. Identify every repo touched by the task, even if one looks clean now.
2. Use the repo's existing wrap-up helper or state system when one exists; do not invent parallel state.
3. Check each touched repo before mutating anything: branch of record, remote target, working tree cleanliness, and task worktrees or branches still in scope.
4. Define the proof target for each changed repo before cleanup: what remote or integrated state must exist for the task to count as finished.
5. Run a no-mutation check first. If the integration or cleanup path is ambiguous, stop and report `blocked`.
6. Apply cleanup only after the proof target is unambiguous and verified.
7. Remove disposable worktrees before disposable branches, and leave the branch of record clean at the end.
8. Before final done claim, check whether the session exposed a reusable workflow improvement worth capturing.
9. Claim completion only when every touched repo is either reconciled or explicitly blocked with a reason.

## Rules

- Treat the repo's own helper or state writer as the source of truth when one exists.
- Re-check remote state before final cleanup if the task depended on a frozen expectation.
- Keep nested-repo and umbrella-repo state consistent; do not leave accidental drift behind.
- Report what was proven, what was cleaned up, and what remains blocked.

## Use with

- `nebu-verification` to match the final claim to the proof you actually gathered
- `nebu-agent-workflows` when multiple agents or terminals touched different repos in the same workspace
- `nebu-skill-improvement` when the session uncovered reusable process or routing gaps

## Avoid

- inventing missing task metadata during wrap-up
- cleaning unrelated git dirt just to make the task look finished
- guessing integration steps when branch or remote intent is unclear
- deleting branches before worktrees or before integration proof exists
- saying the task is done while touched repos still disagree about final state
