# Subagent model routing

Choose a model for the delegated task, not by inheriting the coordinator's default. Complexity tiers guide the decision but do not select a model by themselves.

| Task | Starting model | Examples | Escalate when |
| --- | --- | --- | --- |
| Mechanical / light | Haiku | Locate files, bounded grep, straightforward extraction, summarize routine command output | The result is ambiguous, incomplete, or needs material judgment. |
| Standard | Sonnet | Bounded research, ordinary implementation support, validation, normal code review | Evidence shows cross-cutting reasoning, unresolved correctness/security risk, or a cheaper pass failed. |
| High-judgment / deep | Opus, selectively | Architecture tradeoffs, difficult root-cause analysis, ambiguous invariants, broad counterexample analysis | This is a deliberate starting choice; state why Sonnet is insufficient. |

Use the lowest capable model, a narrow handoff, and a concise output contract. Do not spawn redundant workers or retry unchanged work on a more expensive model. Escalate only for a concrete gap, failed validation, or increased scope. `deep` describes task complexity; it is not an automatic Opus assignment.

## Claude Code

The ASK custom agent files in `agents/` use `model: sonnet` as their fallback, so omitting a model at dispatch does not intentionally inherit Opus. When Claude Code supports model selection on the Agent invocation, the coordinator should still pass the selected model for that task; the invocation choice takes precedence over agent frontmatter.

Claude Code accepts the `haiku`, `sonnet`, and `opus` aliases. They resolve to the model family version currently selected for the account/provider. Organization or provider restrictions may substitute a requested model or fall back to another model, including the session model. A frontmatter default or invocation parameter is therefore a request, not proof of the model actually used. Verify the active model in `/tasks`; if a cheaper choice resolves to Opus, report the configuration conflict and do not claim cost-aware routing succeeded.

The built-in `Explore` agent generally follows the parent model; a user- or project-level agent named `Explore` can override it with its own model. The built-in `Plan` agent inherits the parent model, and `CLAUDE_CODE_SUBAGENT_MODEL` alone does not change Explore or Plan. Do not claim the coordinator can choose a model per task for these built-in paths unless the host exposes that control. Use an ASK custom agent with an explicit model when coordinator-controlled research is required.

`CLAUDE_CODE_SUBAGENT_MODEL` is a fallback setting, not a substitute for per-task choices. Do not use `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` for this workflow: it forces one model onto subagents and prevents the coordinator from selecting a different model per task.

## Other harnesses

Use the host's supported per-invocation model selector when available. Treat `light`, `standard`, and `deep` as portable task tiers, not universal model names. If the host cannot select a model per task, use its explicit agent default, state that limitation, and verify the resolved model when the host provides a way to do so.
