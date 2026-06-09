---
name: "nebu-implementation"
description: "Use when implementing a multi-step change and the right mode is not yet obvious: pick between direct work, batching related edits, and subagent delegation. Add this on top of nebu-kaizen when the work needs an explicit mode decision."
when_to_use: "Common triggers: implement, implementeer dit, keep coding, continue implementation, work through steps, code change, batch edits, delegate work, subagent, maak dit werkend, version bump, bump version, release notes, changelog."
---
# Nebu Implementation

Use judgment about where the work should happen. Direct work is usually best for coupled edits; delegation is best for parallel or isolated work.

Once the path is clear, keep moving through implementation loops without waiting for approval between normal milestones or obvious next steps.

## Choose the mode

- **Direct:** known files, tight coupling, fast iteration, nuanced judgment
- **Delegate:** independent research, parallelizable subtasks, noisy command runs, or specialized review
- **Batch:** related reads, searches, and edits that can be done safely together

## Cheap-first escalation path

1. Start bounded mechanical chores on the smallest viable agent or subagent.
2. Validate the result before widening context.
3. Escalate to the default agent only if scope grows beyond the original bounded task.
4. Escalate to high or xhigh only for cross-cutting, analysis-heavy, or repeatedly failing work.

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
7. When editing code, follow the coding standards in `AGENTS.md` (`## Coding standards`). The intent-comment rule is a **hard rule**: every function, method, helper, closure handler, route handler, protocol dispatcher, and static utility gets a short comment above it. Add a brief docstring for non-obvious parameters, return values, side effects, or preconditions. Inline `why` comments stay focused on intent, not line-by-line narration.

## Use with

- `nebu-code-review` after meaningful code edits or before handoff
- `nebu-verification` after review when making success claims

## Avoid

- Mandatory subagent-per-task workflows
- defaulting simple release chores to an expensive agent before trying the cheap path
- Re-reading the same files without learning anything new
- Delegating tightly coupled changes that need shared judgment
- Stopping after each edit when the next move is already obvious
- Treating process as a substitute for thinking
