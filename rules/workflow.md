# ASK Workflow Mandate

- Use the installed router to select the most specific matching workflow skill before substantial work, then read the `SKILL.md` path the router shows (shared install: `~/.agents/skills/ask-<name>/SKILL.md`). Do not invoke model-invocation-disabled leaf skills through a native Skill tool; plugins may use their own dispatch paths.
- After a checkpoint, compaction, or resume, treat summarized skill use as historical: re-read the matching workflow skills and compare the plan and gate ledger with the repository before editing.
- Large, multi-issue, exhaustive, compatibility-sensitive, or release-sensitive work: load `intake`, create plan artifact, classify risk, set must/should/could, complete plan-check before execution.
- Maximum-result brief: classify every evidence-backed item as must, should, could, or explicitly out. Deferred item needs reason and revisit trigger.
- Delegate independent research, validation, review, and audit when required by risk or when a separate context materially improves evidence. One coordinator reconciles evidence and integrates final result.
- Never declare merge, release, or tag readiness from self-review alone. Release-sensitive work needs independent validation, review, audit, and release-gate evidence from outside implementer context.
- Keep repository-specific names task-local, never generic workflow behavior.
- Gate once on the final diff, never while iterating. Every review or audit dispatch states scope paths, a tool-call ceiling, and the validation evidence already gathered, and asks for P0/P1 only; P2 notes become follow-ups, not new rounds. A delta gate runs only for a behavior change and only the gate that matches the finding.
