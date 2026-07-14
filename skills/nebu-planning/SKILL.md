---
name: nebu-planning
description: Use when work spans multiple files, phases, or decisions and a short execution plan would reduce mistakes or thrash.
triggers:
  - plan
  - plannen
  - multi-file work
  - multi-phase work
  - migration
  - sequencing risk
  - start planning
  - start with a plan
  - werk voorplannen
---

# Nebu Planning

Plan only when the task is large enough to benefit from one. The plan should be just detailed enough to guide execution and review, then support autonomous progress.

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
5. If the repo already has a durable planning or spec system, update the active record there instead of creating a parallel documentation tree.

## Durable planning systems

- Detect an existing planning or change-management system from the repo before creating new planning artifacts.
- If one is active, treat it as the durable source of truth and keep meaningful decisions, blockers, scope changes, and task state there.
- If more than one candidate exists or the active record is unclear, ask one short question instead of guessing.
- Never create a parallel branded planning tree by default.

## Use with

- `nebu-kickoff` when scope or success criteria are still unclear before a plan can be written
- `nebu-implementation` to execute the plan once sequencing is set

## Avoid

- Giant plan files full of placeholder code
- Task lists so tiny they are slower than the work
- Freezing a plan that is clearly wrong after investigation
