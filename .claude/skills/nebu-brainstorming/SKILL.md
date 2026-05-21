---
name: "nebu-brainstorming"
description: "Use when shaping a new feature, system, or behavior where the solution is still fuzzy and a short design conversation would prevent wrong implementation."
when_to_use: "Common triggers: brainstorm, fuzzy idea, design tradeoff, unsure what to build, product direction."
---
# Nebu Brainstorming

Turn vague ideas into a clear enough design to build without dragging small work into heavyweight process.

## Use this instead of `nebu-kickoff` when

- the user is still exploring what to build
- architecture or UX direction is unsettled
- there are real product or design tradeoffs
- early choices are expensive to unwind

For small or local ambiguity, use `nebu-kickoff`.

## Pattern

1. Read the current context first: existing code, docs, plans, active change records, and constraints.
2. Ask one focused question at a time. Prefer multiple choice when it fits.
3. Make assumptions explicit, especially around non-goals, scale, security, reliability, and ownership.
4. Before proposing design, summarize understanding in a few bullets and ask for correction if needed.
5. Propose 2-3 viable approaches with a recommendation and clear tradeoffs.
6. Present the chosen design in small sections and validate as you go.
7. Once the direction is chosen, stop brainstorming and move toward execution.
8. Capture decisions only when future readers will benefit, and store them in the repo's existing durable planning or spec system.

## Good defaults

- Clarify the problem before the solution
- Separate confirmed facts from assumptions
- Prefer the simplest design that still meets the need
- Keep documentation proportional

## Use with

- `nebu-kickoff` once the direction is chosen and execution ambiguity remains

## Avoid

- Mandatory spec-writing for trivial work
- Endless questioning after the direction is already clear
- Hard blocking implementation just because brainstorming started
- Creating a parallel planning tree when the repo already has a durable one
- Turning assumptions into facts without saying so
