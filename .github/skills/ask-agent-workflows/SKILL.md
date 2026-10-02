---
name: "ask-agent-workflows"
description: "Agent Workflows: Use when coordinating multi-agent work, parallel execution, task handoff, shared context, or clean session shutdown across multiple agents or terminals. Especially useful when the host supports subagents, hooks, or shared context. Common triggers: multi-agent, parallel work, agent coordination, task handoff, subagent delegation, version bump, bump version, release notes, changelog, tag release, release prep."
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
2. **Normal** — plan → execute → validate → final review. Delegate validation or review when a second context improves confidence.
3. **Significant** — intake → plan → plan-check → execute → validate → final review → independent final audit.
4. **Release-sensitive** — significant flow plus release-gate. Release-gate consumes evidence and never modifies source.

Keep phases distinct: validation asks whether defined checks pass; review checks requirements, regressions, and design risk; audit independently searches for counterexamples, bypasses, ambiguity, unsafe fallbacks, nondeterminism, and compatibility breaks.

## Subagent evidence contract

Return one explicit status with concrete evidence:

- `ASK_WORKFLOW_PASS phase=VALIDATE` — required checks passed.
- `ASK_WORKFLOW_FINDINGS phase=AUDIT` — actionable findings remain; include path, impact, invariant, severity, and regression needed.
- `ASK_WORKFLOW_BLOCKED phase=REVIEW` — required context or capability is unavailable.
- `ASK_WORKFLOW_FAILED phase=VALIDATE` — execution failed; include command and error.

Missing output, timeout, and tool failure are not passes. For release-sensitive work, a required audit or release-gate that cannot run blocks release.

## Code-first independent audit

An independent audit inspects production behavior; it is not validation or a test-coverage inventory. Start from the exact production diff and, before inspecting tests, identify affected entry points, callers, state transitions, cleanup paths, fallback decisions, and the invariants they must preserve. Challenge those invariants with plausible counterexamples such as cancellation at an await boundary, delayed first responses, malformed input, stale cached state, overlapping ownership, or alias/hardware mismatches when relevant.

After reconstructing the implementation paths, inspect only the tests needed to check whether known invariants and failure modes are guarded. Tests are evidence, not a substitute for tracing production code. Validation owns whether the defined suite passes; an audit does not need to enumerate every test, rerun the full suite, or report test counts unless explicitly assigned. A green focused suite does not close an audit finding while a production-code bypass remains.

An actionable audit finding names the production path, violated invariant, plausible trigger, user impact, and smallest regression proof needed. If no issue is found, name the implementation paths and bypass categories inspected; a green test count alone is not an audit pass. Audit handoffs must include the exact diff and require the auditor to record production paths and invariants before looking at tests.

Example: a focused test passes for a normal response, but an error-shaped row can still reach a production fallback. Keep the audit finding open until that bypass is disproved or guarded; the green test does not establish the invariant.

### Independent audit handoff

Keep the audit assignment separate from validation. Provide the exact diff reference and requirements, then ask the auditor to report the production paths, callers, and invariants traced before inspecting targeted tests. Ask for counterexamples and actionable findings in the format above, or the paths and bypass categories inspected if none remain. The validator owns suite execution and pass/fail reporting; do not substitute test counts for audit evidence.

## Finding loop

P0/P1 findings follow: reproduce → regression test → minimal fix → validation → affected re-audit. Do not close a finding because code changed; re-prove its invariant.

## Release audit convergence and stop rule

For release-sensitive work, keep one current candidate record in the task plan: an immutable diff reference plus a concise gate table for `VALIDATE`, `REVIEW`, `AUDIT`, and `RELEASE_GATE`, each with status and its matching evidence. When source changes, mark evidence for the prior diff stale immediately; rerun only checks affected by the change, not unrelated gates.

Collect actionable findings into one bounded correction batch. After that batch, run focused validation and one delta review plus one separate delta audit limited to changed production paths and affected invariants. Do not restart broad candidate review or enumerate test suites on each delta. Once the candidate is stable, run the full required suite once, then independent final review, audit, and release-gate against that exact diff reference.

If the owner asks to stop the audit loop, stop review/audit work immediately and return a blocked status naming the current diff, the missing required gate, and any unresolved findings. Do not keep cycling, push, release, or close issues around the gate, and do not imply tests or deployment substitute for an audit. A stop request does not waive mandatory evidence: release-sensitive work remains blocked while a required independent gate is missing, or a P0/P1 or safety blocker is unresolved.

## Bounded narrow-fix release path

