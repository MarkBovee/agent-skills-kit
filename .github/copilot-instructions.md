# Agent Skills Kit for GitHub Copilot

This repository ships portable workflow skills under [.github/skills](./skills).

- Use the router to select the best matching skill before substantial work, then read its `SKILL.md` directly; use `develop` only as default.
- Large, exhaustive, compatibility-sensitive, or release-sensitive work: load `intake`, write a plan, classify must/should/could, and complete plan-check.
- Delegate independent research, validation, review, and audit. Never self-declare release readiness; require independent evidence.
- Meaningful code change: load `code-review`; skip only obvious, low-risk edits. Capture reusable workflow gaps with `write-skill`.
- Code edits need one concise intent comment above each function unless local convention overrides.
- Keep always-on guidance compact; read reusable procedure from the router-selected skill file.

## Host-neutral discovery

1. Use the host skill root. Canonical source: `skills/*/SKILL.md`; shared install: `~/.agents/skills/*/SKILL.md`.
2. Route first, then read the most specific matching `SKILL.md` directly. Use `develop` only without a specific match.
3. Add implied companions only: `design` → `design-review`; run `verification` before risk-required review or audit gates; use `research` for bounded facts, `deep-research` for autonomous multi-source work.
4. Routers select and load skills by reading their files; do not invoke hidden leaf skills through a native skill action.
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

- agent-workflows: Agent Workflows: Use when coordinating subagents or parallel work, handing off tasks, or running...
- code-review: Code Review: Use when a meaningful diff is ready and fresh eyes should catch requirement gaps, re...
- debugging: Debugging: Use when a bug, failing test, crash, wrong result, or broken build needs a root cause,...
- deep-research: Deep Research: Use when a complex technical question needs autonomous multi-source investigation,...
- design: Design: Use to design, redesign, polish, or implement UI/UX for web or mobile interfaces, landing...
- design-review: Design Review: Review an existing design, UI, or copy for AI-generated default patterns and quali...
- develop: Develop: Use for normal implementation work (add, fix, refactor, build a feature) when no more sp...
- gh-inbox: GitHub Inbox: Use when asked to check the GitHub inbox, triage or reply to the repository's issue...
