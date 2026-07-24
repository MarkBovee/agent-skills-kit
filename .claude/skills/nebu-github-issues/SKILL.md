---
name: "github-issues"
description: "Use when creating a GitHub issue from a bug report, review finding, failed attempt, or requested follow-up, especially when the repo may need to be inferred from the current checkout."
when_to_use: "Common triggers: create issue, github issue, file issue, gh issue create, bug report."
disable-model-invocation: true
---
# Nebu GitHub Issues

Turn concrete context into a real GitHub issue quickly.

## Pattern

1. Use the explicit `owner/repo` if the user gave one. Otherwise infer the repo from the current git remote; if there is no clear current repo, ask once.
2. Check that `gh` auth is available before depending on `gh issue create`.
3. Extract the smallest clear title that names the problem or requested change.
4. Before creating a new issue, check for an equivalent open issue with `gh issue list --search` or similar repo-native search. Reuse the existing issue when the match is clear.
5. Use the bundled helper `${CLAUDE_SKILL_DIR}/check-existing-issue.sh` when you want a fast default duplicate check.
6. Build a compact body from the evidence already in the conversation: problem, impact, repro or observed failure, and expected outcome when relevant.
7. Create the issue directly once the title and body are clear. Do not add a draft approval loop unless the user asked for one.
8. Add labels sparingly: only explicit user-requested labels or one to two obvious repo-standard labels. If label names are uncertain, skip them.
9. Return the issue URL and note any assumptions such as inferred repo, duplicate reuse, or skipped labels.

## Use with

- `intake` when the problem statement or scope is still unclear
- `code-review` when review findings should become follow-up issues
- `write-skill` when the issue is about improving reusable agent workflow or skill behavior

## Avoid

- Guessing a repo outside the current checkout
- Opening duplicate issues when a clear existing open issue already matches
- Inventing labels, milestones, assignees, or project metadata
- Writing a heavyweight template for a small issue
- Asking for confirmation after the user already asked to file the issue and the details are clear
