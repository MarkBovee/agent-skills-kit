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

- agent-workflows: Agent Workflows: Coordinates subagents and parallel work, handoffs, and release chores (version b...
- code-review: Code Review: Reviews a meaningful diff for requirement gaps, regressions, and risky design. Use w...
- debugging: Debugging: Finds root causes of bugs, failing tests, crashes, wrong results, and broken builds. U...
- deep-research: Deep Research: Runs autonomous multi-source investigation with contradiction analysis and a cited...
- design: Design: Designs, redesigns, polishes, and implements UI/UX for web or mobile, landing pages, dash...
- design-review: Design Review: Reviews an existing design, UI, or page copy for an AI-generated look and quality...
- develop: Develop: Drives normal implementation work in small, validated iterations. Use to add, fix, refac...
- gh-inbox: GitHub Inbox: Triages and replies to a repository's issues and discussions. Use when asked to che...
