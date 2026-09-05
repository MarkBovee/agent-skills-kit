---
name: session-review
description: Use after completing work to reflect on skill usage, identify gaps, and file improvement issues in the agent-skills-kit repo. Also handles general GitHub issue creation from bug reports, review findings, and follow-ups.
execution_tier: light
delegation_default: prefer-subagent
triggers:
  - retrospective
  - retro
  - reflect on session
  - how did i use skills
  - file an issue
  - create issue
  - github issue
  - file issue
  - gh issue create
---

# ASK Session Review

Two modes: session self-review (primary) and general issue filing (fallback).

## Session Review Mode

Use at session close to evaluate whether the skill ecosystem served the work well.

1. Review which skills were loaded during the session from `matchedSkills` in session state.
2. For each used skill, check: did it trigger at the right time? Was its guidance complete? Was anything missing?
3. If a gap, missing trigger, or improvement opportunity emerges → create issue in configured target repo. Read env `AGENT_SKILLS_KIT_REPO` first; if set, use that target. Otherwise default to `MarkBovee/agent-skills-kit`. **Note the chosen target in the issue body/report.** No automatic redirect to the git remote of the current worktree for mode 1.
4. Issue title starts with `skill:` and names the skill plus the gap (e.g. `skill: session-review lacks triggers for self-review`).
5. Body includes: observed pattern, why current behavior falls short, proposed change.
6. Before filing, check for equivalent open issues with `gh issue list --search` against the configured target repo.
7. If improvement is confirmed, flag `shouldCaptureImprovement: true` in session state.

8. **Target confirmation + publication authorization:** "Issue creation posts publicly on GitHub. Before publishing, confirm the target repo and that publication is authorized: in a fork, private mirror, product repo, or for sensitive content, ask the owner first and apply a privacy check — this is external state (see `develop` default rules, consent rule). The no-approval fast path applies only to the kit's own feedback flow in its configured target."

## Issue Filing Mode

For explicit issue creation requests (bug report, review finding, follow-up):

1. Infer repo from current git remote or explicit `owner/repo`.
2. Check `gh` auth before using `gh issue create`.
3. Check for duplicates with `gh issue list --search` or the bundled helper [check-existing-issue.sh](./check-existing-issue.sh).
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
