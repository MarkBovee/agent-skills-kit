@AGENTS.md

## Claude Code

- Prefer workflow skills under [.claude/skills](.claude/skills) when the user's request clearly matches one of them.
- At the start of a task, choose the best matching skill immediately; do not wait for a manual trigger when the fit is clear.
- Treat `nebu-kaizen` as the default execution baseline for normal software work and combine it with a more specific skill when needed.
- After every code edit, always invoke `nebu-code-review` before claiming done or moving on — regardless of change size. The skill itself determines the review depth.
- If review or verification exposes a reusable workflow gap, capture it with `nebu-writing-nebu-skills` before ending cold.
- When editing code, add concise intent comments by default; place one short comment above each function unless the repo's local convention says otherwise.