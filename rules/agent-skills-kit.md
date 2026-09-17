# Agent Skills Kit — Router

`agent-skills-router` injects routing guidance under `╌ Agent Skills Kit ╌`.

## Decision tree

```text
Deep research complex, contested, high-stakes questions → deep-research
Research facts, sources, or current state              → research
Specify requirements, build design brief              → spec
Clarify scope, plan ambiguous work                    → intake
Debug bug, crash, failing test, error                 → debugging
Review code changes before handoff                    → code-review
Verify claim, prove it works                          → verification
Audit, refactor, reduce tech debt                     → improve
Reflect on session, file improvement                  → session-review
Coordinate multi-agent, parallel tasks                → agent-workflows
Create or revise a skill                              → write-skill
Design or polish UI/UX                                → design
Write text that reads human, not AI                   → text-writing
Instrument logging, metrics, tracing, alerting        → observability
Normal software work (default)                        → develop
```

## Nudges

- Code edit: load `code-review` before claiming done.
- Design load: load `design-review` before showing UI.
- Five interactions without a loaded skill: load one.
- Reusable workflow gap: load `session-review`.

## Lifecycle gates

Risk determines workflow depth.

1. Small: `EXECUTE → VALIDATE`.
2. Normal: `PLAN → EXECUTE → VALIDATE → REVIEW`.
3. Spec-required: `INTAKE → SPEC → PLAN → PLAN_CHECK → EXECUTE → VALIDATE → REVIEW`.
4. Significant: add `ITERATE → AUDIT`.
5. Release-sensitive: add `RELEASE_GATE`.

`SPEC` covers explicit requirements/design briefs, unclear acceptance criteria, behavior changes, and new external contracts. It is not needed for ordinary bugs or known small work.

`RESEARCH` is optional. `research` handles bounded facts. `deep-research` handles multi-source investigation, contradiction analysis, confidence, and handoff.

Validation proves checks. Review challenges requirements and regressions. Audit independently searches counterexamples and bypasses. Release-gate decides from evidence and never edits source.

Subagent results require `ASK_WORKFLOW_PASS`, `ASK_WORKFLOW_FINDINGS`, `ASK_WORKFLOW_BLOCKED`, or `ASK_WORKFLOW_FAILED` plus phase. Missing output, timeout, or tool failure is not a pass.

## Status panel

Panel shows active skills and pending review obligations. `router-core.js` builds state; dsh emits `ask-kit/state`; OpenCode publishes session prompt metadata; TUI reads state only.

Route matches stay hollow until skill load. `activeSkills` lists loaded skill first; `current: true` means actually loaded. `develop` fallback never displaces loaded skill. Workflow stays in prompt, not panel. Pending obligations are `code-review` and `design-review`; each exposes `skill(name: '<skill>')` and clears on load.

## Evidence-aware communication

1. Establish current state.
2. Separate facts already proven from information still unknown.
3. Never request evidence that is already available.
4. Track `report → investigation → evidence → implementation → release → verification`.
5. After implementation or release, switch from diagnosis mode to verification mode.
6. Request the smallest fresh evidence that closes current gap; explain why.

Include decision tree in subagent handoffs. `commands/<name>.md` is canonical; exports are generated, never hand-edited.
