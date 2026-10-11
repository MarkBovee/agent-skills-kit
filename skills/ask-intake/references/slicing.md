# Slicing work into stages

Use when execution planning splits work into more than one stage. A stage list that cuts by layer ("schema first, then API, then UI") delays the first proof until the end. Cut by behavior instead.

## Vertical slices (tracer bullets)

- A slice cuts a narrow but complete path through every layer it needs: data, logic, interface, and the check that proves it. It is not a horizontal slab of one layer.
- A finished slice can be demonstrated or verified on its own.
- A slice fits in one fresh context window. If it needs more, split it further.
- Prefactor first: reshape the code so the change is easy, then make the easy change. The prefactor is its own slice and goes first.

## Dependencies

Give each slice its blockers: the slices that must finish before it can start. A slice with no blockers can start now. The ready frontier is every slice whose blockers are all done; for a plain chain that is simply the next one. Blockers must be real: a slice depends only on work that genuinely gates it.

## Wide refactors are the exception

A wide refactor is one mechanical change (rename a column, retype a shared symbol) whose blast radius reaches the whole codebase, so one edit breaks thousands of call sites and no vertical slice can stay green. Sequence it as expand, migrate, contract:

1. **Expand.** Add the new form next to the old one; nothing breaks.
2. **Migrate.** Move call sites over in batches sized by blast radius (per package, per directory). Each batch is its own slice, blocked by the expand, and the build stays green because the old form still exists.
3. **Contract.** Delete the old form once no caller is left. This slice is blocked by every migrate batch.

When even the batches cannot stay green alone, keep the same order but let them share an integration branch that all block a final integrate-and-verify slice; green is promised only there.

## Agree the breakdown

Present the slices as a numbered list: title, blocked by, and the behavior it delivers. Ask whether the granularity is right, whether each blocker truly gates its slice, and whether any slice should merge or split. Iterate until the user approves, then record the slices in the plan document.
