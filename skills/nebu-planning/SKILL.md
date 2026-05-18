---
name: nebu-planning
description: Use when work spans multiple files, phases, or decisions and a short execution plan would reduce mistakes or thrash.
triggers:
  - plan
  - multi-file work
  - multi-phase work
  - migration
  - sequencing risk
---

# Nebu Planning

Plan only when the task is large enough to benefit from one. The plan should be just detailed enough to guide execution and review.

## Good plan shape

- Goal in one or two sentences
- Files or areas likely to change
- Ordered work chunks
- Key risks or open questions
- Validation needed before claiming done

## Sizing

- Skip the plan for one or two obvious edits.
- Use a short bullet plan for normal multi-step work.
- Use a fuller plan only when sequencing, migration, or coordination risk is high.

## Rules

1. Optimize for clarity, not completeness theater.
2. Prefer chunks that map to meaningful progress, not 2-minute micro-steps.
3. Include only the details that reduce wrong turns.
4. Update the plan when reality changes.
5. If you are actively working an OpenSpec change, mirror durable plan updates back into the change artifacts instead of leaving them only in `plan.md`.

## OpenSpec sync

- Treat `plan.md` as session scratch space, not the durable record for an active OpenSpec change.
- When a plan update adds a real decision, blocker, scope change, or implementation detail, write it to the matching artifact:
  - `proposal.md` for scope changes
  - `specs/.../spec.md` for requirement changes
  - `design.md` for decisions, findings, and blockers
  - `tasks.md` for execution state and newly discovered work

## Avoid

- Giant plan files full of placeholder code
- Task lists so tiny they are slower than the work
- Freezing a plan that is clearly wrong after investigation
