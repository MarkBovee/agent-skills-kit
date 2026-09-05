---
name: "develop"
description: "Default baseline skill for normal software work: small safe iterations, built-in validation, no unnecessary pauses between clear next steps. Includes mode selection (direct, batch, delegate) and cheap-first escalation for bounded mechanical chores."
when_to_use: "Common triggers: develop, kaizen, autopilot, keep going, continue without waiting, do not stop, don't stop, ga door, werk door, volgende logische stap, volgende stap, start working, start coding, get started, zonder te wachten, niet stoppen, gewoon doorgaan, ga verder, implement this, fix this, add this, pas dit aan, maak dit af, implement, implementeer dit, keep coding, continue implementation, work through steps, code change, start implementing, start implementation, batch edits, delegate work, subagent, maak dit werkend, rewrite, herbouw, coordinator, coördinator, omwerken, entity rewrite, refactor, code aanpassen, werk dit bij, build this, development."
---
# ASK Develop

Default to steady progress: inspect, create, test, review, continue. If the next logical step is clear, keep going without pausing for routine check-ins.

## Choose the mode

- **Direct:** known files, tight coupling, fast iteration, nuanced judgment
- **Delegate:** independent research, parallelizable subtasks, noisy command runs, or specialized review
- **Delegate (staged):** sequential dependency chain, each step with its own complexity. Step B builds on step A's output. The main agent orchestrates, validates each step, and only proceeds on green light.
- **Batch:** related reads, searches, and edits that can be done safely together

## Cheap-first escalation

1. Start bounded mechanical chores on the smallest viable agent or subagent.
2. Validate the result before widening context.
3. Escalate to default agent only if scope grows beyond the original bounded task.
4. Escalate to high or xhigh only for cross-cutting, analysis-heavy, or repeatedly failing work.

### Model tiering by task reasoning

| Complexity | Tier → model | Fits |
|---|---|---|
| Mechanical, boilerplate, bounded parsing | light / mini → **mini** | payment-service split |
| Nuanced but contained | standard / default → **default** | report pipeline |
| Cross-cutting, implicit reasoning, error handling | heavy / high → **high** | coordinator-service refactor |

## Staged delegation

Use when refactoring splits into dependent steps with mixed complexity. Not for parallel work: use `agent-workflows`.

1. Break work into ordered stages. Each stage builds on the previous one.
2. Tag each stage with a complexity tier. See the model tiering table above.
3. Mention the host's peak-window warning if shown; never block on it.
4. Dispatch stage N with the dependency needed by stage N+1.
5. Validate scope and tests before continuing; re-dispatch narrowly on failure.
6. Commit per stage on the authorized work branch.
7. Return structured output, next-stage dependency, and test results.

## Core loop

0. **Plan if missing.** Non-trivial task (3+ changes, multi-file, risky) without a plan? If scope is new or unclear, load `intake` first. Otherwise generate inline plan with `todowrite` or short bullets. Trivial 1-2 edits: skip.
1. Inspect the next boundary that matters.
2. Create the smallest coherent improvement.
3. Test it with the fastest trustworthy proof.
4. Review it for clarity, safety, consistency, and scope.
5. Continue unless a real blocker or decision point appears.

## Git workflow (default)

Follow the repo's contributor guidance. Run git steps only on the repository and branch the user authorized for this task.

### Feature
1. Branch from main.
2. Open a draft PR with scope description.
3. Commit iteratively and push only when authorized.
4. Mark ready, review, then squash merge with a Conventional Commits message.
5. Delete branches only after explicit authorization.

### Bugfix
Same flow on a `fix/` branch; draft PR optional for small fixes.

### Hotfix
Fix branch, review, merge, then tag through the release helper. No feature iteration.

## Default rules

1. Do not stop after every milestone when the next step is already clear.
2. Plan before doing. If task is non-trivial and no plan exists, generate one before moving to inspection.
3. Ask only when the answer changes scope, product behavior, architecture, safety, or acceptance.
4. Prefer preventing mistakes early with types, validation, guards, and simpler control flow.
5. Follow existing repo patterns before inventing new ones. Build only what the current requirement needs.
6. After code changes, do a proportional review pass. Load `code-review` when the diff is meaningful, subtle, or risky.
7. When work reveals reusable workflow friction, capture it with `write-skill`.
8. Reuse the repo's existing durable planning or spec system; do not create a parallel doc tree.
9. Delegate only when the work is parallel, repetitive, or context-heavy.
10. Follow the standard git workflow: branch, draft PR, commits, squash merge, cleanup. **Run these git steps only on the repository and branch the user authorized for this task: confirm before pushing, opening a PR, merging, or deleting branches whenever the current branch or remote target is ambiguous — never auto-merge or delete branches as a side effect of 'done'.**
11. **Never modify or delete external system state** (entity registries, device registries, databases, config files on remote hosts) without showing the user what will change and asking for confirmation. "Check X then do Y" means show check results first, then ask before acting.

12. **Classify every failed call before retrying:** (a) invalid arguments or a parameter error → fix the arguments and re-run once; (b) policy denial or blocked operation → do not retry the same call; use an in-scope alternative or stop and report; (c) genuine defect → debug it. Every retry must differ from the failed attempt; after two attempts on one hypothesis, zoom out. Permission escalation is only a one-shot retry of a command actually denied for access, with strictly wider access — never without a real denial, and never when the host has approval prompts disabled (that denial is final; do not work around it).

## Use with

- `intake` for ambiguity that could change the implementation — intake can also identify stages during planning
- `ui-ux` for interface work that needs visual direction and screenshot-based review
- `code-review` after meaningful code edits and before handoff
- `debugging` for bugs, failing tests, and broken builds
- `verification` before claiming success
- `improve` when the codebase needs a structured audit or refactoring pass
- `agent-workflows` for parallel delegation and the output contract for subagent tasks

## Avoid

- Big-bang rewrites when an incremental change will do
- Speculative abstractions or future-proofing theater
- Repeated approval pauses during obvious execution
- Leaving small in-scope paper cuts behind when they are cheap to fix safely
- Re-reading the same files without learning anything new
- Delegating tightly coupled changes that need shared judgment
- Treating process as a substitute for thinking
