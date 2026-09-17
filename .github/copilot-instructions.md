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
3. Add implied companions only: `design` → `design-review`, `code-review` → `verification`; use `research` for bounded facts, `deep-research` for autonomous multi-source work.
4. Native discovery suffices. OpenCode and dsh routers advise and track state; they do not load skills or run tools.

## Coding standards

`ask-code-review` enforces these hard review rules:

- Intent comment above every function, method, handler, and utility.
- DRY: refactor 3+ duplications.
- Meaningful names; avoid generic `data`, `result`, `code`, `updated`.
- Named data shapes over loose payloads.
- Language rules: const over let, ===, Python type hints, shell pipefail.

Full standard at [rules/coding-standards.md](../../rules/coding-standards.md) in the repo.

## Installed skills

- agent-workflows: Use when coordinating multi-agent work, parallel execution, task handoff, shared context, or clea...
- code-review: Use when code changed and a meaningful diff is ready; fresh eyes should catch requirement gaps, r...
- debugging: Use when a bug, failing test, or broken build is not already explained by a clear local mistake,...
- deep-research: Use when a complex technical question needs autonomous, multi-source investigation, contradiction...
- design: Use when the request is to design, redesign, polish, review, or implement UI/UX for web or mobile...
- design-review: Review an existing design, UI, or copy for AI-generated default patterns and quality issues befor...
- develop: Default baseline skill for normal software work: small safe iterations, built-in validation, no u...
- gh-inbox: Process the current repository's GitHub issues and discussions, triage activity, reply when clear...
