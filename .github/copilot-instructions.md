# Agent Skills Kit for GitHub Copilot

This repository ships portable workflow skills under [.github/skills](./skills).

- At the start of a task, choose the best matching skill immediately; do not wait for a manual trigger when the fit is clear.
- Prefer these skills when the user's request clearly matches one of them instead of restating the full workflow inline.
- Treat `develop` as the default execution baseline for normal software work and combine it with a more specific skill when needed.
- After meaningful, subtle, or risky code changes, load `code-review` before moving on. Skip review for trivial edits where the change is obvious and low-risk.
- If review or verification exposes a reusable workflow gap, capture it with `write-skill` before ending cold.
- When editing code, add concise intent comments by default; place one short comment above each function unless the repo's local convention says otherwise.
- Keep always-on instructions compact; put reusable procedures in skills so Copilot can load them on demand.

## Coding standards

The `ask-code-review` skill enforces hard coding standards. Key rules enforced during review:

- Intent comments on every function, method, handler, and utility — non-negotiable.
- DRY: refactor 3+ duplications into shared components.
- Meaningful names: avoid generic `data`, `result`, `code`, `updated`.
- Explicit data shapes: prefer named types over loose payloads.
- Language-specific rules (const over let, ===, type hints for Python, pipefail for shell).

Full standard at [rules/coding-standards.md](../../rules/coding-standards.md) in the repo.

## Installed skills

- agent-workflows: Use when coordinating multi-agent work, parallel execution, task handoff, shared context, or clea...
- code-review: Use when code changed and a meaningful diff is ready; fresh eyes should catch requirement gaps, r...
- debugging: Use when a bug, failing test, or broken build is not already explained by a clear local mistake,...
- develop: Default baseline skill for normal software work: small safe iterations, built-in validation, no u...
- improve: Use when the codebase needs a structured audit, audit-driven plans, execution of those plans, or...
- intake: Use when the goal, constraints, or success criteria are not yet crisp — from fuzzy design ideas t...
- session-review: Use after completing work to reflect on skill usage, identify gaps, and file improvement issues i...
- spec: Use when building a requirements spec or design brief before code — formalizing capture, decision...