Use this path only for a release-sensitive fix with one explicit requested invariant, an existing regression proof, and a localized change in one subsystem with a bounded set of direct callers. The primary agent records the invariant, in-scope files/callers, excluded adjacent behavior, and budgets before dispatch. Any change to or affecting an external contract or an existing or new security, privacy, or safety boundary—including creating, moving, strengthening, weakening, or removing that boundary—requires the significant path. Migrations, architecture or ownership changes, cross-module behavior, or unclear scope also require the significant path. An independent reviewer or auditor may reject the narrow classification; do not argue the scope down to fit the budget.

This path bounds only the review/audit finding loop. It does not replace the normal release-sensitive intake, plan, plan-check, execution, final validation, review, audit, or release-gate requirements. Before dispatch, record an immutable reference for the exact diff, such as its commit SHA or a hash of the complete patch plus its base revision. Review, audit, validation, and release-gate evidence must name the same exact diff reference (for structured workflow markers, append `diff=<reference>`). If distinct contexts are unavailable, mark the missing gate blocked; one context cannot satisfy both roles. Any edit changes the diff reference and invalidates prior evidence for that diff; the delta passes must cover the new exact diff. The release-gate must consume evidence matching the final diff reference.

Workflow-router phase/status is advisory and can lag edits. Never treat `DONE`, `RELEASE`, or phase markers alone as proof that the current diff passed its gates. Compare the immutable diff reference in the plan and each evidence record; if status disagrees or the current diff reference cannot be established, block release.

Keep the release gates independent and bounded:

1. Run one independent standard-tier review and one separate independent standard-tier audit of the requested behavior and its direct callers. Allow at most 5 minutes for each pass.
2. Fix one batch of findings that directly violate the requested invariant or establish a release-blocking security, privacy, correctness, or safety issue. P0/P1 findings and established security, privacy, correctness, or safety blockers cannot be deferred, even when adjacent to the requested behavior. The independent reviewer and auditor must both confirm that any deferred finding is genuinely non-blocking and unrelated to the invariant; record it as a follow-up with evidence and a revisit trigger. If they disagree, block release and escalate.
3. After each fix batch that changes the diff, run focused validation, then one separate delta review and one separate delta audit of the changed paths. Allow at most 3 minutes for each delta pass. If either pass finds actionable issues, return to step 2 and repeat the focused-validation and delta-review/audit cycle only while the cumulative review/audit budget remains. Do not run the full suite during this findings loop. If the budget is exhausted or a pass is partial or blocked, stop and present the evidence; do not claim a pass or release readiness.
4. Once no actionable findings remain and the candidate diff is stable, run the full required check suite once on that exact diff. Only after validation passes may final review run; only after final review passes may the independent final audit and release-gate run. If a later review or audit finding changes code, all validation, review, audit, and release-gate evidence for the prior diff is stale: return to focused validation and delta review/audit; once the new candidate is stable, run the full suite and repeat final review, independent final audit, and release-gate on that exact diff.

The review/audit timebox is 16 minutes total and cannot be reset by splitting findings, edits, commits, handoffs, sessions, or agents, or by reclassifying the same scope. Record the cumulative time and diff reference in the task plan; carry both across handoffs and escalation. A pass that reaches its timebox returns partial or blocked evidence, never a pass. These limits cover review and audit only; they do not waive implementation, validation, the full check suite, or the release-gate.

Any unresolved violation of the requested invariant, P0/P1 finding, failed validation, security, privacy, correctness, or safety blocker, or missing/blocked required evidence blocks release, regardless of when it is found. If new evidence shows an invariant bypass or a blocker requires another fix batch, stop and present the evidence and minimal expanded scope to the task owner. Scope expansion requires explicit approval recorded in a revised plan from the requesting user or a named human delegate, never the implementing coordinator; any additional budget is additive, and prior evidence is historical context only unless it matches the new exact diff reference. Re-audit every affected path after an edit; do not carry stale evidence forward merely because an unaffected surface exists. Never turn a blocker into a follow-up to meet the budget. Independent validation, final review, final audit, and release-gate evidence remain mandatory for every release-sensitive change. A review or audit started before the latest validation is invalid.

## Metadata-only release fast path

When a release request changes only approved metadata files (`VERSION`, `CHANGELOG.md`, and synchronized plugin metadata) and the exact executable commit has already passed its required gates, validate the allowed file set, version monotonicity, and changelog consistency. Do not repeat code tests, delegated code review, or delegated audit for a metadata-only diff unless repository policy requires them or an executable file changed. A metadata-only change still needs the normal release ordering, release-readiness check, merge, tag-after-merge rule, and installed-artifact verification.

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
