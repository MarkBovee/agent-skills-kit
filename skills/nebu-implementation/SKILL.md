---
name: nebu-implementation
description: Implement, autopilot through a multi-step change, keep coding, continue without waiting, ga door met de implementatie, or werk de stappen af zonder onnodige stopmomenten; choose between direct work, batching, and subagent delegation.
triggers:
  - implement
  - autopilot
  - keep coding
  - continue implementation
  - work through steps
  - ga door met implementatie
  - werk de stappen af
  - codeer door
  - ga verder met de fix
  - code change
  - batch edits
  - delegate work
  - subagent
---

# Nebu Implementation

Use judgment about where the work should happen. Direct work is usually best for coupled edits; delegation is best for parallel or isolated work.

Once the path is clear, keep moving through implementation loops without waiting for approval between normal milestones or obvious next steps.

## Choose the mode

- **Direct:** known files, tight coupling, fast iteration, nuanced judgment
- **Delegate:** independent research, parallelizable subtasks, noisy command runs, or specialized review
- **Batch:** related reads, searches, and edits that can be done safely together

## Default loop

1. Pick the next meaningful chunk.
2. Create the smallest coherent change set.
3. Test the touched surface.
4. Review it against the request and surrounding patterns. If code changed, decide whether the diff needs `nebu-code-review` or a proportional self-review.
5. Continue unless a real blocker or decision point appears.

## Working rules

1. Read enough context before editing.
2. Batch related tool calls instead of thrashing.
3. Keep one lightweight source of truth for progress.
4. Re-check requirements and review depth before calling something done.
5. Reuse the repo's existing durable planning or spec system when the work needs written artifacts.
6. Escalate only real blockers, not normal uncertainty.

## Use with

- `nebu-code-review` after meaningful code edits or before handoff
- `nebu-verification` after review when making success claims

## Avoid

- Mandatory subagent-per-task workflows
- Re-reading the same files without learning anything new
- Delegating tightly coupled changes that need shared judgment
- Stopping after each edit when the next move is already obvious
- Treating process as a substitute for thinking
