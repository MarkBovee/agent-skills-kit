# ASK Deep Research Plan

## Risk

Significant. Adds two public workflow skills, decision-tree routing, lifecycle evidence, generated platform artifacts, and release metadata.

## Scope

**Must**

- Add distinct `research` and `deep-research` canonical skills with commands and a reusable report/handoff template.
- Route ordinary fact-finding separately from multi-source, uncertain, comparative, historical, protocol, or exhaustive investigation.
- Add optional `RESEARCH` lifecycle evidence. Research remains non-blocking unless the selected skill requires it.
- Integrate research handoffs with intake, agent workflows, debugging, spec, develop, documentation, generated exports, and installer verification.
- Add route, lifecycle, platform-command, continuation, contradiction, evidence-gap, and handoff coverage.
- Bump public release metadata.

**Should**

- Keep compact evidence records and checkpoints portable across agents without new persistent storage.
- Preserve existing `design` rename work and avoid unrelated source edits.

**Could**

- Add host-native persistence later if a stable shared session-artifact API exists. Not needed now: report handoff is portable across all supported hosts.

## Design

1. `research` owns bounded fact-finding: inspect, search, compare, answer with sources, confidence, and unknowns.
2. `deep-research` owns autonomous multi-track research: brief, plan, primary-source discovery, parallel tracks, iterative evidence, contradiction search, hypothesis tracking, synthesis, citations, and handoff. It never implements source changes.
3. `RESEARCH` is a valid optional lifecycle evidence phase. It records explicit research outputs without adding a mandatory gate to ordinary development lifecycles.
4. Router gives deep research precedence over research and places both before intake. Triggers exclude generic `investigate`, `audit`, `plan`, and bug language owned elsewhere.
5. Canonical skills and commands flow through existing dynamic export and installer discovery. Installer end-to-end check proves both new installed skills and commands exist.

## Plan Check

- **Compatibility:** no existing mandatory phase changes; `RESEARCH` only validates explicit evidence.
- **Ownership:** research gathers evidence; intake scopes; debugging fixes defects; spec owns requirements; develop owns implementation; improve owns repo improvement audits.
- **Routing:** deep-specific phrases precede broad research; `audit` stays improve; `start investigating` stays debugging.
- **Proof:** deterministic route tests, lifecycle parser/progression tests, generated-export checks, dsh command check, isolated installer check, full validation suite.
- **Risk:** current worktree has unrelated `ui-ux` to `design` migration. Do not alter its source logic; export will intentionally regenerate its current artifacts.

## Definition Of Done

Complex technical prompts route to `deep-research`; bounded factual prompts route to `research`; reports retain evidence, contradictions, confidence, gaps, and downstream handoffs; all platform exports/installers expose both skills; required checks and independent review/audit pass.

## 2.1 Release Scope

Issues #60-#64 extend this workflow release and are in scope:

- **#60:** explicit large multi-issue and release-sensitive briefs route through intake and a lifecycle plan before execution.
- **#61:** deep research provides the reusable parallel research fan-out.
- **#62:** intake records an aggressiveness contract so requested evidence-backed scope cannot disappear silently.
- **#63:** session review reconstructs skill use and improvement capture when host session state is unavailable.
- **#64:** one managed workflow-instruction source is propagated to OpenCode, Claude, Copilot, and dsh without overwriting user-owned instructions.

Implementation keeps research project-neutral and uses existing export/installer paths. `2.1.0` is the release target; no tag, push, or issue mutation occurs until release-gate evidence is complete and explicitly requested.
