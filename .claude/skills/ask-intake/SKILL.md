---
name: "intake"
description: "Use when the goal, constraints, or success criteria are not yet crisp — from fuzzy design ideas through ambiguous scope to multi-file planning. Covers brainstorming, scoping, and execution planning in one skill."
when_to_use: "Common triggers: brainstorm, brainstormen, fuzzy idea, design tradeoff, unsure what to build, product direction, idee uitwerken, ambiguous request, unclear scope, behavior-changing work, fuzzy requirements, what should we build, wat moeten we bouwen, wat moeten we maken, best approach, how should we approach this, not sure where to start, start by clarifying, start with questions, ik weet niet waar te beginnen, hoe pakken we dit aan, plan, plannen, multi-file work, multi-phase work, migration, sequencing risk, staged refactor, stages, service by service, per service, dependency chain, sequential steps, per laag, stap voor stap, start planning, start with a plan, werk voorplannen, we moeten dit aanpakken, laten we dit doen, we moeten, laten we, pair programming, samenwerken, samen aanpakken."
---
# ASK Kickoff

Classify risk and choose lifecycle gates before implementation.

Clarify enough to avoid wrong work, then move. One skill for the full pre-execution phase: design exploration, scope clarification, and execution planning.

## Three entry points

**Design exploration** (fuzzy/exploratory):
1. Read existing code, docs, plans, and constraints first.
2. Ask one focused question at a time; prefer multiple choice when it fits.
3. Make assumptions explicit, especially around non-goals, scale, security, and ownership.
4. Propose 2-3 viable approaches with a recommendation and clear tradeoffs.
5. Once direction is chosen, stop exploring and move toward execution.

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
   - Zitten er natuurlijke service/module-grenzen in?
   - Zijn er dependency chains (stap B heeft output A nodig)?
   - Lopen complexiteit en benodigd redeneervermogen uiteen tussen stappen?
     (sommige mechanisch/boilerplate, andere cross-cutting/reasoning)
   - Zo ja: plan stages met volgorde, tier per stage (light/standard/heavy), en validatie-gates.
6. Define validation needed before claiming done.
7. Skip plan for one or two obvious edits. Use short bullets for normal multi-step work. Fuller plan only when sequencing or coordination risk is high.
8. If repo already has a durable planning or spec system, update that record instead of creating parallel docs.

**Aggressiveness contract** (maximum-result briefs):
1. Classify each evidence-backed candidate as `must`, `should`, `could`, or `explicitly out`.
2. For every deferred `could`, record why it is deferred and the event or evidence that should revisit it.
3. Treat this scope record as definition of done. Do not silently reduce requested evidence-backed scope to the smallest safe patch.
4. For large multi-issue, exhaustive, compatibility-sensitive, or release-sensitive briefs, write the plan artifact and complete plan-check before execution. Delegate independent research tracks through `agent-workflows`.

For significant or release-sensitive work, add a plan-check gate: challenge scope, affected callers, compatibility, fallback behavior, ambiguity, determinism, and proof gaps before execution.

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

- Mandatory spec-writing for trivial work
- Endless questioning after direction is already clear
- Creating parallel planning trees when the repo already has one
- Turning assumptions into facts without saying so
- Freezing a plan that is clearly wrong after investigation
- Silently dropping evidence-backed scope requested by the brief
