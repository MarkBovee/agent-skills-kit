---
name: nebu-kaizen
description: Default baseline skill for normal software work where the next logical step is clear: small safe iterations, built-in validation, and no unnecessary pauses between clear next steps. Use this for autopilot mode, keep going, ga door, werk door, or werk de stappen af zonder onnodige stopmomenten.
default: true
triggers:
  - kaizen
  - autopilot
  - keep going
  - continue without waiting
  - do not stop
  - don't stop
  - ga door
  - werk door
  - volgende logische stap
  - volgende stap
  - zonder te wachten
  - niet stoppen
  - gewoon doorgaan
  - ga verder
---

# Nebu Kaizen

Default to steady progress: inspect, create, test, review, continue.

If the next logical step is clear, keep going in autopilot mode instead of pausing for routine check-ins.

This also applies when the user phrases it in Dutch, such as `ga door`, `werk door`, `ga verder`, or `zonder te wachten`.

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
6. After code changes, do a proportional review pass. Load `nebu-code-review` when the diff is meaningful, subtle, or risky; tiny local diffs may stay self-reviewed.
7. When work reveals reusable workflow friction, capture the smallest durable improvement instead of treating it as one-off noise.
8. Reuse the repo's existing durable planning or spec system when one exists; do not create a parallel doc tree by default.
9. When editing code, add concise intent comments by default; place one short comment above each function unless the repo's local convention says otherwise.

## Use with

- `nebu-kickoff` for ambiguity that could change the implementation
- `nebu-planning` when sequencing or coordination needs a plan
- `nebu-implementation` for coupled edits and execution choices
- `nebu-code-review` after meaningful code edits and before handoff
- `nebu-debugging` for bugs, failing tests, and broken builds
- `nebu-refactoring` when the work is cleanup or simplification
- `nebu-skill-improvement` when repeated friction should become reusable skill or router fix
- `nebu-verification` before claiming success

## Avoid

- big-bang rewrites when an incremental change will do
- speculative abstractions or future-proofing theater
- repeated approval pauses during obvious execution
- leaving small in-scope paper cuts behind when they are cheap to fix safely
