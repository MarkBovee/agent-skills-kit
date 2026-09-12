---
name: deep-research
description: Use when a complex technical question needs autonomous, multi-source investigation, contradiction analysis, and an actionable cited handoff.
execution_tier: deep
delegation_default: prefer-subagent
triggers:
  - deep research
  - exhaustive research
  - comprehensive investigation
  - complex technical investigation
  - complex contested high-stakes question
  - complex compatibility question
  - complex compatibility issue
  - complex question
  - contested research
  - high-stakes research
  - full compatibility investigation
  - compare competing implementations
  - compare local and upstream implementations
  - investigate historical changes
  - determine protocol behaviour
  - investigate protocol behavior
  - protocol behavior exhaustively
  - multiple sources
  - research everything relevant
  - investigate open issues
  - open issues comprehensively
  - compare against upstream
---

# ASK Deep Research

Turn hard technical uncertainty into an autonomous research program. Gather and challenge evidence; do not implement source changes.

## Start

Write a research brief before broad search: question, objectives and decisions enabled, in/out scope, constraints, key unknowns, initial hypotheses, expected report. Do not repeatedly ask permission when the next source follows from this brief.

## Research Program

1. Build a dynamic plan. Split independent tracks: local implementation, real fixtures/logs/captures, upstream, history, official standards/docs, and community evidence where relevant.
2. Inspect local code, tests, fixtures, configuration, Git history, issues, and PRs before interpreting external claims about local behavior.
3. Discover sources broadly, then narrow with identifiers, versions, hardware, protocol fields, and terminology learned. Prefer direct runtime evidence, reproducible tests, source, standards, and official docs.
4. Delegate independent tracks through `agent-workflows`; coordinator owns scope, evidence reconciliation, plan updates, and synthesis. Report meaningful findings at milestones, not tool noise.
5. Extract evidence, not URL lists: `Source | section | observation | interpretation | confidence | contradiction`.
6. Track each important statement as `FACT`, `OBSERVATION`, `INFERENCE`, `HYPOTHESIS`, `ASSUMPTION`, or `UNKNOWN`. Maintain hypotheses with support, contradictions, status (`OPEN`, `SUPPORTED`, `WEAKENED`, `DISPROVEN`, `CONFIRMED`), and confidence.
7. Compare working/broken, old/new, local/upstream, hardware/software variants, fixtures, timing, fields, mappings, and state transitions. For protocols inspect identity, addresses, IDs, lengths, positions, types, bits, enumerations, read/write semantics, and observed state changes.
8. After every pass, update plan: learned facts, changed hypotheses, open questions, new leads, and highest-value next source. Emit a checkpoint for long work using [research-report-template.md](./research-report-template.md).
9. Search deliberately for disconfirming evidence before conclusions. Resolve conflicts by source authority, scope, history, and reproducible behavior; never silently choose a source.
10. Stop only when answer is confirmed, actionable despite remaining uncertainty, evidence-blocked, or at diminishing returns. State why and name minimum next evidence.

## Depth

- **Standard:** 3-5 tracks, multiple source types, iterative synthesis.
- **Comprehensive:** 5-10 tracks plus history, differential analysis, contradiction search, and hypothesis tests.
- **Exhaustive:** explicit request or justified stakes; expand corpus and track all evidence gaps without inventing certainty.

## Output

Use [research-report-template.md](./research-report-template.md). Cite every externally derived factual claim; local citations use `path:line`, fixture section, commit, issue, or PR. Include a compact continuation state so a follow-up such as “dig deeper into point 3” resumes rather than restarts.

Return `ASK_WORKFLOW_PASS phase=RESEARCH` only with cited findings, confidence, remaining gaps, and implementation handoff. Use `ASK_WORKFLOW_BLOCKED phase=RESEARCH` when essential primary evidence is unavailable.

## Use with

- `intake` to classify scope before or after evidence changes the decision
- `agent-workflows` for independent research tracks and evidence contract
- `debugging` for root-cause testing after research establishes likely causes
- `spec` for evidence-backed requirements and constraints
- `develop` for the separate implementation pass after research handoff

## Avoid

- One-search answers, confirmation bias, or search snippets as proof
- Treating names as protocol semantics without observed behavior
- Coding while evidence is still the deliverable
