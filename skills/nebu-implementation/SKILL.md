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

## Choose the mode

- **Direct:** known files, tight coupling, fast iteration, nuanced judgment
- **Delegate:** independent research, parallelizable subtasks, noisy command runs, or specialized review
- **Batch:** related reads, searches, and edits that can be done safely together

## Working rules

1. Read enough context before editing.
2. Batch related tool calls instead of thrashing.
3. Keep one lightweight source of truth for progress.
4. Re-check requirements before calling something done.
5. Escalate only real blockers, not normal uncertainty.

## Avoid

- Mandatory subagent-per-task workflows
- Re-reading the same files without learning anything new
- Delegating tightly coupled changes that need shared judgment
- Treating process as a substitute for thinking
