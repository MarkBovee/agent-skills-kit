---
name: "session-review"
description: "Use after completing work to reflect on skill usage, identify gaps, and file improvement issues in the nebu-skills repo. Also handles general GitHub issue creation from bug reports, review findings, and follow-ups."
when_to_use: "Common triggers: retrospective, retro, reflect on session, how did i use skills, file an issue, create issue, github issue, file issue, gh issue create."
---
# Nebu Session Review

Two modes: session self-review (primary) and general issue filing (fallback).

## Session Review Mode

Use at session close to evaluate whether the skill ecosystem served the work well.

1. Review which skills were loaded during the session from `matchedSkills` in session state.
2. For each used skill, check: did it trigger at the right time? Was its guidance complete? Was anything missing?
3. If a gap, missing trigger, or improvement opportunity emerges → create issue in `MarkBovee/nebu-skills`.
4. Issue title starts with `skill:` and names the skill plus the gap (e.g. `skill: session-review lacks triggers for self-review`).
5. Body includes: observed pattern, why current behavior falls short, proposed change.
6. Before filing, check for equivalent open issues with `gh issue list --search` against `MarkBovee/nebu-skills`.
7. If improvement is confirmed, flag `shouldCaptureImprovement: true` in session state.

## Issue Filing Mode

For explicit issue creation requests (bug report, review finding, follow-up):

1. Infer repo from current git remote or explicit `owner/repo`.
2. Check `gh` auth before using `gh issue create`.
3. Check for duplicates with `gh issue list --search` or the bundled helper `${CLAUDE_SKILL_DIR}/check-existing-issue.sh`.
4. Build compact body: problem, impact, repro/evidence, expected outcome.
5. Create issue directly — no draft approval loop.
6. Return URL and note assumptions.

## Use with

- `code-review` when review findings should become follow-up issues
- `write-skill` when improvement should become a tracked change
- `verification` when session is closing and reusable learning should not get lost

## Avoid

- Filing issues for one-off typos or isolated repo bugs
- Guessing a repo outside the current checkout
- Duplicate issues when a clear match exists
- Vague meta-issues without observed pattern or proposed change
