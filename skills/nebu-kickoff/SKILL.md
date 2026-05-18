---
name: nebu-kickoff
description: Use when starting ambiguous, cross-cutting, or behavior-changing work and the goal, constraints, or success criteria are not yet crisp.
triggers:
  - ambiguous request
  - unclear scope
  - behavior-changing work
  - fuzzy requirements
  - what should we build
---

# Nebu Kickoff

Clarify enough to avoid wrong work, then move.

## Pattern

1. Inspect the relevant code, docs, or current behavior first.
2. If the task is obvious and local, state the working assumption and start.
3. If ambiguity would change the implementation, ask one focused question at a time.
4. Offer alternatives only when there is a real tradeoff; otherwise recommend one path.
5. For bigger work, capture a short problem statement, constraints, and chosen path before coding.

## Focus areas

- What outcome matters?
- What is in or out of scope?
- What behavior must not change?
- What proof will count as done?

## Avoid

- Turning every request into a formal spec exercise
- Asking curiosity questions that do not change the work
- Blocking obvious fixes on unnecessary approval loops
- Generating big design docs for small local changes
