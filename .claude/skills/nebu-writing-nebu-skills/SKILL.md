---
name: "nebu-writing-nebu-skills"
description: "Use when creating or revising skills and you want them short, searchable, trigger-focused, and easy for the model to actually follow."
when_to_use: "Common triggers: create skill, revise skill, skill design, trigger-focused, write skills."
---
# Writing Nebu Skills

Write skills that improve judgment without turning into constitutions.

## Rules

1. The description says **when to use**, not how the skill works.
2. Keep common skills short enough that loading them is worth it.
3. Prefer one clear pattern over a long manifesto.
4. Add support files only when the main file would become reference-heavy.
5. Make autonomous progress the default when the goal is clear.
6. General skills should not hardcode branded artifact trees or repo-local folder conventions.
7. Encode hard gates only for failures that are expensive and common.

## Design test

Ask:

- What mistake will the model make without this skill?
- What is the smallest guidance that prevents that mistake?
- Does this skill help discovery, or does it just add ceremony?

## Good defaults

- Use concrete trigger words and symptoms
- Name skills by action or problem
- Cross-reference other skills instead of repeating them
- Favor proportional process over universal mandates
- Reuse the repo's existing durable planning or spec system instead of inventing a new one

## Avoid

- Descriptions that summarize workflow
- Rules copied from one project's local preferences
- Repo-specific path recipes in generic skills
- Verbose policy docs disguised as reusable skills
