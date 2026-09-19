---
name: "session-review"
description: "Use after completing work to reflect on skill usage, identify gaps, and file improvement issues in the agent-skills-kit repo. Also handles general GitHub issue creation from bug reports, review findings, and follow-ups. Common triggers: retrospective, retro, reflect on session, how did i use skills, file an issue, create issue, github issue, file issue, gh issue create."
---
# ASK Session Review

Two modes: session self-review (primary) and general issue filing (fallback).

## Session Review Mode

Use at session close to evaluate whether the skill ecosystem served the work well.

This mode reviews only ASK skills supplied by the active Agent Skills Kit distribution. A candidate is ASK-owned when it was loaded from its canonical ASK source: the `skills/*/SKILL.md` tree in a source checkout or the host's installed/shared ASK skill root. Do not infer ASK ownership from its mention in a consuming repository's instructions.

1. Identify ASK skills loaded during the session from `matchedSkills` in session state.
2. For each ASK skill, check: did it trigger at the right time? Was its guidance complete? Was anything missing?
3. Do not treat a project-specific skill named in a consuming repository's instructions as an ASK skill. Its availability and guidance belong to that project's source repository; do not create an ASK issue or set `shouldCaptureImprovement` for it.
4. If an ASK gap, missing trigger, or improvement opportunity emerges → create issue in `MarkBovee/agent-skills-kit`.
5. Issue title starts with `skill:` and names the ASK skill plus the gap (e.g. `skill: session-review lacks triggers for self-review`).
6. Body includes: observed pattern, why current behavior falls short, proposed change.
7. Before filing, check for equivalent open issues with `gh issue list --search` against `MarkBovee/agent-skills-kit`.
8. If an ASK improvement is confirmed, flag `shouldCaptureImprovement: true` in session state.

For a project-specific skill gap, report the owning project and repository in the review output. File an issue there only when the user explicitly requests general issue filing mode.

When code changes exist, report stale or mismatched review evidence explicitly, including expected edit generation or diff identity when available. Do not leave an unresolved review obligation looking complete.

### When session state is unavailable

Reconstruct relevant skill use from the transcript: explicit `skill` calls, loaded `SKILL.md` files, router matches, and the work actually performed. Mark this reconstruction as best-effort. If state cannot be written, record the improvement in the review output or issue instead of claiming the session flag was updated.

### Record release-gate cost

When the session ran a release gate, record what the validation/audit actually cost versus what was planned (see `intake`'s release-gate cost decision). Note the outcome: a delta re-check that a `standard` tier closed in seconds, or an over-scoped `deep` run that wasted minutes and was aborted. Feed that back as `skill:` guidance so the next release starts at the right tier instead of repeating the expensive default.

## Evidence-aware issue communication

When writing an issue, follow the shared evidence-aware policy:

- Establish current state from the complete available context before describing a gap.
- Distinguish observed evidence, conclusions, and information still needed.
- Keep the workflow phase explicit when a report has moved into implementation, release, or verification.
- Ask for new evidence only when a changed version, configuration, or environment makes a fresh capture necessary; explain what it will verify.
- Prefer the smallest concrete next step over a broad diagnostic checklist.

## Issue Filing Mode

For explicit issue creation requests (bug report, review finding, follow-up):

1. Infer repo from current git remote or explicit `owner/repo`.
2. Check `gh` auth before using `gh issue create`.
3. Check for duplicates with `gh issue list --search` or the bundled helper `.github/skills/ask-session-review/check-existing-issue.sh`.
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
