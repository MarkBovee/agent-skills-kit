# Staged Delegation

Use when refactoring splits into dependent steps with mixed complexity (e.g. service-by-service refactor). Not for parallel work — use plain `Delegate` for that.

1. **Break work into ordered stages.** Each stage builds on the previous one. No parallelism.
2. **Tag each stage with a complexity tier** (light/standard/heavy). See model tiering in `model-tiering.md`.
3. **Peak-pricing check** before dispatch: mention the host's router peak-window warning (`isInPeakWindow`) briefly if shown — never block, leave the choice to the user.
4. **Dispatch stage N** with the right agent tier. Output must contain the dependency for stage N+1.
5. **Validate.** Does the output match scope? Tests green? If not: re-dispatch with a narrower scope instead of taking over yourself.
6. **Commit per stage** on the work branch. Only proceed to stage N+1 on green.
7. **Re-dispatch on failure.** Reformulate the subtask more specifically and dispatch again. Only do it yourself for trivial corrections.

Output contract per stage:
- Structured output, no narrative
- Dependency for the next stage
- Test results