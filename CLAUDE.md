@AGENTS.md

## Claude Code

- Load the best matching skill before substantial work; use `develop` only as default.
- Large, exhaustive, compatibility-sensitive, or release-sensitive work: load `intake`, write a plan, classify must/should/could, and complete plan-check.
- Delegate independent research, validation, review, and audit. Never self-declare release readiness; require independent evidence.
- Meaningful code change: load `code-review`; skip only obvious, low-risk edits. Capture reusable gaps with `write-skill`.
- Code edits need one concise intent comment above each function unless local convention overrides.