---
name: nebu-implementation
description: Use when implementing a multi-step change and choosing between direct work, batching, and subagent delegation.
triggers:
  - implement
  - code change
  - batch edits
  - delegate work
  - subagent
---

# Nebu Implementation

Use judgment about where the work should happen. Direct work is usually best for coupled edits; delegation is best for parallel or isolated work.

Once the path is clear, keep moving through implementation loops without waiting for approval between normal milestones.

## Choose the mode

- **Direct:** known files, tight coupling, fast iteration, nuanced judgment
- **Delegate:** independent research, parallelizable subtasks, noisy command runs, or specialized review
- **Batch:** related reads, searches, and edits that can be done safely together

## Default loop

1. Pick the next meaningful chunk.
2. Create the smallest coherent change set.
3. Test the touched surface.
4. Review it against the request and surrounding patterns.
5. Continue unless a real blocker or decision point appears.

## Working rules

1. Read enough context before editing.
2. Batch related tool calls instead of thrashing.
3. Keep one lightweight source of truth for progress.
4. Re-check requirements before calling something done.
5. Reuse the repo's existing durable planning or spec system when the work needs written artifacts.
6. Escalate only real blockers, not normal uncertainty.

## Avoid

- Mandatory subagent-per-task workflows
- Re-reading the same files without learning anything new
- Delegating tightly coupled changes that need shared judgment
- Stopping after each edit when the next move is already obvious
- Treating process as a substitute for thinking
