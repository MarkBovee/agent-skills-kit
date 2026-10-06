# Workflow, routing, and lifecycle

How ASK picks a skill and how much process a change gets. The short version lives in the [README](../README.md#how-it-works).

## Contents

- Host-neutral discovery
- Default rhythm
- Router and decision tree
- Risk-based lifecycle
- Cost-aware execution profile

## Host-neutral discovery

Every supported host follows one contract:

```text
user request
  → discover the host-preferred skill root
  → a router or plugin selects the most specific matching skill
  → read only that skill's SKILL.md before substantial work
  → add only a directly implied companion skill
  → follow the skill with host-native tools
```

Canonical skills are the directories under `skills/`. Commands, generated platform copies, router files, and instruction files expose skills but are not additional skills. Use the host-preferred skill root: source `skills/` in a checkout, shared `~/.agents/skills/` for Codex and common installs, OpenCode's managed `~/.config/opencode/skills/` links, GitHub Copilot's `.github/skills/` export, Claude's native discovery, and dsh's project or user `.dsh/skills/` export before the shared root. Use `develop` only when no more-specific workflow applies. Common handoffs are `design` → `design-review`, `verification` → risk-appropriate `code-review` (normal and higher-risk workflows) and `audit` (significant and release-sensitive workflows), bounded `research` → a decision, and `deep-research` → `intake`, `debugging`, `spec`, or `develop`. Leaf skills are not selected implicitly: routers read the chosen `SKILL.md` directly, while plugin-owned skills remain under plugin dispatch.

## Default rhythm

Default rhythm across the pack:

1. Inspect the next boundary that matters.
2. Create the smallest coherent change.
3. Prove the touched surface with the fastest trustworthy check.
4. Review the diff before claiming victory.
5. Continue until done or blocked for real.

That is why `develop` carries `default: true` in frontmatter. The router uses it as a baseline nudge without overriding a clearly stronger match.

The pack favors fast trustworthy checks, then proportional review and verification before completion claims.

## Router and decision tree

`plugins/agent-skills-router/` presents a **decision tree** on the first OpenCode prompt, then compact live status on later prompts; its TUI sidebar renders the router-core status snapshot. Advisory phrase matching proposes one specific skill; the agent reads only that skill's `SKILL.md` from the shared root. A successful canonical file read updates router state and satisfies the pre-edit gate. No hidden execution or automatic skill loading.

The decision tree injected on the first OpenCode prompt:

```mermaid
flowchart TD
    A[Agent evaluates task] --> B{Task matches?}
    B -->|Deep research complex, contested, high-stakes questions| DR[deep-research]
    B -->|Research facts, sources, or current state| RS[research]
    B -->|Specify requirements, build design brief| S[spec]
    B -->|Clarify scope, plan ambiguous work| I[intake]
    B -->|Debug bug, crash, failing test, error| D[debugging]
    B -->|Review code changes before handoff| CR[code-review]
    B -->|Verify claim, prove it works| V[verification]
    B -->|Audit, refactor, reduce tech debt| R[improve]
    B -->|Reflect on session, file improvement| G[session-review]
    B -->|Coordinate multi-agent, parallel tasks| A2[agent-workflows]
    B -->|Create or revise a skill| W[write-skill]
    B -->|Design or polish UI/UX| U[design]
    B -->|Write text that reads human, not AI| T[text-writing]
    B -->|Instrument logging, metrics, tracing, alerting| OB[observability]
    B -->|Normal software work (default)| DE[develop]

    style DR fill:#153e52,stroke:#00bcd4,color:#fff
    style RS fill:#153e52,stroke:#00bcd4,color:#fff
    style S fill:#2d1b69,stroke:#7C5CFF,color:#fff
    style I fill:#2d1b69,stroke:#7C5CFF,color:#fff
    style D fill:#1a1a2e,stroke:#e94560,color:#fff
    style DE fill:#1a1a2e,stroke:#e94560,color:#fff
    style CR fill:#1a1a2e,stroke:#2ecc71,color:#fff
    style V fill:#1a1a2e,stroke:#2ecc71,color:#fff
    style R fill:#1a1a2e,stroke:#f39c12,color:#fff
    style G fill:#1a1a2e,stroke:#f39c12,color:#fff
    style A2 fill:#1a1a2e,stroke:#1abc9c,color:#fff
    style W fill:#1a1a2e,stroke:#1abc9c,color:#fff
    style U fill:#1a1a2e,stroke:#e91e8c,color:#fff
    style T fill:#1a1a2e,stroke:#8b5cf6,color:#fff
    style OB fill:#1a1a2e,stroke:#4c9aff,color:#fff
```

| Stage          | Skills                           | Color            |
| -------------- | -------------------------------- | ---------------- |
| **Research**   | `research`, `deep-research`      | `#00bcd4` cyan   |
| **Start**      | `spec`, `intake`                 | `#7C5CFF` purple |
| **Execute**    | `debugging`, `develop`           | `#e94560` red    |
| **Validate**   | `code-review`, `verification`    | `#2ecc71` green  |
| **Improve**    | `improve`, `session-review`      | `#f39c12` orange |
| **Coordinate** | `agent-workflows`, `write-skill` | `#1abc9c` teal   |
| **Product**    | `design`, `design-review`        | `#e91e8c` pink   |
| **Write**      | `text-writing`                   | `#8b5cf6` violet |
| **Operate**    | `gh-inbox`, `observability`      | `#4c9aff` blue   |

Session state tracks code edits, tool usage, and router-directed skill-file reads. The router nudges when code was edited without review, when a UI was produced (read `design-review`), or when many tools ran without loading any workflow — always hint, never force.

## Risk-based lifecycle

For non-trivial work, ASK exposes proportional lifecycle gates rather than treating every change as a release candidate:

| Risk | Gates |
| --- | --- |
| Small | `EXECUTE → VALIDATE` (no separate review or audit) |
| Normal | `PLAN → EXECUTE → VALIDATE → REVIEW` (one combined review) |
| Spec-required | `INTAKE → SPEC → PLAN → PLAN_CHECK → EXECUTE → VALIDATE → REVIEW` |
| Significant | `INTAKE → PLAN → PLAN_CHECK → EXECUTE → VALIDATE → REVIEW → ITERATE → AUDIT` |
| Release-sensitive | Significant flow plus `RELEASE_GATE` |

Validation proves defined technical checks. Review challenges requirements, regressions, and design risk. Independent audit searches for counterexamples, bypasses, ambiguity, unsafe fallbacks, nondeterminism, and compatibility breaks. Release-gate consumes evidence and never edits source. Small explicit local fixes finish after targeted validation; audits are reserved for significant and release-sensitive work. Subagents report explicit `ASK_WORKFLOW_PASS`, `ASK_WORKFLOW_FINDINGS`, `ASK_WORKFLOW_BLOCKED`, or `ASK_WORKFLOW_FAILED` markers with a phase; missing output, timeout, and tool failure are never passes. Keep these markers in tool results, not final user-facing responses.

`SPEC` is conditional, not a mandatory ceremony: use it for explicit requirements/design-brief work, unclear acceptance criteria, behavior-changing work, and new external contracts. Ordinary bugs and small edits go directly through their proportional flow.

`RESEARCH` is optional lifecycle evidence, not a mandatory development gate. `research` keeps a question bounded; `deep-research` coordinates 3-10 independent evidence tracks, iterative source expansion, contradiction testing, confidence, citations, continuation state, and a downstream handoff. `intake` classifies uncertainty and must route large or high-stakes investigation to deep research instead of absorbing it.

For large, multi-issue, exhaustive, compatibility-sensitive, or release-sensitive work, start with `intake`, create a plan artifact, classify `must`/`should`/`could` scope, and complete plan-check before execution. Each deferred evidence-backed item needs a reason and revisit trigger. Independent research, validation, review, and audit tracks should be delegated; release readiness requires independent evidence, not self-review.

## Cost-aware execution profile

Two optional frontmatter fields let a skill declare how expensive its default flow is, so hosts that support cheaper subagents or models can route mechanical work to them instead of the primary agent:

| `execution_tier`     | Suggested `agentTier` | When to use                                                               | Example                                                                                                |
| -------------------- | --------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `light`              | `mini`                | bounded, mechanical, single-pass work                                     | `agent-workflows`, `session-review`                                                                     |
| `standard` (default) | `default`             | normal judgment-heavy work                                                | `develop`, `spec`, `intake`, `code-review`, `debugging`, `verification`, `write-skill`, `text-writing`, `observability`, `research`, `design`, `design-review`, `gh-inbox`, `improve` |
| `deep`               | `xhigh`               | autonomous multi-source or architectural investigation                    | `deep-research`                                                                                        |

`delegation_default` (`auto` / `prefer-subagent` / `owner-only`) hints whether the work should default to a subagent when the host supports one. Both fields are read by `buildExecutionProfile` in `core/router-core.js`, which maps `light` → `mini`, `standard` → `default`, and `deep` → `xhigh`, and defaults `delegation_default` to `prefer-subagent` for `light` skills and `owner-only` for `deep` skills.

The result surfaces as a compact routing hint, not a standalone command line. OpenCode and dsh fold it into the status snapshot as `Active: <skill> (<tier>/<delegation>)` (e.g. `research (standard/auto)`), and the VS Code hook prints `Agent Skills Kit routing suggests: research. Execution profile: standard/auto.` Treat it as a hint: pick the smallest/cheapest model or subagent class the host offers for `mini`, and escalate to `default`/`xhigh` only when scope grows or a cheap-first attempt fails. This only nudges routing — it never blocks a tool or forces delegation.

Hard boundaries:

* no command rewriting
* no automatic tool execution
* no session takeover
* no hidden automation
