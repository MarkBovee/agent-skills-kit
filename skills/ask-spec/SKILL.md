---
name: spec
description: Use when building a requirements spec or design brief before code — formalizing capture, decisions, and validation gates for non-trivial or enterprise-style work. Traceability + human-owned validation before handover.
execution_tier: standard
triggers:
  - spec
  - specify requirements
  - requirements spec
  - requirements capture
  - design brief
  - decision register
  - requirements traceability
  - traceable requirements
  - validation gate
  - readiness gate
  - handover package
  - spec before build
  - truth spine
  - requirements-driven
  - requirements engineering
  - formalize requirements
  - requirements specification
  - engineering contract
  - invariant
  - proof obligation
  - counterexample
  - compatibility-sensitive
  - material requirement
---

# ASK Spec

Formalize agreed intent into one traceable specification and engineering contract before development. Humans own decisions; downstream agents should not need to rediscover intent.

## Proportionality
- **Trivial** — skip heavy spec; use `intake` or direct execution.
- **Normal** — requirements, decisions, constraints, non-goals, and observable acceptance criteria.
- **Complex, risky, or release-sensitive** — add relevant assumptions, invariants, proof obligations, counterexamples, dependencies, compatibility constraints, change impact, and audit expectations.

Classify requirements by impact: **ordinary** = local behavior; **material** = violation could affect behavior, correctness, data, compatibility, architecture, ownership, routing, security, production safety, or release readiness; **critical** = material with severe potential impact. Material and critical requirements need deeper detail. Use impact, not numeric scoring or document size. Do not catalogue every edge case.

## Flow
**Capture** — record need, context, goals, scope, non-goals, stakeholders, constraints, risks, dependencies, compatibility boundaries, open questions, and assumptions. Flag ambiguity; never assume.

**Structure** — produce one contract containing requirements, decisions, constraints, must-remain-unchanged behavior, non-goals, invariants, acceptance criteria, proof obligations, dependencies, compatibility, and change impact. Decisions record choice, owner, rationale, and status: `proposed`, `confirmed`, `rejected`, or `superseded`; only `confirmed` decisions are settled implementation input. For each material or critical requirement, preserve where relevant:

```text
Requirement → Invariant / expected behavior → Acceptance criterion → Proof obligation
```
Distinguish: requirement = must be true; invariant = must never be violated; acceptance criterion = observable behavior; proof obligation = required evidence; counterexample = how behavior or invariant could fail.

**Challenge** — make challenge investigative, not ritual. Inspect relevant requirements, existing behavior, architecture, callers, constraints, and available evidence before deciding whether a challenge applies; absence of a documented problem is not evidence that it does not exist.

For material or critical behavior, investigate applicable zero/multiple candidates, conflicting evidence, missing metadata, partial/invalid input, unsafe fallbacks, caller bypasses, ordering/determinism, dependency assumptions, and backwards-compatibility edges. Record findings, evidence-backed non-applicability, and failure modes. Derive audit targets from discovered assumptions, invariants, counterexamples, failure modes, and architectural boundaries, for example:

```text
INV-004: one authoritative ownership source
Audit target: search production callers for alternate ownership paths
```

Use this model for material assumptions; status is `unverified`, `confirmed`, or `rejected`:

```text
Assumption | Source | Owner | Status | Impact
```
Never turn an unresolved assumption or inferred behavior into a normative requirement without evidence or explicit ownership.

**Validate** — check completeness, observability, proof readiness, ownership, contradictions, readiness, and handover. Explicitly detect contradictory requirements, incompatible constraints, conflicting decisions, unsatisfiable acceptance criteria, and compatibility conflicts; never resolve them silently.

For each material requirement, connect `claim → proof obligation → required evidence`, or record why it is not directly verifiable. State what must be demonstrated, not merely a tool or command. Prefer `Given ... When ... Then ...` where it fits. Do not mark `READY` with implementation-affecting uncertainty: material ambiguity/contradiction, unowned critical decision, unverified critical assumption, missing material acceptance/proof, or unresolved compatibility. Human-owned resolution must be recorded; inference is not resolution.

**Transfer** — hand over one coherent artifact. `develop` gets build scope, confirmed decisions, constraints, must-remain-unchanged behavior, and non-goals; `verification` gets behavior, acceptance criteria, claims, proof obligations, and required evidence; `audit` gets derived targets from assumptions, invariants, counterexamples, bypass/fallback paths, determinism, compatibility risks, and architectural boundaries.

## Traceability
`Need → Context → Decision → Requirement → Invariant → Acceptance → Proof → Handover → Build`
For requirements and evidence, track source, status, and relationship. Assign owners where decision authority is real: decisions, assumptions, and stakeholder-owned constraints. Every material requirement needs a proof obligation or an explicit reason it is not directly verifiable.

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
