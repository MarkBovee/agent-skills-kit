---
name: "ask-intake"
description: "Intake: Clarifies goals, constraints, and success criteria and plans multi-file work. Use for brainstorming or scoping ambiguous work. Common triggers: brainstorm, brainstormen, fuzzy idea, design tradeoff, unsure what to build, product direction, idee uitwerken, ambiguous request, unclear scope, behavior-changing work, fuzzy requirements, what should we build, wat moeten we bouwen, wat moeten we maken, best approach, how should we approach this, not sure where to start, start by clarifying, start with questions, ik weet niet waar te beginnen, hoe pakken we dit aan, plan, plannen, multi-file work, multi-phase work, migration, sequencing risk, staged refactor, stages, service by service, per service, dependency chain, sequential steps, per laag, stap voor stap, start planning, start with a plan, werk voorplannen, we moeten dit aanpakken, laten we dit doen, we moeten, laten we, pair programming, samenwerken, samen aanpakken, grill me, grill this plan, stress-test this plan, challenge..."
disable-model-invocation: true
---
# ASK Kickoff

Classify risk and choose lifecycle gates before implementation.

Clarify enough to avoid wrong work, then move. One skill for the full pre-execution phase: design exploration, scope clarification, and execution planning.

## Three entry points

**Design exploration** (fuzzy/exploratory):
1. Read existing code, docs, plans, and constraints first.
2. Ask the open questions as one grill round (see Grill rounds); a single open question is just one question. Prefer multiple choice when it fits and attach your recommended answer to each question so the user can react faster than generating an answer.
3. Probe for what the user actually wants, not what they think they should want; "whatever you think" or "sounds good" is not a yes — confirm the intent explicitly.
4. Make assumptions explicit, especially around non-goals, scale, security, and ownership.
5. Propose 2-3 viable approaches with a recommendation and clear tradeoffs.
6. Once direction is chosen, stop exploring and move toward execution.

**Scope clarification** (ambiguous/behavior-changing):
1. Inspect relevant code, docs, or current behavior first.
2. If task is obvious and local, state the working assumption and start.
3. If ambiguity would change implementation, ask one focused question at a time.
4. Focus on: what outcome matters, what is in/out of scope, what must not change, what proof counts as done.
5. Once path is clear, move into execution without extra approval loops.

**Research classification** (facts not yet known):
1. Use `research` for bounded questions answerable through a few relevant local or external sources.
2. Use `deep-research` for interacting unknowns, historical or protocol behavior, local/upstream comparison, competing implementations, conflicting evidence, open-issue investigations, or explicit comprehensive/exhaustive research.
3. Research establishes facts and confidence; return to intake only when those facts affect scope, ownership, or an implementation decision.

**Execution planning** (multi-file/phase):
1. State goal in one or two sentences.
2. List files or areas likely to change.
3. Order work chunks by meaningful progress, not micro-steps.
4. Note key risks or open questions.
5. **Detect if work splits into dependent stages:**
   - Are there natural service or module boundaries?
   - Are there dependency chains (step B needs the output of step A)?
   - Do complexity and required reasoning differ between steps (some mechanical, some cross-cutting)?
   - If so, plan ordered stages with a tier per stage (light/standard/deep) and a validation gate per stage.
6. Define validation needed before claiming done. Order it as existing targeted tests, build/lint/static checks, and integration/server tests only where the risk requires them (test budget in `verification`); place only risk-required review and audit gates after that proof.
7. Skip plan for one or two obvious edits. Use short bullets for normal multi-step work. Fuller plan only when sequencing or coordination risk is high.
8. If repo already has a durable planning or spec system, update that record instead of creating parallel docs.

**Aggressiveness contract** (maximum-result briefs):
1. Classify each evidence-backed candidate as `must`, `should`, `could`, or `explicitly out`.
2. For every deferred `could`, record why it is deferred and the event or evidence that should revisit it.
3. Treat this scope record as definition of done. Do not silently reduce requested evidence-backed scope to the smallest safe patch.
4. For large multi-issue, exhaustive, compatibility-sensitive, or release-sensitive briefs, write the plan artifact and complete plan-check before execution. Delegate independent research tracks through `agent-workflows`.

**Release-gate cost decision** — when planning a release-sensitive change, make the validation and audit cost a stated decision before executing, not a default. Choose the **tier** of the independent audit (a `standard`/general re-audit is enough for a tiny delta; escalate to `deep` only on open cross-cutting invariants or counter-evidence). This decision never waives the audit itself: release-sensitive work still requires an independent audit and release-gate with evidence from a context separate from the implementer — owner-thread verification never substitutes for it. Record the tier choice and its outcome so the next release does not re-pay the same cost. The plan for release-sensitive work must carry a required line `Gate cost: <validation>, <review tier>, <audit tier>, expected cost`; a plan without it fails plan-check.

For significant or release-sensitive work, add a plan-check gate: challenge scope, affected callers, compatibility, fallback behavior, ambiguity, determinism, and proof gaps before execution.

## Grill rounds

Use when the user asks to be grilled or a plan has several open decisions. Treat the plan as a decision tree where each decision unlocks the ones below it.

1. The frontier is every open decision whose prerequisites are already settled. Ask the whole frontier in one round, numbered, each with your recommended answer.
2. Word each question so "yes" accepts your recommendation. A question that depends on another open one in the same round waits for a later round.
3. Look up facts yourself (code, config, docs) instead of asking; delegate a long lookup to a subagent and ask the questions that do not depend on it meanwhile.
4. After each answer round, recompute the frontier. Done means the frontier is empty and nothing is silently assumed; wait for the user to confirm shared understanding before acting.
5. Cap rounds at three unless the user keeps opening new branches; unanswered low-risk branches become stated assumptions.

## Shared language and decisions

Read `references/domain-language.md` when a plan introduces or contradicts domain terms, or when a decision is hard to reverse, surprising without context, and the result of a real trade-off. It covers the lazy `GLOSSARY.md` and ADR files; write them only when that bar is met.

## Resuming from a summary

A checkpoint or compaction summary can look like an uninterrupted session, but it does not restore skill instructions, and its claims about skill use are historical. Before editing in a resumed substantial task:

1. Re-check the current request against the routing table and skill triggers.
2. Read the matching workflow skills again in this session (`intake`, `develop`, plus `verification` and `code-review` for the gates ahead).
3. Compare the durable plan and gate ledger with the repository state (`git status`, the diff identity) before the first edit.

## Pair programming flow

When the user is actively pairing (discussing approach, reviewing, directing),
the default flow is:

1. **Plan**: write a structured plan covering:
   - Which files change and why
   - Approach / algorithm / architecture
   - Risks and backward compatibility
   - Definition of done
2. **Present**: show the plan to the user, wait for explicit approval
3. **Implement**: only after "yes" start coding

Keep asking questions until all grey areas are resolved.
Do not start coding while ambiguity remains.
Do not stop for approval at every milestone when scope is unchanged and the path is
clear — the initial plan already covers the full scope.

## Use with

- `develop` once the path is clear and execution can begin
- `research` for bounded fact-finding before a decision
- `deep-research` for autonomous multi-source investigation before scope or implementation
- `session-review` when intake reveals missing skills or routing gaps worth tracking

## Avoid

- Mandatory requirements documents for trivial work
- Endless questioning after direction is already clear
- Creating parallel planning trees when the repo already has one
- Turning assumptions into facts without saying so
- Freezing a plan that is clearly wrong after investigation
- Silently dropping evidence-backed scope requested by the brief
