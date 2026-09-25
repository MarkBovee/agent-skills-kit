---
name: "agent-workflows"
description: "Use when coordinating multi-agent work, parallel execution, task handoff, shared context, or clean session shutdown across multiple agents or terminals. Especially useful when the host supports subagents, hooks, or shared context. Common triggers: multi-agent, parallel work, agent coordination, task handoff, subagent delegation, version bump, bump version, release notes, changelog, tag release, release prep."
whenToUse: "Common triggers: multi-agent, parallel work, agent coordination, task handoff, subagent delegation, version bump, bump version, release notes, changelog, tag release, release prep."
---
# ASK Agent Workflows

Coordinate independent evidence, not agent activity for its own sake.

## Good fit

Delegate only when it improves independence, coverage, specialist reasoning, or speed. The primary agent owns scope, integration, iteration, and final communication.

- **any auxiliary work (default)** — grep, review, research, isolated edit
- the work splits into independent parts
- one branch is blocked on a slow command or external wait
- a handoff between sessions is already happening
- bounded release chore (version bump, changelog, release notes)

## Lifecycle policy

Select workflow depth by risk:

1. **Small** — execute → validate. No subagent unless it materially improves proof.
2. **Normal** — plan → execute → validate → review. Delegate validation or review when a second context improves confidence.
3. **Significant** — intake → plan → plan-check → execute → validate → review → iterate → independent audit.
4. **Release-sensitive** — significant flow plus release-gate. Release-gate consumes evidence and never modifies source.

Keep phases distinct: validation asks whether defined checks pass; review checks requirements, regressions, and design risk; audit independently searches for counterexamples, bypasses, ambiguity, unsafe fallbacks, nondeterminism, and compatibility breaks.

## Subagent evidence contract

Return one explicit status with concrete evidence:

- `ASK_WORKFLOW_PASS phase=VALIDATE` — required checks passed.
- `ASK_WORKFLOW_FINDINGS phase=AUDIT` — actionable findings remain; include path, impact, invariant, severity, and regression needed.
- `ASK_WORKFLOW_BLOCKED phase=REVIEW` — required context or capability is unavailable.
- `ASK_WORKFLOW_FAILED phase=VALIDATE` — execution failed; include command and error.

Missing output, timeout, and tool failure are not passes. For release-sensitive work, a required audit or release-gate that cannot run blocks release.

## Finding loop

P0/P1 findings follow: reproduce → regression test → minimal fix → validation → affected re-audit. Do not close a finding because code changed; re-prove its invariant.

## Bounded narrow-fix release path

Use this path only for a release-sensitive fix with one explicit requested invariant, an existing regression proof, and a localized change in one subsystem with a bounded set of direct callers. The primary agent records the invariant, in-scope files/callers, excluded adjacent behavior, and budgets before dispatch. Any change to or affecting an external contract or an existing or new security, privacy, or safety boundary—including creating, moving, strengthening, weakening, or removing that boundary—requires the significant path. Migrations, architecture or ownership changes, cross-module behavior, or unclear scope also require the significant path. An independent reviewer or auditor may reject the narrow classification; do not argue the scope down to fit the budget.

This path bounds only the review/audit finding loop. It does not replace the normal release-sensitive intake, plan, plan-check, execution, final validation, review, audit, or release-gate requirements. Before dispatch, record an immutable reference for the exact diff, such as its commit SHA or a hash of the complete patch plus its base revision. Review and audit must be performed in distinct independent contexts and produce separate evidence naming their context/session references and the same exact diff reference. If distinct contexts are unavailable, mark the missing gate blocked; one context cannot satisfy both roles. Any edit changes the diff reference and invalidates prior evidence for that diff; the delta passes must cover the new exact diff. The release-gate must consume evidence matching the final diff reference.

Workflow-router phase/status is advisory and can lag edits. Never treat `DONE`, `RELEASE`, or phase markers alone as proof that the current diff passed its gates. Compare the immutable diff reference in the plan and each evidence record; if status disagrees or the current diff reference cannot be established, block release.

