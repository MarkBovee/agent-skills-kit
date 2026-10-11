---
name: "ask-intake"
description: "Intake: Grills fuzzy ideas into decisions, scopes the work, and plans multi-file changes. Use when scope is unclear or a plan needs stress-testing. Common triggers: brainstorm, brainstormen, fuzzy idea, design tradeoff, unsure what to build, product direction, idee uitwerken, ambiguous request, unclear scope, behavior-changing work, fuzzy requirements, what should we build, wat moeten we bouwen, wat moeten we maken, best approach, how should we approach this, not sure where to start, start by clarifying, start with questions, ik weet niet waar te beginnen, hoe pakken we dit aan, plan, plannen, multi-file work, multi-phase work, migration, sequencing risk, staged refactor, stages, service by service, per service, dependency chain, sequential steps, per laag, stap voor stap, start planning, start with a plan, werk voorplannen, we moeten dit aanpakken, laten we dit doen, we moeten, laten we, pair programming, samenwerken, samen aanpakken, grill me, grill this plan, stress-test this pla..."
disable-model-invocation: true
---
# ASK Kickoff

Classify risk and choose lifecycle gates before implementation.

Clarify enough to avoid wrong work, then move. One skill for the full pre-execution phase: design exploration, scope clarification, and execution planning.

## Entry points

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
3. If ambiguity would change implementation, ask it as a grill round (see Grill rounds); a single open question is a round of one.
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
   - Cut the stages as vertical slices, not layers, and sequence wide mechanical refactors as expand, migrate, contract: read `references/slicing.md`.
6. Define validation needed before claiming done. Order it as existing targeted tests, build/lint/static checks, and integration/server tests only where the risk requires them (test budget in `verification`); place only risk-required review and audit gates after that proof. Name the seams the tests will cross: take the highest seam that reaches the behavior, prefer an existing one, and keep the count low (one is ideal). The user confirms the seams before development starts.
7. Skip plan for one or two obvious edits. Use short bullets for normal multi-step work. Fuller plan only when sequencing or coordination risk is high.
8. If repo already has a durable planning or spec system, update that record instead of creating parallel docs. For work that outlasts one reply, keep the shared plan document (below) in that record.

**Behavior-changing work that needs a formal plan** (new user-visible behavior, an external contract, unclear acceptance criteria): shape the plan with `references/plan-template.md`. It adds the problem and solution from the user's side, user stories, implementation and testing decisions, and the out-of-scope list.

**Aggressiveness contract** (maximum-result briefs):
1. Classify each evidence-backed candidate as `must`, `should`, `could`, or `explicitly out`.
2. For every deferred `could`, record why it is deferred and the event or evidence that should revisit it.
3. Treat this scope record as definition of done. Do not silently reduce requested evidence-backed scope to the smallest safe patch.
4. For large multi-issue, exhaustive, compatibility-sensitive, or release-sensitive briefs, write the plan artifact and complete plan-check before execution. Delegate independent research tracks through `agent-workflows`.

**Release-gate cost decision** — when planning a release-sensitive change, make the validation and audit cost a stated decision before executing, not a default. Choose the **tier** of the independent audit (a `standard`/general re-audit is enough for a tiny delta; escalate to `deep` only on open cross-cutting invariants or counter-evidence). This decision never waives the audit itself: release-sensitive work still requires an independent audit and release-gate with evidence from a context separate from the implementer — owner-thread verification never substitutes for it. Record the tier choice and its outcome so the next release does not re-pay the same cost. The plan for release-sensitive work must carry a required line `Gate cost: <validation>, <review tier>, <audit tier>, expected cost`; a plan without it fails plan-check.

For significant or release-sensitive work, add a plan-check gate: challenge scope, affected callers, compatibility, fallback behavior, ambiguity, determinism, and proof gaps before execution.

## Grill rounds

Use when the user asks to be grilled, or when a plan has several open decisions. This is the one way intake asks questions. Treat the plan as a decision tree: each decision unlocks the ones below it.

1. **Ask the frontier.** The frontier is every open decision whose prerequisites are already settled. Ask all of it in one round: numbered, each question followed by your recommended answer on its own line (`➡️`). A question that depends on another open one in the same round waits for a later round.
2. **Word it for "yes".** Phrase each question so that "yes" accepts your recommendation.
3. **Facts are yours, decisions are the user's.** Look up code, config, docs, and earlier decisions instead of asking. Hand a long lookup to a subagent and ask the questions that do not depend on it meanwhile.
4. **Stress-test with scenarios.** When a question is about how concepts relate or where a boundary lies, invent a concrete case that probes the edge (a partial cancellation, a retry after a timeout) and ask what should happen. Check the user's claim against the code and surface any contradiction instead of choosing silently.
5. **Give them something to react to when talk runs out.** Some questions cannot be settled by discussion: how a screen should feel, one page or three. When a question needs a thing to look at, stop asking and build the cheapest throwaway (an outline, a stub, a sketch, a one-file page). Let the user react, then continue from their one-line answer. Mark it throwaway.
6. **Guard against nodding.** If every answer in a round is a bare yes, pick the one decision that costs the most to get wrong, state its downside, and confirm it once more before moving on.
7. **Recompute until done.** An answered round reshapes the tree: recompute the frontier and ask the next round. The session is done when the frontier is empty, nothing is silently assumed, and the user confirms the shared understanding. Do not act before that.

There is no round cap. A session that keeps growing means the scope is too large: split it and grill each part. The user can wrap up at any time; the unanswered low-risk branches then become stated assumptions.

**Stateful or stateless.** With a working repository and a code subject, keep `GLOSSARY.md` and decision records current as each decision settles, and the shared plan document too when the work outlasts one reply. With no repository, or a subject that is not software (a decision, a text, a business case), write no files: close with a short recap of the decisions in the conversation.

## Shared plan document

For work that outlasts one reply (several decisions, several sessions, a hand-off), keep one plan document that the grill writes into as decisions settle, not afterwards. Use the repository's own planning location when it has one (for example `plans/<slug>.md`). Sections:

- **Destination**: what reaching the end looks like, in one or two lines. It fixes the scope.
- **Decisions so far**: one line per settled decision, with its gist and a link to where it lives (a decision record, a glossary entry, the code). The document indexes decisions and never restates them.
- **Not yet specified**: in-scope questions that are not sharp enough to ask yet. The test is whether you can state the question precisely, not whether you can answer it. An answer that sharpens one graduates it into the next grill round and removes it from here.
- **Out of scope**: work consciously ruled out of this effort, with the reason. It returns only if the destination is redrawn.

Refer to a decision by its title, never by a bare number.

## Shared language and decisions

Read `references/domain-language.md` when a plan introduces or contradicts domain terms, or when a decision is hard to reverse, surprising without context, and the result of a real trade-off. It covers the lazy `GLOSSARY.md` and ADR files; write them only when that bar is met, and in the same moment the term or decision settles.

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
- Ending a grill because a round count was reached while branches are still open
- Writing glossary or decision files for a grill about something that is not code
- Creating parallel planning trees when the repo already has one
- Turning assumptions into facts without saying so
- Freezing a plan that is clearly wrong after investigation
- Silently dropping evidence-backed scope requested by the brief
