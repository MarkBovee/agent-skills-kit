---
name: nebu-writing-nebu-skills
description: Use when creating or revising skills, or when agent behavior reveals a reusable workflow improvement, routing gap, or missing guardrail that should become a skill, plugin, or prompt-pack follow-up.
execution_tier: standard
triggers:
  - create skill
  - revise skill
  - skill design
  - trigger-focused
  - write skills
  - improve skills
  - skill improvement
  - skill gap
  - workflow improvement
  - routing gap
  - missing guardrail
  - prompt pack improvement
  - reusable improvement
  - agent missed
  - auto improvement
---

# Writing Nebu Skills

Two modes: (1) create or revise skills that improve agent judgment, (2) capture reusable workflow gaps observed during sessions.

## Creating skills

### Design rules

1. The description says **when to use**, not how the skill works.
2. Keep common skills short enough that loading them is worth it.
3. Prefer one clear pattern over a long manifesto.
4. Add support files only when the main file would become reference-heavy.
5. Make autonomous progress the default when the goal is clear.
6. General skills should not hardcode branded artifact trees or repo-local folder conventions.
7. Encode hard gates only for failures that are expensive and common.

### Design test

- What mistake will the model make without this skill?
- What is the smallest guidance that prevents that mistake?
- Does this skill help discovery, or does it just add ceremony?

## Capturing workflow improvements

When agent behavior reveals a reusable gap:

1. State observed gap: what was missed, guessed, repeated, or done too late.
2. Propose smallest durable fix: skill text, router hint, plugin behavior, or issue-flow guidance.
3. Prefer updating an existing skill over creating a new one.
4. If implementing immediately, still create or reuse a tracking issue in the skill-pack source repo.
5. If not implementing now, create follow-up issue with evidence and concrete proposed fix.

### Hooks

1. After review or verification, check whether session exposed reusable workflow gap.
2. If yes, load this skill before ending session cold.
3. If improvement is clear and small, implement directly. Even after direct fix, create or reuse source-tracking issue.

### Good candidates

- Same missed step appears across multiple sessions
- Skill lacks obvious guardrail or ordering rule
- Router should bias toward better skill in recurring situation
- Issue creation, review, or verification misses common safety check

## Use with

- `nebu-github-issues` when improvement should become tracked follow-up
- `nebu-code-review` when improvement was discovered during review
- `nebu-verification` when session is closing and reusable learning should not get lost

## Avoid

- Filing issue for one-off typo or isolated repo bug
- Creating new skills when existing one can absorb guidance
- Vague meta-issues without observed pattern or proposed change
- Descriptions that summarize workflow instead of saying when to use
- Repo-specific path recipes in generic skills
