---
name: "spec"
description: "Use when building a requirements spec or design brief before code — formalizing capture, decisions, and validation gates for non-trivial or enterprise-style work. Traceability + human-owned validation before handover."
when_to_use: "Common triggers: spec, specify requirements, requirements spec, requirements capture, design brief, decision register, requirements traceability, traceable requirements, validation gate, readiness gate, handover package, spec before build, truth spine, requirements-driven, requirements engineering, formalize requirements, requirements specification, engineering contract, invariant, proof obligation, counterexample, compatibility-sensitive, material requirement."
---
# ASK Spec

Formalize agreed intent into one traceable specification and engineering contract before development. The agent must establish what is agreed, why it is believed, how it is observed, and what evidence will prove it. Humans own decisions; downstream agents should not need to rediscover intent.

## Proportionality
- **Trivial** — skip heavy spec; use `intake` or direct execution.
- **Normal** — requirements, decisions, constraints, non-goals, and observable acceptance criteria.
- **Complex, risky, or release-sensitive** — add relevant assumptions, invariants, proof obligations, counterexamples, dependencies, compatibility constraints, change impact, and audit expectations.

Classify requirements by impact: **ordinary** = local behavior; **material** = violation could affect behavior, correctness, data, compatibility, architecture, ownership, routing, security, production safety, or release readiness; **critical** = material with severe potential impact. Material and critical requirements need deeper detail. Use impact, not numeric scoring or document size. Do not catalogue every edge case.

## Flow
**Capture** — record need, context, goals, scope, non-goals, stakeholders, constraints, risks, dependencies, compatibility boundaries, open questions, and assumptions. Flag ambiguity; never assume. Keep the artifact proportional: ordinary work may need only a short requirements and acceptance record.

**Structure** — produce one contract containing requirements, decisions, constraints, must-remain-unchanged behavior, non-goals, invariants, acceptance criteria, proof obligations, dependencies, compatibility, and change impact. Keep requirement, constraint, non-goal, protected behavior, and invariant distinct. Decisions record choice, owner, rationale, and status: `proposed`, `confirmed`, `rejected`, or `superseded`; only `confirmed` decisions are settled implementation input. AI may recommend options, but may not settle product, ownership, compatibility, or architectural decisions for a human owner. For each material or critical requirement, preserve where relevant:

```text
Requirement → expected behavior / invariant → observable acceptance criterion → claim → proof obligation → required evidence
```
Distinguish: requirement = must be true; invariant = must never be violated; acceptance criterion = observable behavior; claim = statement that can be made after validation; proof obligation = what must be demonstrated about the claim; required evidence = the observations that demonstrate it; counterexample = how behavior or invariant could fail. `Run tests` is not a proof obligation by itself. If a material requirement cannot have a direct proof obligation, record why and what indirect evidence or human judgment is required.

**Challenge** — investigate, do not complete a checklist. For each material or critical concern, inspect the relevant primary evidence first, then existing behavior, architecture and production callers, constraints, and compatibility boundaries. Challenge assumptions that could change implementation; record the finding and evidence, including evidence-backed non-applicability when useful. Absence of a documented problem is not evidence that it does not exist. Do not invent hypothetical edge cases without material relevance.

For material or critical behavior, investigate only applicable failure modes such as zero or multiple candidates, conflicting evidence, missing metadata, partial or invalid input, unsafe fallbacks, caller bypasses, ordering/determinism, dependency assumptions, and backwards-compatibility edges. Record meaningful findings and failure modes. Derive audit targets from discovered assumptions, invariants, counterexamples, failure modes, bypass paths, fallback behavior, determinism requirements, compatibility boundaries, and ownership boundaries, for example:

```text
INV-004: one authoritative ownership source
Audit target: search production callers for alternate ownership paths
```

Use this model for material assumptions; status is `unverified`, `confirmed`, or `rejected`:

```text
Assumption | Source | Owner | Status | Impact
```
`confirmed` requires sufficient primary evidence or an explicit decision by the responsible human owner. If evidence is insufficient, keep the item `unverified`, state what evidence is missing, and name the owner needed to resolve it. Never turn inference into confirmation. Apply the same rule to a `confirmed` decision when its choice depends on an unresolved factual claim. Do not create an evidence score.

**Validate** — check completeness, observability, proof readiness, ownership, contradictions, readiness, and handover. Compare requirements, constraints, decisions, assumptions, protected behavior, observed behavior, and acceptance criteria for contradictions: detect incompatible constraints, conflicting decisions, unsatisfiable acceptance criteria, compatibility conflicts, and assumptions that conflict with evidence. Never resolve a conflict silently.

For each material requirement, connect `claim → proof obligation → required evidence`, or record why it is not directly verifiable. State what must be demonstrated, not merely a tool or command. Prefer `Given ... When ... Then ...` where it fits. `READY` means development can proceed without rediscovering implementation-affecting intent. Do not mark it `READY` with material ambiguity or contradiction, an unowned critical decision, an unverified critical assumption, a missing material acceptance criterion or proof obligation, unresolved compatibility, or unresolved implementation-affecting behavior. Human-owned resolution must be recorded; inference is not resolution.

**Transfer** — hand over one coherent artifact. `develop` gets build scope, confirmed decisions, constraints, must-remain-unchanged behavior, and non-goals; `verification` gets behavior, acceptance criteria, claims, proof obligations, and required evidence; `code-review` checks implementation against the contract; `improve`/audit gets derived targets from assumptions, invariants, counterexamples, bypass/fallback paths, determinism, compatibility risks, and architectural boundaries. `spec` formalizes and gates intent; it does not implement, verify, review, or audit.

## Traceability
`Need → Context → Decision → Requirement → Invariant → Acceptance → Proof → Handover → Build`
For requirements and evidence, track source, status, and relationship. Assign owners where decision authority is real: decisions, assumptions, and stakeholder-owned constraints. Every material requirement needs a proof obligation or an explicit reason it is not directly verifiable.

## Use with
- `intake` for scope clarification and exploration when full formalization is overkill
- `deep-research` for multi-source evidence before formalizing uncertain technical requirements
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
