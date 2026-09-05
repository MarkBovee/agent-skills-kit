---
name: "code-review"
description: "Use when code changed and a meaningful diff is ready; fresh eyes should catch requirement gaps, regressions, or risky design mistakes before handoff or success claims. Common triggers: review, nakijken, pull request, code review, fresh eyes, start reviewing, review deze wijziging, check de wijziging, review changes, second look, bekijk de diff, controleer de code, code check, diff review, PR review."
---
# ASK Code Review

Review for correctness, requirements, and risk first. Enforce `coding-standards.md` hard rules (intent comments, meaningful names, DRY, explicit shapes, language rules) as correctness — not style.

This is a mandatory second pass after **every** code edit. Review depth scales with risk — but no edit skips review entirely.

## Review checklist

- Does the diff solve the asked problem?
- Follows `coding-standards.md`? — intent comments on every function, DRY, meaningful names, explicit data shapes, language-specific rules, fail-fast error handling
- Did it change anything outside scope?
- Is the proof proportional to the risk?
- Are docs or follow-on changes needed?

## Apply proportionally

- Tiny, local change: quick checklist pass — still required, just fast.
- Medium or subtle change: use a review agent or second pass.
- Risky or cross-cutting diff: review against requirements and likely regressions explicitly.
- **Report the diff's risk against the tests that were NOT run. Approval means 'reviewed for correctness, requirements, and risk' — never 'tested'. When a risky diff lacks proof, name the missing proof and hand to `verification`; for tiny local changes, state 'no proof needed, scope trivial' explicitly — do not demand a full proof run for every small review.**

## Improvement hook

- If review reveals reusable workflow gap or skill usage miss, run `session-review` to file improvement.
- Prefer updating an existing skill or router rule when that would prevent same miss next time.
- If not fixing now, create or reuse follow-up issue via `session-review`.

## Good review comments

- Point to the risk
- Explain why it matters
- Suggest the next move

## Use with

- `develop` when the coding pass is done and the diff needs a second look
- `verification` after review passes to confirm the claim is proven
- `session-review` when review exposes a skill usage gap or workflow miss worth tracking
- `write-skill` when improvement needs a new or revised skill
## Avoid

- Nit-only reviews on otherwise risky code
- Blocking on preference fights
- Treating "looks clean" as evidence
