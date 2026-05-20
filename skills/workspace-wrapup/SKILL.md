---
name: workspace-wrapup
description: Use when a task changed one or more repos in this workspace and you are about to claim completion, hand off work, or stop with done/fixed/finished wording
triggers:
  - wrap up
  - hand off
  - task complete
  - finishing work
  - workspace done
---

# Workspace Wrap-Up

## Overview

Use this skill when wrap-up is the completion gate for a task that touched one or more repos in this workspace. The rule is fail-closed: a touched repo is not done until wrap-up state exists, the remote branch of record matches the expected integrated tree, disposable task resources are cleaned up, and the final workspace is clean.

This skill assumes the target workspace already ships the helper script it references. Install the skill globally, but only use it inside repos that include the matching wrap-up helper.

## When to Use

- One or more repos in this workspace were touched by the task.
- You are about to claim completion, hand off work, or stop with done/fixed/finished wording.
- You need to prove integration after direct-on-branch work, topic-branch work, rebases, cherry-picks, or squash merges.
- You need to reconcile nested repo work with the umbrella repo.
- A zero-touch task still initialized wrap-up state and needs confirmation that no wrap-up mutations are required.

Do not use this skill to invent missing task metadata, silently adopt dirty baselines, or clean unrelated git dirt.

| Mode | Mutates repos | Success result |
| --- | --- | --- |
| `check` | No | `ready` or `blocked` |
| `recover` | No | Always returns `blocked` with a recovery fingerprint |
| `apply` | Yes, when safe | `completed` or `blocked` |

## State Model

- The helper script is the **sole state writer**. Locate it via the repo's script directory convention (e.g. `scripts/wrapup-helper` or the repo's documented path).
- Initialize state before any possible repo touch.
- Every touched repo stays in scope even if it looks clean later.
- Per repo, state must record: repo path, branch of record, matching remote branch, baseline mode, adopted baseline when used, source branch when used, start head, expected integrated tree, frozen remote head, tracked topic branches, and tracked worktrees.
- Branch and worktree entries carry independent `ownership` (`created` or `preexisting-used`) and `disposition` (`delete-on-wrapup` or `preserve`) flags.
- `expectedIntegratedTree` is mutable only until wrap-up starts. Once `check` or `apply` begins, the frozen tree and frozen remote head are the proof target for that run.
- If state is missing or corrupt, `recover` may reconstruct a candidate, but `apply` must refuse it until the helper confirms the matching fingerprint.

### Helper quick reference

Replace `<helper>` with the wrap-up helper script path for the target repo.

```
<helper> -Action initialize -StatePath <path> -UmbrellaRepo <repo>
<helper> -Action register-repo -StatePath <path> -RepoPath <repo>
<helper> -Action assert-clean-start -StatePath <path> -RepoPath <repo>
<helper> -Action adopt-divergence -StatePath <path> -RepoPath <repo> -LocalHead <sha> -RemoteHead <sha>
<helper> -Action set-expected-tree -StatePath <path> -RepoPath <repo> -ExpectedIntegratedTree <tree>
<helper> -Action freeze-expected-tree -StatePath <path> -RepoPath <repo> -RemoteHead <sha>
<helper> -Action confirm-recovery -StatePath <path> -RecoveryFingerprint <hash>
```

## Check Mode

Use `check` to answer: "Can wrap-up complete right now without guessing?"

1. Load the state artifact. If it is missing or corrupt, stop and point to `recover`.
2. If `repos` is empty, report `ready` and no actions.
3. For each touched repo:
   - verify the repo, branch, and worktree evidence still matches state
   - block if git evidence suggests an untracked touched repo, task branch, or task worktree
   - verify `branchOfRecord`, `remoteBranch`, and `expectedIntegratedTree` are present when the repo changed
   - verify the working tree is clean before any integration step
   - verify the fetched remote head still matches `remoteHeadWhenTreeFrozen`
   - if remote already matches `expectedIntegratedTree`, mark the repo ready for cleanup-only wrap-up
   - otherwise plan the exact integration and push steps needed, but do not mutate anything
4. If a nested repo was touched, verify the umbrella reconciliation path is explicit: either the umbrella repo is part of the deliverable or the nested repo will return locally to the umbrella-recorded commit after remote proof.

Use command shapes like:

```
git status --short --branch
git worktree list --porcelain
git rev-parse HEAD
git rev-parse <remote-branch>
git rev-parse HEAD^{tree}
git rev-list --left-right --count HEAD...<remote-branch>
git merge-base --is-ancestor <commit> <branch>
git submodule status --recursive
```

## Recover Mode

Use `recover` only when the state artifact is missing or corrupt.

1. Read git evidence without mutating repos.
2. Reconstruct a candidate state artifact from current branches, worktrees, and repo relationships.
3. Return:
   - the candidate artifact
   - a recovery fingerprint
   - a `blocked` result
4. Do **not** continue into `apply` automatically.
5. Before `apply`, confirm the recovered state with the helper:

```
<helper> -Action confirm-recovery -StatePath <path> -RecoveryFingerprint <hash>
```

If the fingerprint does not match the candidate recovery output, stay blocked.

## Apply Mode

Use `apply` only after `check` says the path is unambiguous.

1. Re-run `check` validation first.
2. If `repos` is empty, return `completed` without repo mutations.
3. For each touched repo:
   - integrate task work into the branch of record only when the source branch, target branch, and merge path are unambiguous
   - stop if conflict resolution, branch choice, or policy judgment is required
   - verify the remote branch head has not changed since freeze
   - if remote already matches `expectedIntegratedTree`, skip the push
   - otherwise push the branch of record and re-check the remote tree hash
   - remove disposable task worktrees before deleting disposable task branches
   - delete local and remote disposable branches only after integration proof exists
   - end on the local branch of record with a clean working tree
4. Reconcile nested repos with the umbrella repo:
   - **umbrella not deliverable:** after remote proof, move the nested repo's local branch of record back to the umbrella-recorded commit so the umbrella repo is clean again; block if that commit is not safely on the branch of record
   - **umbrella deliverable:** update the umbrella repo's submodule pointer intentionally, include the umbrella repo in the touched-repo set, and complete wrap-up for it too
5. Return `completed` only when every touched repo is done. This is all-or-nothing at the task level, but it is **not** transactional rollback: repos already completed stay completed if a later repo blocks.

## Common Mistakes

- **Skipping state initialization:** every task gets a state artifact, even zero-touch tasks.
- **Treating commit reachability as proof:** use the remote tree hash, not original commit reachability.
- **Guessing missing metadata during wrap-up:** the helper is the sole state writer; untracked evidence blocks wrap-up.
- **Ignoring remote drift after freeze:** if the remote head changed, refresh local integration and freeze a new tree.
- **Deleting branches before worktrees:** remove disposable worktrees first.
- **Silently keeping umbrella drift:** nested repo work must leave the umbrella repo clean unless the umbrella repo is intentionally part of the deliverable.
- **Proceeding after partial cleanup failure:** remote branch deletion failure, dirty final state, or unresolved umbrella drift keeps the task blocked.

### Blocked conditions

- dirty repo at first touch
- ahead, behind, or diverged branch of record without explicit adopted baseline
- dirty umbrella repo when nested work first begins
- missing or corrupt state without confirmed recovery
- untracked touched repo, task branch, or task worktree evidence
- missing expected integrated tree for a changed repo
- remote head changed after freeze
- remote branch does not match the expected integrated tree
- ambiguous integration or cleanup path
- failed push, failed remote deletion, or failed worktree removal
- touched nested repo leaves the umbrella repo dirty without an explicit deliverable path
