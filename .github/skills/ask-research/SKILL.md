---
name: "research"
description: "Use when a question needs bounded fact-finding across repository, documentation, code, or external sources before an answer or decision. Common triggers: research this, research question, find evidence, compare sources, investigate current state, look into this technology, research documentation."
---
# ASK Research

Answer bounded questions with evidence, not recollection. This is fact-finding, not a design decision, code audit, or implementation pass.

## Flow

1. State question, decision it informs, scope, constraints, and unknowns.
2. Inspect local evidence before external sources when repository state matters: code, tests, fixtures, logs, history, and configuration.
3. Discover primary sources, then read relevant sections rather than relying on search snippets.
4. Compare evidence, distinguish `FACT`, `OBSERVATION`, `INFERENCE`, `HYPOTHESIS`, `ASSUMPTION`, and `UNKNOWN`.
5. Answer with citations, confidence, decision impact, and exact evidence still needed.

## Rules

- Prefer runtime evidence, reproducible tests, source code, official documentation, and standards over secondary sources.
- Cite external claims with stable URLs; cite local claims as `path:line` or a precise section.
- Do not implement, settle product or architecture choices, or present an inference as fact.
- Escalate to `deep-research` for multiple interacting unknowns, several source classes, conflicting evidence, historical/protocol analysis, or an exhaustive request.
- Return `ASK_WORKFLOW_PASS phase=RESEARCH` only when the stated question is answered or remaining gaps are explicitly actionable. Use `ASK_WORKFLOW_BLOCKED phase=RESEARCH` when essential evidence is inaccessible.

## Output

```text
Answer
Evidence: source - observation
Confidence: CONFIRMED | HIGH | MEDIUM | LOW | SPECULATIVE | UNKNOWN
Decision impact
Handoff: next owner, recommended action, protected scope, and required proof
Open questions / next evidence needed
```

## Use with

- `deep-research` when bounded investigation expands into a multi-track program
- `intake` to scope a decision after facts are known
- `debugging` to trace and fix a defect revealed by evidence
- `spec` to formalize evidence-backed requirements
- `develop` to implement an evidence-backed recommendation

## Avoid

- Treating a search-result snippet as evidence
- Starting broad repository audits; use `improve`
- Repeated permission questions when the next evidence source is clear
