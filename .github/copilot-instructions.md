# Agent Skills Kit for GitHub Copilot

This repository ships portable workflow skills under [.github/skills](./skills).

- At the start of a task, choose the best matching skill immediately; do not wait for a manual trigger when the fit is clear.
- Prefer these skills when the user's request clearly matches one of them instead of restating the full workflow inline.
- Treat `develop` as the default execution baseline for normal software work and combine it with a more specific skill when needed.
- For large, multi-issue, exhaustive, compatibility-sensitive, or release-sensitive work, load `intake`, write a plan, and complete plan-check before execution.
- Record maximum-result scope as must/should/could; deferred evidence-backed work needs a reason and revisit trigger.
- Delegate independent research, validation, review, and audit tracks. Never self-declare release readiness; require independent evidence.
- After meaningful, subtle, or risky code changes, load `code-review` before moving on. Skip review for trivial edits where the change is obvious and low-risk.
- If review or verification exposes a reusable workflow gap, capture it with `write-skill` before ending cold.
- When editing code, add concise intent comments by default; place one short comment above each function unless the repo's local convention says otherwise.
- Keep always-on instructions compact; put reusable procedures in skills so Copilot can load them on demand.

## Host-neutral discovery

1. Follow the host's preferred discovered skill root. Canonical source is `skills/*/SKILL.md`; installs use `~/.agents/skills/*/SKILL.md`, except OpenCode links its managed skills under its config root and dsh prefers its generated skill root.
2. Read candidate frontmatter and load the most specific matching `SKILL.md` before substantial work. Use `develop` only when no more specific workflow applies.
3. Add only directly implied companion skills: `design` → `design-review`, `code-review` → `verification`; use `research` for bounded evidence and `deep-research` for autonomous multi-source investigation.
4. Native host discovery is sufficient. OpenCode and optional dsh routers add advisory matches and session state, but do not load skills or execute tools.

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
- deep-research: Use when a complex technical question needs autonomous, multi-source investigation, contradiction...
- design: Use when the request is to design, redesign, polish, review, or implement UI/UX for web or mobile...
- design-review: Review an existing design, UI, or copy for AI-generated default patterns and quality issues befor...
- develop: Default baseline skill for normal software work: small safe iterations, built-in validation, no u...
- gh-inbox: Process the current repository's GitHub issues and discussions, triage activity, reply when clear...