Keep the release gates independent and bounded:

1. Run one independent standard-tier review and one separate independent standard-tier audit of the requested behavior and its direct callers. Allow at most 5 minutes for each pass.
2. Fix one batch of findings that directly violate the requested invariant or establish a release-blocking security, privacy, correctness, or safety issue. P0/P1 findings and established security, privacy, correctness, or safety blockers cannot be deferred, even when adjacent to the requested behavior. The independent reviewer and auditor must both confirm that any deferred finding is genuinely non-blocking and unrelated to the invariant; record it as a follow-up with evidence and a revisit trigger. If they disagree, block release and escalate.
3. If the fix batch changes the diff, run targeted validation, then one separate delta review and one separate delta audit of the changed path. Allow at most 3 minutes for each delta pass.
4. Run the full required check suite once at closeout, then complete the normal independent release-gate.

The review/audit timebox is 16 minutes total and cannot be reset by splitting findings, edits, commits, handoffs, sessions, or agents, or by reclassifying the same scope. Record the cumulative time and diff reference in the task plan; carry both across handoffs and escalation. A pass that reaches its timebox returns partial or blocked evidence, never a pass. These limits cover review and audit only; they do not waive implementation, validation, the full check suite, or the release-gate.

Any unresolved violation of the requested invariant, P0/P1 finding, failed validation, security, privacy, correctness, or safety blocker, or missing/blocked required evidence blocks release, regardless of when it is found. If new evidence shows an invariant bypass or a blocker requires another fix batch, stop and present the evidence and minimal expanded scope to the task owner. Scope expansion requires explicit approval recorded in a revised plan from the requesting user or a named human delegate, never the implementing coordinator; any additional budget is additive, prior evidence carries forward, and unaffected surfaces are not re-audited without cause. Never turn a blocker into a follow-up to meet the budget. Independent validation, review, audit, and release-gate evidence remain mandatory for every release-sensitive change.

## Handoff context

Give subagents requirements, acceptance criteria, repository state, and relevant diff. Do not pass the primary agent's conclusion as authoritative. Include the decision tree so the subagent can load the matching workflow itself.

## Not a good fit

- the steps are tightly coupled and need one shared thread of judgment
  → Gebruik in plaats daarvan `develop` staged delegation, die sequentiële
    dependency chains met per-stage validatie ondersteunt.
- the next step depends directly on the exact output of the previous step
- the reasoning or intermediate state is needed for the next step — losing it means re-deriving

## Context retention

Default to delegate. Only keep in main when the reasoning must survive — structured output never needs to.

| Keep in main | Delegate |
|---|---|
| Architecture / tradeoffs | grep, locate, map |
| Reasoning chains (2+ steps) | Isolated edit, fixed spec |
| Code that still changes | Bounded review |
| Cross-cutting refactors | Research → summary |
| Bug analysis needing full context | Mechanical rename, lint, format |

## Core lifecycle

1. Pick one current owner.
2. Split work only at clean boundaries.
3. Share the minimum context needed to avoid re-derivation.
4. Report blockers and findings early.
5. Keep the active owner driving toward done instead of pausing for ceremonial checkpoints.
6. Hand off explicitly when ownership changes.
7. Clear pending messages before claiming done.

## Subagent tier & budget

Pick the smallest capable tier for the actual job; escalate only when evidence demands it, never by default.

- **Start low.** Begin on `light`/`standard` (smallest capable subagent or model). Reserve `deep`/xhigh for broad, cross-cutting, release-critical analysis — and only with a stated time budget agreed with the owner thread up front.
- **Delta re-checks are cheap.** A re-audit or follow-up check after fixes does not repeat the original deep pass: re-verify the touched surface on `standard`/general. Escalate to `deep` only if new counter-evidence or an open cross-cutting invariant demands it.
- **Interrupt, then downgrade.** If a long-running subagent is slow without producing evidence, interrupt and restart narrower on a cheaper tier rather than waiting on the deep run. Start small; escalate on proof, not assumption.
- **Heartbeat.** Long background subagents send periodic status (running/milestone/blocked) so the owner thread is never silent (see progress updates below). A subagent that runs silently past its budget is interrupted, not waited on.
- **Owner thread owns cost.** The primary agent decides tier, budget, and when to interrupt. A subagent never self-justifies expansion.

