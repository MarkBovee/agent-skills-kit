@AGENTS.md

## Claude Code

- Prefer workflow skills under [.claude/skills](.claude/skills) when the user's request clearly matches one of them.
- Treat `nebu-kaizen` as the default execution baseline for normal software work and combine it with a more specific skill when needed.
- After code edits, bias toward `nebu-code-review` before `nebu-verification` when the user is moving toward done, ready, finished, handoff, or klaar wording.
- If review, verification, or wrap-up exposes a reusable workflow gap, capture it with `nebu-skill-improvement` before ending cold.
- When editing code, add concise intent comments by default; place one short comment above each function unless the repo's local convention says otherwise.
