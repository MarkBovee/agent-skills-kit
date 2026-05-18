---
name: using-nebu-skills
description: Use when starting normal software work and deciding which nebu workflow skill fits the current task.
triggers:
  - choose a skill
  - which skill
  - start software work
  - skill router
  - workflow selection
---

# Using Nebu Skills

Use the least process that keeps the work safe. These skills are helpers, not gates.

## Router

- New feature or design still fuzzy -> `nebu-brainstorming`
- Unclear request, fuzzy behavior, or real product tradeoffs -> `nebu-kickoff`
- Multi-file or multi-phase work -> `nebu-planning`
- Clear implementation work -> `nebu-implementation`
- Bug, failing test, or broken build -> `nebu-debugging`
- Behavior that should stay fixed -> `nebu-test-driven-development`
- Meaningful diff before handoff -> `nebu-code-review`
- About to claim success -> `nebu-verification`
- Creating or revising skills -> `writing-nebu-skills`

## Default rules

1. Prefer action over ceremony.
2. Ask only when the answer changes scope, UX, architecture, or acceptance.
3. Write plans and docs only when they buy clarity.
4. Delegate only when the work is parallel, repetitive, or context-heavy.
5. Be explicit about what is verified and what is not.

## Avoid

- Mandatory specs for trivial tasks
- Mandatory worktrees, commits, or branch rituals
- Mandatory subagents for tightly coupled edits
- Tiny-task theater that burns time without improving outcomes
