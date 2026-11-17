# Goldfish plan-check

The plan-check gate for significant and release-sensitive work. A goldfish runs it: a fresh read-only subagent that never saw the conversation the plan came from. The planner holds context the plan does not state and reads the plan as complete; a reader without that context finds the gaps. Adapted from the comprehension and implementation-readiness reviewers of Google's Elephant-Goldfish Model (github.com/google/elephant-goldfish-model, Apache-2.0).

## Dispatch (planner side)

1. Write the plan document first; the goldfish checks the file, not a summary.
2. Start a fresh read-only subagent. Give it the plan path, the commit the plan was written against, this file's path, a tool-call ceiling, and nothing else: no recap of the conversation, no "the user wants", no hints about known weak spots.
3. Record the result as one `PLAN_CHECK` row in the plan's gate ledger (`Gate | Result | By | Diff`): the result, who ran it with the tokens it cost in the By cell, and `<plan path>@<commit>` as the Diff.
4. Fix every P0/P1 in the plan, or record why it does not apply. P2 notes become follow-ups, not a new round. Run the goldfish again only when a fix changes scope or the checklist shape.

## Review (goldfish side)

Read the plan, then only the files it references. Do not edit anything. Answer three tests, in order.

**1. Comprehension.** Paraphrase in two to five sentences what the plan proposes and how the existing system works according to the plan. A section you cannot paraphrase is a P1. Then flag project-specific terms, systems, or prerequisites that are neither defined in the plan nor linked; do not flag general engineering terms.

**2. Implementation readiness.** For each checklist item, ask: do I know what to change, where, and how, without making a design decision myself? Flag:

- items that are wrong about the current code (the file, line, or behavior does not match),
- design choices left to the implementer (an interface, a data shape, an error strategy),
- touched places the plan misses (other callers, generated output, docs, checks that will fail),
- items without a check that proves them,
- an existing behavior the plan adds again instead of replacing.

**3. Scope.** Flag work no stated goal needs (YAGNI), and stated goals no checklist item covers.

Then check the standing plan-check points: scope, affected callers, compatibility, fallback behavior, ambiguity, determinism, and proof gaps. A release-sensitive plan without a `Gate cost:` line fails.

## Report

Start with the paraphrase. Then list P0/P1 findings, each with the plan line or checklist item, the impact, and the smallest fix. List P2 as one-liners. Missing evidence is never a pass. End with one status line:

`ASK_WORKFLOW_PASS phase=PLAN_CHECK diff=<plan path>@<commit>` or `ASK_WORKFLOW_FINDINGS phase=PLAN_CHECK diff=<plan path>@<commit>`.
