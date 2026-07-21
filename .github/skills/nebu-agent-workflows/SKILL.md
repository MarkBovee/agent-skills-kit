---
name: "agent-workflows"
description: "Use when coordinating multi-agent work, parallel execution, task handoff, shared context, or clean session shutdown across multiple agents or terminals. Especially useful when the host supports subagents, hooks, or shared context. Common triggers: multi-agent, parallel work, agent coordination, task handoff, subagent delegation, version bump, bump version, release notes, changelog, tag release, release prep."
---
# Nebu Agent Workflows

## Good fit

Default to delegating auxiliary work. Spawn subagents freely; keep only what needs to persist in main context.

- **any auxiliary work (default)** — grep, review, research, isolated edit
- the work splits into independent parts
- one branch is blocked on a slow command or external wait
- a handoff between sessions is already happening
- bounded release chore (version bump, changelog, release notes)

## Not a good fit

- the steps are tightly coupled and need one shared thread of judgment
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

### Concrete flows

**Review flow:** Main thread delegates a bounded review → subagent returns structured findings (1 line per issue, severity-tagged) → main thread applies or delegates fixes. Only the findings table stays in context, not the diff.

**Locate→fix flow:** Investigator finds sites → main thread picks 1-2 → hands exact path:line to builder → builder returns diff receipt. Investigator's full output discarded after selection.

**Research→summary flow:** Investigator explores → returns only the conclusion and key evidence (2-5 lines) → main thread uses that for the next decision. No exploration log kept.

**Stuck recovery:** `[blocked]`/`[partial]`/timeout → main narrows scope, re-delegates. Never retry unchanged. Usable partials stay, no retry.

## Use with

- `kaizen` for the default steady-progress loop once ownership and scope are set
- `verification` after delegated work completes, to match proof to the scope of what was delegated

## Avoid

- burning a high-cost agent on a version bump, changelog tweak, or release-notes draft with a clean scope
- fuzzy handoffs with no owner, no scope, or no success criteria
- parallel edits in the same files without an explicit merge plan
- keeping subagent reasoning verbatim — defeats the purpose of delegation
