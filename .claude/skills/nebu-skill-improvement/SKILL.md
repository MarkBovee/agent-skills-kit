---
name: "nebu-skill-improvement"
description: "Use when agent behavior reveals a reusable workflow improvement, routing gap, or missing guardrail that should become a skill, plugin, or prompt-pack follow-up."
when_to_use: "Common triggers: improve skills, skill improvement, workflow improvement, routing gap, prompt pack improvement, reusable improvement, create follow-up issue, auto improvement."
---
# Nebu Skill Improvement

Turn repeated friction or missed judgment into a small reusable improvement.

## Pattern

1. Capture only reusable improvements, not one-off task details.
2. State observed gap in agent behavior: what was missed, guessed, repeated, or done too late.
3. Propose smallest durable fix: skill text, router hint, plugin behavior, or issue-flow guidance.
4. Prefer updating an existing skill over creating a new one when gap clearly belongs there.
5. If change is being implemented immediately, still create or reuse a tracking issue in the skill-pack source repo so the durable source stays aligned.
6. If change is not being implemented now, create follow-up issue with evidence and concrete proposed fix.
7. Before creating that issue, check whether equivalent open issue already exists. Reuse it instead of opening duplicate.
8. Keep issue body compact: observed pattern, why it matters, proposed change, and one concrete example.

## Hooks

1. After review, wrap-up, or verification, ask whether session exposed reusable workflow gap.
2. If yes, route to `nebu-skill-improvement` before ending session cold.
3. If improvement is clear and small, implement directly.
4. Even after direct fix, create or reuse source-tracking issue so upstream skill source also gets updated.
5. If improvement is real but not for now, track it as issue.

## Good candidates

- same missed step appears across multiple sessions
- skill lacks obvious guardrail or ordering rule
- router should bias toward better skill in recurring situation
- issue creation, review, verification, or wrap-up misses common safety check

## Use with

- `nebu-github-issues` when improvement should become tracked follow-up
- `nebu-writing-nebu-skills` when fix belongs in skill wording
- `nebu-code-review` when improvement was discovered during review
- `nebu-workspace-wrapup` when session is closing and reusable learning should not get lost

## Avoid

- filing issue for one-off typo or isolated repo bug
- creating new skills when existing one can absorb guidance
- vague meta-issues without observed pattern or proposed change
