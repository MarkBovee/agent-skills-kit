---
name: nebu-github-issues
description: Use when creating a GitHub issue from a bug report, review finding, failed attempt, or requested follow-up, especially when the repo may need to be inferred from the current checkout.
triggers:
  - create issue
  - github issue
  - file issue
  - gh issue create
  - bug report
---

# Nebu GitHub Issues

Turn concrete context into a real GitHub issue quickly.

## Pattern

1. Use the explicit `owner/repo` if the user gave one. Otherwise infer the repo from the current git remote; if there is no clear current repo, ask once.
2. Check that `gh` auth is available before depending on `gh issue create`.
3. Extract the smallest clear title that names the problem or requested change.
4. Build a compact body from the evidence already in the conversation: problem, impact, repro or observed failure, and expected outcome when relevant.
5. Create the issue directly once the title and body are clear. Do not add a draft approval loop unless the user asked for one.
6. Add labels sparingly: only explicit user-requested labels or one to two obvious repo-standard labels. If label names are uncertain, skip them.
7. Return the issue URL and note any assumptions such as inferred repo or skipped labels.

## Use with

- `nebu-kickoff` when the problem statement or scope is still unclear
- `nebu-code-review` when review findings should become follow-up issues

## Avoid

- Guessing a repo outside the current checkout
- Inventing labels, milestones, assignees, or project metadata
- Writing a heavyweight template for a small issue
- Asking for confirmation after the user already asked to file the issue and the details are clear