## Cheap-first defaults

- Pick the smallest capable model for mechanical work; reserve top model for judgment-heavy work.
- Keep the owner thread responsible for merge, review, validation, and final communication.
- Escalate to a larger model only when scope expands, validation fails, or the task stops being mechanical.

## Practical pattern

1. Define each agent's job in one sentence.
2. Make the active owner visible.
3. Keep shared facts concise: scope, files, blockers, proof.
4. Merge results before starting overlapping edits.
5. Aggregate create, test, and review outcomes into the owner thread instead of spamming status noise.
6. Finish with one clear summary and no dangling follow-ups.

### Output contract

What a subagent returns to the main thread:

- **Structured findings** — one line per finding, or a table/list. No narrative, no reasoning trail.
- **Empty result** — `No match.` / `No issues.` / `Out of scope.`
- **Blockers** — `[blocked]` + one-line reason. Do not spin; return immediately.
- **Partial result** — `[partial]` + findings so far. Do not wait for 100%.
- **Timeout every call** — 30s grep/locate, 60s review, 120s research. If the host supports timeout parameters, use them.
- **Main never waits forever** — after timeout, use what came back or re-delegate with narrower scope. Never retry unchanged.

### Progress updates for long-running background tasks

When a background subagent runs for a long time, the main channel must not stay silent.
Emit periodic, rate-limited progress updates while the task runs:

- **Rate-limit by milestone or time**, never per tool call. One update per meaningful phase
  (or roughly every few minutes) is enough.
- **Include in each update:** current status (`running` / `blocked` / `failed` / `completed`),
  the milestone or phase reached, approximate progress where available, blockers or required
  user input, and the final output location on completion.
- **Surface blocked/failed promptly** — do not keep the main channel waiting on a stuck task.
- **Stop on completion** — the final result is the last update; no trailing status noise.

### Concrete flows

**Deep-research flow:** Coordinator writes the research brief and dynamic plan, delegates independent local, upstream, history, and external tracks, then reconciles citations, contradictions, hypotheses, confidence, and handoff. Track results carry evidence, scope, unknowns, and `ASK_WORKFLOW_* phase=RESEARCH`; coordinator owns conclusions and continuation state.

**Parallel research sweep:** For a multi-source brief, create one read-only subagent per independent source class before serial analysis: local implementation and tests, fixtures/logs/captures, upstream source and documentation, history/issues/PRs, and external standards or community evidence. Each returns citations, observations, contradictions, confidence, and open questions. Coordinator compares results, resolves source authority, then assigns dependent follow-up work.

**Review flow:** Main thread delegates a bounded review → subagent returns structured findings (1 line per issue, severity-tagged) → main thread applies or delegates fixes. Only the findings table stays in context, not the diff.

**Locate→fix flow:** Investigator finds sites → main thread picks 1-2 → hands exact path:line to builder → builder returns diff receipt. Investigator's full output discarded after selection.

**Research→summary flow:** Investigator explores → returns only the conclusion and key evidence (2-5 lines) → main thread uses that for the next decision. No exploration log kept.

**Stuck recovery:** `[blocked]`/`[partial]`/timeout → main narrows scope, re-delegates. Never retry unchanged. Usable partials stay, no retry.

## Use with

- `develop` for the default steady-progress loop once ownership and scope are set
- `deep-research` for autonomous multi-track evidence gathering before a downstream handoff
- `verification` after delegated work completes, to match proof to the scope of what was delegated

## Avoid

- burning a high-cost agent on a version bump, changelog tweak, or release-notes draft with a clean scope
- fuzzy handoffs with no owner, no scope, or no success criteria
- parallel edits in the same files without an explicit merge plan
- keeping subagent reasoning verbatim — defeats the purpose of delegation
- long-running background tasks that leave the main channel silent for minutes
