# Subagent model routing

Choose a model for the delegated task, not by inheriting the coordinator's default. Complexity tiers guide the decision but do not select a model by themselves.

| Tier | Claude model | Task | Examples | Escalate when |
| --- | --- | --- | --- | --- |
| `light` (user term: light) | Haiku | Mechanical | Locate files, bounded grep, straightforward extraction, summarize routine command output | The result is ambiguous, incomplete, or needs material judgment. |
| `standard` (user term: medium) | Sonnet | Workflow work and review | Workflow skills (develop, debugging, research, verification, improve), bounded research, implementation, validation, normal code review | Evidence shows cross-cutting reasoning, unresolved correctness/security risk, or a cheaper pass failed. |
| `deep` (user term: heavy) | Opus, selectively | High-judgment | Architecture tradeoffs, difficult root-cause analysis, ambiguous invariants, broad counterexample analysis | This is a deliberate starting choice; state why Sonnet is insufficient. |

The tier names stay `light`, `standard`, and `deep` in every file. The "user term" column is the vocabulary people use in conversation.

## Workflow floor

Workflow skills run in the Sonnet worker (`ask-worker`), not on the session model. The exception is `deep-research` (tier `deep`), which stays on the session model because it dispatches its own subagents; the worker cannot start agents. Questions (prompts ending in `?`) get no worker line. The session model, which the user chooses, stays on the conversation: it routes, asks the user questions, and reports results. Haiku handles only bounded mechanical sub-steps the coordinator runs itself, such as search, grep, or summarizing command output. Intake stays on the session model because it asks the user questions, and a subagent cannot answer them interactively.

Use the lowest capable model, a narrow handoff, and a concise output contract. Do not spawn redundant workers or retry unchanged work on a more expensive model. Escalate only for a concrete gap, failed validation, or increased scope. `deep` describes task complexity; it is not an automatic Opus assignment.

## Effort

Model tier is not the only cost lever: reasoning effort changes tokens a lot. The ASK agent files set `effort` in frontmatter (`medium` for `ask-reviewer` and `ask-auditor`, `low` for `ask-worker` and `ask-researcher`); Claude Code documents the field (`low`, `medium`, `high`, `xhigh`, `max`) and a per-invocation `effort` parameter on the Agent tool (Claude Code 2.1.292 or later, non-fork subagents), which overrides the frontmatter. Never default above `medium`; raise it per call with a stated reason. The `CLAUDE_CODE_EFFORT_LEVEL` environment variable overrides both, so confirm the effort that actually ran. On hosts without an effort setting, keep the budget in the prompt (scope, tool-call ceiling, P0/P1 only).

## Claude Code

The ASK custom agent files in `agents/` use `model: sonnet` as their fallback, so omitting a model at dispatch does not intentionally inherit Opus. When Claude Code supports model selection on the Agent invocation, the coordinator should still pass the selected model for that task; the invocation choice takes precedence over agent frontmatter.

Claude Code accepts the `haiku`, `sonnet`, and `opus` aliases. They resolve to the model family version currently selected for the account/provider. Organization or provider restrictions may substitute a requested model or fall back to another model, including the session model. A frontmatter default or invocation parameter is therefore a request, not proof of the model actually used. Verify the active model in `/tasks`; if a cheaper choice resolves to Opus, report the configuration conflict and do not claim cost-aware routing succeeded.

The built-in `Explore` agent generally follows the parent model; a user- or project-level agent named `Explore` can override it with its own model. The built-in `Plan` agent inherits the parent model, and `CLAUDE_CODE_SUBAGENT_MODEL` alone does not change Explore or Plan. Do not claim the coordinator can choose a model per task for these built-in paths unless the host exposes that control. Use an ASK custom agent with an explicit model when coordinator-controlled research is required.

`CLAUDE_CODE_SUBAGENT_MODEL` is a fallback setting, not a substitute for per-task choices. Do not use `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` for this workflow: it forces one model onto subagents and prevents the coordinator from selecting a different model per task.

## Other harnesses

Use the host's supported per-invocation model selector when available. Treat `light`, `standard`, and `deep` as portable task tiers, not universal model names. If the host cannot select a model per task, use its explicit agent default, state that limitation, and verify the resolved model when the host provides a way to do so.
