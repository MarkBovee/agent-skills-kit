# Dynamic workflows

A dynamic workflow is a script the host runs to orchestrate many subagents. The script holds the loop, the branching, and the intermediate results; the coordinator's context receives only the final answer. This file sets the ASK policy on top of the host mechanics. In Claude Code the host documents the script API; load its `/workflow-authoring` skill (Claude Code 2.1.248 or later) before writing or editing a script, and do not copy the API into plans, which go stale.

## When a script beats a coordinator

| Shape | Use |
| --- | --- |
| A few delegated tasks, each needing judgment from the coordinator | Delegate or staged delegation |
| About ten or more independent items with the same operation, each needing judgment | Workflow |
| Purely mechanical edits across many files | Batch or a scripted pass |
| Check, fix, repeat over about ten or more independent failures | Workflow |
| Check, fix, repeat over a few related failures | Direct |
| Many findings that each need an independent refutation attempt | Workflow |
| A hard plan worth drafting from several independent angles | Workflow |
| Tightly coupled edits, or the next step needs the previous step's reasoning | Direct or staged |

## Starting one on Claude Code

- A run needs the user's opt-in, and the Workflow tool says so itself. The opt-in is one of: the user asked for a workflow in their own words ("use a workflow", "fan out agents"), typed the `ultracode` keyword, has ultracode on for the session (`/effort ultracode`, the user's setting and never ASK's to turn on), or ran a saved workflow as `/<name>`. A task that merely fits does not count, and neither does an ASK skill read through the router, because the user did not invoke it.
- Without the opt-in, describe the run (what it does, expected agent count, model tier per stage, rough cost) and ask whether to run it; mention that "use a workflow" starts it. In a non-interactive run, where no answer can come, continue in Delegate.
- The keyword is an opt-in only in a prompt the user typed. A hook, a scheduled task, `claude -p`, or a relayed comment cannot start a run with it, so never rely on writing it into a prompt.
- A run goes through the permission evaluation of the session. In manual and accept-edits modes the user sees the phases and can read the raw script before approving. Do not add a blanket `Workflow` allow rule or switch the permission mode to avoid the prompt.
- `/workflows` shows progress, pauses, stops, and restarts agents. A stopped run relaunches from the same script: completed agents return saved results until the first agent whose prompt changed.
- Users can turn workflows off (`disableWorkflows` or `CLAUDE_CODE_DISABLE_WORKFLOWS=1`), and an organization can too. When the Workflow tool is absent, fall back to Delegate and say so once.

## Limits that shape the design

- No mid-run user input: settle scope and acceptance first, or split the work into one workflow per stage with sign-off between them.
- The script cannot touch the filesystem or shell itself; agents do all reading, editing, and commands. The script body cannot `import()`, and `Date.now()`, `Math.random()`, and an argument-less `new Date()` throw so a relaunch repeats the same calls. Pass a timestamp through `args`.
- Up to 16 concurrent agents by default, 4,096 items in one `parallel()` or `pipeline()` call, 1,000 agents per run.
- The size guideline (`workflowSizeGuideline`: `small` under 5 agents, `medium` under 10, `large` under 50, `unrestricted`) is advice to the script author, not a cap. The default is `medium`. A `Large workflow` warning shows past 25 agents or 1.5 million projected tokens.

## ASK policy for a run

1. **Fit and size first.** Apply the fit test in `develop`. State the expected agent count and the model tier per stage in the task description so the script names them. Give each agent a chunk of items so the run stays within the size guideline, and ask the user before going above it.
2. **Slice before the full run.** Run one directory or one category, read the per-agent token use in `/workflows`, then widen.
3. **Model per stage.** An agent with no model named runs on the session model. Name `light` (Haiku) for locate and extract, `standard` (Sonnet) for edit and verify, and `deep` (Opus) only with a stated reason. Workflow agents read each other's prompt cache when model, effort, tools, schema, and directory match, so keep a stage's settings identical.
4. **Schema-shaped output.** Use the `schema` option on `agent()` for findings (path, line, impact, severity, evidence, confidence) so results merge without parsing prose, and drop `null` results from stopped or failed agents.
5. **Disjoint edits.** Each file belongs to exactly one agent, or each agent works in an isolated copy; never two agents on one file.
6. **Verification inside, gates outside.** An adversarial verifier stage is the false-positive check an audit already owes. It does not replace REVIEW or AUDIT on the final diff: the coordinator dispatches those once (`ask-reviewer`, `ask-auditor`), with scope paths, a tool-call ceiling, the validation evidence already gathered, and P0/P1-only reporting.
7. **Loops validate, they do not review.** A keep-fixing loop runs the repository's check each round and stops after two rounds without progress; one review follows the final diff.
8. **Record the run.** The handoff names the script path (the host writes it under the session directory), the agent count, the stages, and what was verified. A saved workflow (`s` in `/workflows`, stored in the project `.claude/workflows/` or the personal one) suits a process repeated on every branch; reusing its evidence still needs an identical diff.

## Mapping to ASK skills

- **develop:** a migration or sweep over many independent files. Each agent takes a chunk of files sized to the guideline and works in its own isolated copy; a verify agent checks each result, then one coordinator review follows.
- **improve:** a repository-wide or multi-category audit. A recon agent lists the surface, each agent takes a chunk of files or modules for one category and returns findings, and a verifier tries to refute each before it is reported. The audit stays read-only.
- **research and deep-research:** Claude Code ships `/deep-research` as a built-in workflow that runs only when the user invokes it. The ASK research skills keep their own handoff and confidence rules; offer the built-in command when the user wants a cited report and nothing more.
- **code-review:** a very large diff may use one reviewer per file and one merger. That fan-out is the single REVIEW dispatch for the final diff, not an extra round; the coordinator still passes scope paths, a tool-call ceiling, and the validation evidence already gathered, and asks for P0/P1 only.
