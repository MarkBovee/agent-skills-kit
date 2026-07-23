@AGENTS.md

## Claude Code

- Prefer workflow skills under [.claude/skills](.claude/skills) when the user's request clearly matches one of them.
- At the start of a task, choose the best matching skill immediately; do not wait for a manual trigger when the fit is clear.
- Treat `kaizen` as the default execution baseline for normal software work and combine it with a more specific skill when needed.
- After meaningful, subtle, or risky code changes, load `code-review` before moving on. Skip review for trivial edits where the change is obvious and low-risk.
- If review or verification exposes a reusable workflow gap, capture it with `writing-nebu-skills` before ending cold.
- When editing code, add concise intent comments by default; place one short comment above each function unless the repo's local convention says otherwise.