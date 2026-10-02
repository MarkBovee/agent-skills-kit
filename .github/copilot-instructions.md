# Agent Skills Kit for GitHub Copilot

This repository ships portable workflow skills under [.github/skills](./skills).

- Load the best matching skill before substantial work; use `develop` only as default.
- Large, exhaustive, compatibility-sensitive, or release-sensitive work: load `intake`, write a plan, classify must/should/could, and complete plan-check.
- Delegate independent research, validation, review, and audit. Never self-declare release readiness; require independent evidence.
- Meaningful code change: load `code-review`; skip only obvious, low-risk edits. Capture reusable workflow gaps with `write-skill`.
- Code edits need one concise intent comment above each function unless local convention overrides.
- Keep always-on guidance compact; load reusable procedure from skills.

## Host-neutral discovery

1. Use host skill root. Canonical source: `skills/*/SKILL.md`; installs: `~/.agents/skills/*/SKILL.md`, except OpenCode and dsh host roots.
2. Read frontmatter; load most specific matching `SKILL.md`. Use `develop` only without a specific match.
3. Add implied companions only: `design` → `design-review`; run `verification` before risk-required review or audit gates; use `research` for bounded facts, `deep-research` for autonomous multi-source work.
4. Native discovery suffices. OpenCode and dsh routers advise and track state; they do not load skills or run tools.
5. Workflow evidence markers belong in tool or subagent results; never include them in final user-facing responses.

## Coding standards

`ask-code-review` enforces these hard review rules:

- Intent comment above every function, method, handler, and utility.
- DRY: refactor 3+ duplications.
- Meaningful names; avoid generic `data`, `result`, `code`, `updated`.
- Named data shapes over loose payloads.
- Language rules: const over let, ===, Python type hints, shell pipefail.

Full standard at [rules/coding-standards.md](../../rules/coding-standards.md) in the repo.

## Installed skills

- agent-workflows: Agent Workflows: Use when coordinating multi-agent or parallel work, subagent delegation, task ha...
- code-review: Code Review: Use when a meaningful diff is ready and fresh eyes should catch requirement gaps, re...
- debugging: Debugging: Use when a bug, failing test, or broken build has no clear local cause, or a first fix...
- deep-research: Deep Research: Use when a complex technical question needs autonomous multi-source investigation,...
- design: Design: Use to design, redesign, polish, or implement UI/UX for web or mobile interfaces, landing...
- design-review: Design Review: Review an existing design, UI, or copy for AI-generated default patterns and quali...
- develop: Develop: Default baseline for normal software work: small safe iterations, built-in validation, a...
- gh-inbox: GitHub Inbox: Use when asked to check the GitHub inbox, triage or reply to the repository's issue...
