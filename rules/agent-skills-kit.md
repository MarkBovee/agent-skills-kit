# Agent Skills Kit — Router

The `agent-skills-router` plugin injects a decision tree into every prompt under the `╌ Agent Skills Kit ╌` header.

## Decision tree

```
Deep research complex, contested, high-stakes questions → deep-research
Research facts, sources, or current state              → research
Specify requirements, build design brief → spec
Clarify scope, plan ambiguous work       → intake
Debug bug, crash, failing test, error    → debugging
Review code changes before handoff       → code-review
Verify claim, prove it works             → verification
Audit, refactor, reduce tech debt        → improve
Reflect on session, file improvement     → session-review
Coordinate multi-agent, parallel tasks   → agent-workflows
Create or revise a skill                 → write-skill
Design or polish UI/UX                   → design
Write text that reads human, not AI      → text-writing
Instrument logging, metrics, tracing, alerting → observability
Normal software work (default)           → develop
```

## Nudges from the router

| Nudge | Meaning |
|-------|---------|
| `→ Code edited — skill(name: 'code-review')` | A code edit tool ran. Load code-review before claiming done. |
| `→ Design produced — skill(name: 'design-review')` | The `design` skill was loaded. Filter the UI for AI-default slop before showing it. |
| `→ Working without loaded skill` | 5+ interactions without loading any skill. Load one now. |
| `→ Improvement found? skill(name: 'session-review')` | Session uncovered a reusable workflow gap worth filing. |

## Lifecycle gates

Risk determines workflow depth:

1. Small: `EXECUTE → VALIDATE`.
2. Normal: `PLAN → EXECUTE → VALIDATE → REVIEW`.
3. Spec-required: `INTAKE → SPEC → PLAN → PLAN_CHECK → EXECUTE → VALIDATE → REVIEW`.
4. Significant: `INTAKE → PLAN → PLAN_CHECK → EXECUTE → VALIDATE → REVIEW → ITERATE → AUDIT`.
5. Release-sensitive: significant flow plus `RELEASE_GATE`.

`SPEC` is required for explicit requirements/design-brief intent, unclear acceptance criteria, behavior-changing work, and new external contracts. It is not required for ordinary bugs, small edits, or known implementation work.

`RESEARCH` is an optional evidence phase, not a mandatory gate. `research` answers bounded fact questions; `deep-research` coordinates multi-source investigation, contradiction analysis, confidence, and a portable handoff before another skill owns scope, debugging, specification, or implementation.

Router status reports current phase, risk, required gates, subagent evidence count, unresolved findings, and release status. Validation proves defined checks; review challenges requirements and regressions; audit independently searches for counterexamples and bypasses; release-gate decides from evidence and never edits source.

Subagent results must use explicit `ASK_WORKFLOW_PASS`, `ASK_WORKFLOW_FINDINGS`, `ASK_WORKFLOW_BLOCKED`, or `ASK_WORKFLOW_FAILED` markers with a phase. Missing output, timeout, or tool failure is not a pass.

## Status panel

The compact ASK panel shows the active skills and any pending review obligations. `core/router-core.js` produces this snapshot. DSH emits it through `ask-kit/state`; OpenCode persists it under `askKit` session metadata. Both widgets only render it.

`activeSkills` lists the loaded skill first, then any matched or previously loaded skill; only an actually loaded skill carries `current: true`, so a route match stays a hollow suggestion and never looks active while its pending obligation still asks to load it. The cascade's `develop` fallback is never presented as an active skill and never displaces a loaded skill. The workflow route stays internal to the prompt surface and is not rendered in the panel. Pending obligations are the review skills ASK still needs (`code-review`, `design-review`); each carries a concrete `skill(name: '<skill>')` action and disappears as soon as its skill is loaded. Improvement capture is steered through the prompt surface, not the panel.

## Evidence-aware communication

When interacting with users, issue reporters, reviewers, or maintainers:

1. Establish current state from all available context.
2. Separate facts already proven from information still unknown.
3. Never request evidence that is already available.
4. Track the workflow phase: `report → investigation → evidence → implementation → release → verification`.
5. Once a change or release exists, switch from diagnosis mode to verification mode.
6. Request the smallest fresh evidence that closes the current gap, and explain why it is needed.
7. Stay direct, concise, factual, and pragmatic; do not blindly trust old evidence when version, configuration, or hardware state changed.

## Handoff to subagents

Include the same decision tree in the handoff prompt so subagents also know which skill to load.

## Slash commands

Every skill also ships as a slash command that loads its skill. `commands/<name>.md` is the canonical source; `export-platform-skills.js` generates `.opencode/commands/` (OpenCode) and `.github/prompts/*.prompt.md` (Copilot/VS Code). Claude Code and dsh get their command surface for free from their skills. Never hand-edit the generated copies.
