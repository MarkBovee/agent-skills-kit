---
name: "develop"
description: "Default baseline skill for normal software work: small safe iterations, built-in validation, no unnecessary pauses between clear next steps. Includes mode selection (direct, batch, delegate) and cheap-first escalation for bounded mechanical chores. Common triggers: develop, kaizen, autopilot, keep going, continue without waiting, do not stop, don't stop, ga door, werk door, volgende logische stap, volgende stap, start working, start coding, get started, zonder te wachten, niet stoppen, gewoon..."
whenToUse: "Common triggers: develop, kaizen, autopilot, keep going, continue without waiting, do not stop, don't stop, ga door, werk door, volgende logische stap, volgende stap, start working, start coding, get started, zonder te wachten, niet stoppen, gewoon doorgaan, ga verder, implement this, fix this, add this, pas dit aan, maak dit af, implement, implementeer dit, keep coding, continue implementation, work through steps, code change, start implementing, start implementation, batch edits, delegate work, subagent, maak dit werkend, rewrite, herbouw, coordinator, coördinator, omwerken, entity rewrite, refactor, code aanpassen, werk dit bij, build this, development."
---
# ASK Develop

Default to steady progress: inspect, create, test, review, continue. If the next logical step is clear, keep going without pausing for routine check-ins.

## Mandatory style gate

Before any formatting or refactoring, inspect the active file, nearby user-authored code, `.editorconfig`, and language/tool configuration. Establish the repository's valid local style before invoking a tool. Use 240 characters as ASK's default C# maximum line width unless `.editorconfig` explicitly overrides it. Scope formatting to the intended language and file set, preserve valid compact code, newline brace placement, and workflow-boundary comments, and keep C#, XML, project files, and IDE configuration on separate paths. Keep fitting method signatures and calls compact instead of wrapping them to a generic width. If the style is ambiguous or a formatter would rewrite valid local style, stop and ask or constrain the tool; never apply generic defaults. Afterward, inspect a representative example and the complete Git tree for unintended generated output, including tracked `bin/` or `obj/` files. This is a hard gate, not a suggestion.

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

### Execution tiers by task reasoning

| Complexity | Execution tier | Fits |
|---|---|---|
| Mechanical, boilerplate, bounded parsing | light | EbusService, RegisterService, EntityFactoryService |
| Nuanced but contained | standard | — |
| Cross-cutting, implicit reasoning, error handling | heavy | DiscoveryService, CoordinatorService |

## Staged delegation

Use when refactoring splits into dependent steps with mixed complexity (e.g. service-by-service refactor). Not for parallel work — use plain `Delegate` for that.

1. **Break work into ordered stages.** Each stage builds on the previous one. No parallelism.
2. **Tag each stage with a complexity tier** (light/standard/heavy). See model tiering above.
3. **Dispatch stage N** with the right execution tier. Output must contain the dependency for stage N+1.
4. **Validate.** Does the output match scope? Tests green? If not: re-dispatch with a narrower scope instead of taking over yourself.
5. **Commit per stage** on the work branch. Only proceed to stage N+1 on green.
6. **Re-dispatch on failure.** Reformulate the subtask more specifically and dispatch again. Only do it yourself for trivial corrections.

Output contract per stage (see `agent-workflows` for the full contract):
- Structured output, no narrative
- Dependency for the next stage
- Test results

## Core loop

0. **Plan if missing.** Non-trivial task (3+ changes, multi-file, risky) without a plan? If scope is new or unclear, load `intake` first. Otherwise generate inline plan with `todowrite` or short bullets. Trivial 1-2 edits: skip.
1. Inspect the next boundary that matters.
2. Create the smallest coherent improvement.
3. Test it with the fastest trustworthy proof.
4. Review it for clarity, safety, consistency, and scope.
5. Continue unless a real blocker or decision point appears.

## Git workflow (default)

### Feature
1. Branch from main: `git checkout -b feat/description main`
2. Open a draft PR right away with title + short scope description
3. Commit iteratively, push regularly, PR updates itself
4. Done? Mark PR ready → review → squash merge with a Conventional Commits message
5. Delete remote + local branch, `git checkout main && git pull`

### Bugfix
Same flow, `git checkout -b fix/description main`. Draft PR optional (small enough to open directly).

### Hotfix
Same flow as release: fix branch → PR → merge → tag. No feature iteration.

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
10. Follow the standard git workflow: branch, draft PR, commits, squash merge, cleanup.
11. **Never modify or delete external system state** (entity registries, device registries, databases, config files on remote hosts) without showing the user what will change and asking for confirmation. "Check X then do Y" means show check results first, then ask before acting.

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
