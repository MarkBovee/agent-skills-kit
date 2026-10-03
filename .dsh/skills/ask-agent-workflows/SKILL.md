---
name: "agent-workflows"
description: "Agent Workflows: Use when coordinating subagents or parallel work, handing off tasks, or running release chores (version bump, changelog, release notes, tag). Common triggers: multi-agent, parallel work, agent coordination, task handoff, subagent delegation, version bump, bump version, release notes, changelog, tag release, release prep."
whenToUse: "Common triggers: multi-agent, parallel work, agent coordination, task handoff, subagent delegation, version bump, bump version, release notes, changelog, tag release, release prep."
disable-model-invocation: true
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

P0/P1 findings follow: reproduce → one regression proof within the test budget → minimal fix → validation → affected re-audit. Other findings are reported without new tests. Do not close a finding because code changed; re-prove its invariant.

## Release-sensitive work

Freeze the audited diff: commit (or snapshot) before starting REVIEW or AUDIT, and make no edits to the audited paths until the verdict arrives; an auditor on a moving tree can only report a stale or mixed verdict. Fix findings in a follow-up commit and request a delta audit of it. Keep one immutable diff reference with a gate table (`VALIDATE`, `REVIEW`, `AUDIT`, `RELEASE_GATE`); any source change makes evidence for the prior diff stale. Fix findings in one bounded batch, then run only a delta review and delta audit of the changed paths before the final gates. A metadata-only release (`VERSION`, `CHANGELOG.md`, plugin metadata) on an already-gated executable commit needs validation only. Before starting release-sensitive work, read [references/release-gates.md](references/release-gates.md) for the convergence and stop rule, the bounded narrow-fix path with its timebox, and the metadata-only fast path.

## Handoff context

Give subagents requirements, acceptance criteria, repository state, and relevant diff. Do not pass the primary agent's conclusion as authoritative. Include the decision tree so the subagent can load the matching workflow itself.

## Not a good fit

- the steps are tightly coupled and need one shared thread of judgment
  → use `develop` staged delegation instead; it handles sequential dependency chains with per-stage validation.
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

Execution tiers do not select a model. Before each delegation, choose a task-appropriate model and pass it per invocation when the host supports that. Do not rely on `inherit` or an omitted model for cost-sensitive work. See [references/model-routing.md](references/model-routing.md) for the routing policy, Claude Code behavior, and verification requirements.

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
