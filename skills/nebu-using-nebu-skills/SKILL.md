---
name: nebu-using-nebu-skills
description: Choose a Nebu workflow skill when starting software work, asking for autopilot mode, saying ga door or werk door, or deciding how to keep going without unnecessary stop points.
triggers:
  - choose a skill
  - which skill
  - autopilot mode
  - keep going
  - continue without waiting
  - ga door
  - werk door
  - ga verder
  - zonder te wachten
  - niet stoppen
  - start software work
  - skill router
  - workflow selection
---

# Using Nebu Skills

Use the least process that keeps the work safe. These skills are helpers, not gates.

For normal software work, `nebu-kaizen` is the default baseline. Add a more specific skill when the task needs stronger guidance.

## Router

- Normal implementation, refactor, design, or process improvement -> `nebu-kaizen`
- New feature or design still fuzzy -> `nebu-brainstorming`
- Unclear request, fuzzy behavior, or real product tradeoffs -> `nebu-kickoff`
- Multi-file or multi-phase work -> `nebu-planning`
- Clear implementation work -> `nebu-implementation`
- Bug, failing test, or broken build -> `nebu-debugging`
- Behavior that should stay fixed -> `nebu-test-driven-development`
- Meaningful diff before handoff -> `nebu-code-review`
- About to claim success -> `nebu-verification`
- Cleanup, simplification, restructuring -> `nebu-refactoring`
- UI/UX design or implementation -> `nebu-ui-ux`
- Multi-agent coordination -> `nebu-agent-workflows`
- Finishing work across repos -> `nebu-workspace-wrapup`
- Creating or revising skills -> `nebu-writing-nebu-skills`

## Default rules

1. Prefer action over ceremony.
2. When the goal is clear, keep working until done instead of pausing at every milestone.
3. Run a small internal loop per chunk: inspect, create, test, review, continue.
4. Ask only when the answer changes scope, UX, architecture, safety, or acceptance.
5. Write plans and docs only when they buy clarity, and reuse the repo's existing durable system instead of inventing a parallel one.
6. Delegate only when the work is parallel, repetitive, or context-heavy.
7. Be explicit about what is verified and what is not.

## Avoid

- Mandatory specs for trivial tasks
- Mandatory worktrees, commits, or branch rituals
- Mandatory subagents for tightly coupled edits
- Stopping after every substep just to ask for permission again
- Tiny-task theater that burns time without improving outcomes
