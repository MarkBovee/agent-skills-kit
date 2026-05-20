---
name: nebu-kaizen
description: Use when you want the default Nebu operating mode for normal software work: small safe iterations, built-in validation, and no unnecessary pauses between clear next steps.
triggers:
  - kaizen
  - default workflow
  - continuous improvement
  - improve code quality
  - process improvement
  - standard way of working
---

# Nebu Kaizen

Default to steady progress: inspect, create, test, review, continue.

## Core loop

1. Inspect the next boundary that matters.
2. Create the smallest coherent improvement.
3. Test it with the fastest trustworthy proof.
4. Review it for clarity, safety, consistency, and scope.
5. Keep going until the goal is done or a real blocker appears.

## Default rules

1. Do not stop after every milestone when the next step is already clear.
2. Ask only when the answer changes scope, product behavior, architecture, safety, or acceptance.
3. Prefer preventing mistakes early with types, validation, guards, and simpler control flow.
4. Follow existing repo patterns before inventing new ones.
5. Build only what the current requirement needs.
6. Reuse the repo's existing durable planning or spec system when one exists; do not create a parallel doc tree by default.

## Use with

- `nebu-kickoff` for ambiguity that could change the implementation
- `nebu-planning` when sequencing or coordination needs a plan
- `nebu-implementation` for coupled edits and execution choices
- `nebu-debugging` for bugs, failing tests, and broken builds
- `nebu-refactoring` when the work is cleanup or simplification
- `nebu-verification` before claiming success

## Avoid

- big-bang rewrites when an incremental change will do
- speculative abstractions or future-proofing theater
- repeated approval pauses during obvious execution
- leaving small in-scope paper cuts behind when they are cheap to fix safely
