---
name: "spec"
description: "Use when building a requirements spec or design brief before code — formalizing capture, decisions, and validation gates for non-trivial or enterprise-style work. Traceability + human-owned validation before handover. Common triggers: spec, specify requirements, requirements spec, requirements capture, design brief, decision register, requirements traceability, traceable requirements, validation gate, readiness gate, handover package, spec before build, truth spine, requirements-driven, requirements engineering, formalize requirements, requirements specification, engineering contract, invariant, proof obligation, counterexample, compatibility-sensitive."
---
# ASK Spec

Formalize agreed intent into one traceable specification and engineering contract before development. Humans own decisions.

## Proportionality

- **Trivial** — skip heavy spec; use `intake` or direct execution.
- **Normal** — requirements, decisions, constraints, non-goals, and observable acceptance criteria.
- **Complex, risky, or release-sensitive** — add relevant assumptions, invariants, proof obligations, counterexamples, dependencies, compatibility constraints, change impact, and audit expectations.
Do not catalogue every edge case. Add detail where ambiguity, failure risk, architecture, ownership, routing, migration, or compatibility makes it valuable.

## Flow

**Capture** — record need, context, goals, scope, non-goals, stakeholders, constraints, risks, dependencies, compatibility boundaries, open questions, and assumptions. Flag ambiguity; never assume.

**Structure** — produce one contract containing:
- Requirements: what must be true.
- Decisions: what was chosen, by whom, and why.
- Constraints: what limits the solution or must not change.
- Invariants: what must never be violated.
- Acceptance criteria: how behavior can be observed.
- Proof obligations: what evidence is needed before claiming success.
- Dependencies, compatibility, non-goals, and change impact.
For material requirements, preserve where relevant:

```text
Requirement → Invariant / expected behavior → Acceptance criterion → Proof obligation
```
Distinguish: requirement = must be true; invariant = must never be violated; acceptance criterion = observable behavior; proof obligation = required evidence; counterexample = how behavior or invariant could fail.

**Challenge** — search proportionally for zero/multiple candidates, conflicting evidence, missing metadata, partial/invalid input, unsafe fallbacks, caller bypasses, ordering/determinism failures, dependency assumptions, and backwards-compatibility edges. Record critical assumptions and failure modes.

Use this model for material assumptions:

```text
Assumption | Source | Owner | Status | Impact
```
Status is `unverified`, `confirmed`, or `rejected`. Never turn an unresolved assumption or inferred behavior into a normative requirement without evidence or explicit ownership.

**Validate** — check completeness, observability, proof readiness, decision/assumption ownership, readiness, and handover. Prefer `Given ... When ... Then ...` for acceptance criteria where it fits. Do not perform implementation proof, review, or audit here.

**Transfer** — hand over one coherent artifact. `develop` gets build scope, settled decisions, constraints, and non-goals; `verification` gets behavior, acceptance criteria, and proof obligations; `audit` gets assumptions, invariants, counterexamples, bypass/fallback, determinism, and compatibility risks.

## Traceability

`Need → Context → Decision → Requirement → Invariant → Acceptance → Proof → Handover → Build`
Give material objects a source, owner, status, and relationship so downstream work and change impact stay traceable.

## Use with

- `intake` for scope clarification and exploration when full formalization is overkill
- `develop` after validation, to build against the contract
- `verification` to execute proof obligations
- `code-review` to review implementation against the contract
- `improve` for independent audit of assumptions, counterexamples, bypasses, fallbacks, determinism, or compatibility

## Avoid

- Heavy specs for trivial work
- Letting AI own decisions or treating assumptions as facts
- Parallel spec trees when a durable planning system exists
- Requiring every contract concept for every requirement
- Performing verification, review, or audit inside this phase
