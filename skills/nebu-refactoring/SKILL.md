---
name: nebu-refactoring
description: Use when the request is to refactor, simplify, clean up, restructure, deduplicate, or remove over-engineering in an existing codebase.
triggers:
  - refactor this
  - code cleanup
  - simplify this code
  - remove over-engineering
  - deduplicate logic
  - restructure this code
  - reduce complexity
  - untangle this
  - clean architecture mess
---

# Nebu Refactoring

Simplify the code without turning the change into a rewrite.

Refactor incrementally: remove one real source of complexity, validate, then decide whether another pass is still worth it.

## Use this when

- the user explicitly asks for a refactor or cleanup
- the code works but is hard to change safely
- duplication, deep nesting, or noisy indirection is the real problem
- a small structural change would reduce risk or confusion

## Goal

Make the smallest change that removes real complexity while preserving behavior.

Repository-specific instructions win over this skill.

## Working pattern

1. Find the actual pain point, not the most stylistically ugly code.
2. Identify the smallest owning area.
3. Choose one high-leverage simplification.
4. Implement the smallest coherent change set.
5. Validate the touched surface and self-review the result.
6. Stop when the main complexity is gone.

## Good refactors

- remove duplication that is already costing maintenance
- flatten control flow with guard clauses or clearer branching
- extract one well-named helper when it clarifies the main path
- delete dead code and unused layers
- replace pattern-heavy indirection with direct code when the abstraction adds no value
- move related code closer together when structure is the problem
- improve naming when it reduces ambiguity in an important path

## Avoid

- broad rewrites because code "could be cleaner"
- renames, file moves, or churn without reducing coupling or confusion
- new abstractions for a single current use case
- splitting code into many tiny wrappers with no clarity gain
- style-only rewrites in untouched areas
- changing public contracts unless the task requires it

## Decision rules

- prefer deletion over indirection
- prefer extraction over rewrites
- prefer composition over inheritance unless the shared behavior is stable and substantial
- prefer existing helpers before adding new ones
- keep APIs stable unless the refactor needs a contract change
- reuse the repo's existing planning or spec system if the refactor needs durable notes
- if the best refactor is leaving code alone, leave it alone

## Validation

- validate behavior proportionally to the change
- run the nearest relevant tests, build, or lint path first
- if validation cost becomes large, reconsider refactor size

## Output

When summarizing, focus on:

- what complexity was removed
- why this was the smallest useful refactor
- what behavior was kept stable
- what was validated

Keep it understandable for a mid-level developer.
