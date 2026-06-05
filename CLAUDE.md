@AGENTS.md

## Claude Code

- Prefer workflow skills under [.claude/skills](.claude/skills) when the user's request clearly matches one of them.
- Treat `nebu-kaizen` as the default execution baseline for normal software work and combine it with a more specific skill when needed.
- After every code edit, always invoke `nebu-code-review` before claiming done or moving on — regardless of change size. The skill itself determines the review depth.
- If review, verification, or wrap-up exposes a reusable workflow gap, capture it with `nebu-skill-improvement` before ending cold.
- When editing code, add concise intent comments by default; place one short comment above each function unless the repo's local convention says otherwise.
