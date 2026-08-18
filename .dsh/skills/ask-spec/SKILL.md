---
name: "spec"
description: "Use when building a requirements spec or design brief before code — formalizing capture, decisions, and validation gates for non-trivial or enterprise-style work. Traceability + human-owned validation before handover. Common triggers: spec, specify requirements, requirements spec, requirements capture, design brief, decision register, requirements traceability, traceable requirements, validation gate, readiness gate, handover package, spec before build, truth spine, requirements-driven, requi..."
whenToUse: "Common triggers: spec, specify requirements, requirements spec, requirements capture, design brief, decision register, requirements traceability, traceable requirements, validation gate, readiness gate, handover package, spec before build, truth spine, requirements-driven, requirements engineering, formalize requirements, requirements specification."
---
# ASK Spec

Formalize intent into a validated, traceable specification before development starts. AI accelerates analysis; humans stay the owners of every decision.

## Four phases

**Capture** — record systematically; flag ambiguities, do not assume.
- Business goals register
- Stakeholder map
- Constraint and risk log
- Open question list

**Structure** — connect captured input into traceable objects.
- Requirement objects (functional + non-functional, with context)
- Decision register (owner + rationale)
- Process and data view (flows, roles, data objects, exceptions)
- Dependency map

**Validate** — every output passes explicit review; decisions stay human-owned. Run each gate:
1. **Completeness** — are the necessary objects present?
2. **Stakeholder** — have the right people reviewed?
3. **Readiness** — can the next phase proceed without guessing?
4. **Handover** — can development build with enough context?

**Transfer** — hand over a build-ready package, no guessing required.
- Requirements set
- Decision register
- Process and data view
- Readiness status (gaps, risks, open questions, gate outcome)

## Traceability

Keep the truth spine visible from need to build:
`Need → Context → Decision → Requirement → Validation → Handover → Build`
Every object has a source, owner, status, and relationship so audits, change impact, and future maintenance stay possible.

## Use with

- `intake` for the lighter scope clarification when full formal spec is overkill
- `verification` to prove the handover package is complete and ready
- `develop` once the spec is validated and build can start

## Avoid

- Mandatory spec for trivial work — reserve for non-trivial or requirements-driven scope
- Letting AI own decisions instead of flagging and deferring to the human
- Creating a parallel spec tree when the repo already has a durable planning system
- Treating captured input as fact without marking assumptions
