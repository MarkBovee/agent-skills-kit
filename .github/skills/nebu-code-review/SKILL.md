---
name: "code-review"
description: "Use when code changed and a meaningful diff is ready; fresh eyes should catch requirement gaps, regressions, or risky design mistakes before handoff or success claims. Common triggers: review, nakijken, pull request, code review, fresh eyes, start reviewing, review deze wijziging."
---
# Nebu Code Review

Review for correctness, requirements, and risk first. Style is optional; broken behavior is not.

This is a mandatory second pass after **every** code edit. Review depth scales with risk — but no edit skips review entirely.

## Review checklist

- Does the diff solve the asked problem?
- Did it change anything outside scope?
- Are contracts, edge cases, and failure paths handled?
- Is the proof proportional to the risk?
- Are docs or follow-on changes needed?

## Apply proportionally

- Tiny, local change: quick checklist pass — still required, just fast.
- Medium or subtle change: use a review agent or second pass.
- Risky or cross-cutting diff: review against requirements and likely regressions explicitly.

## Improvement hook

- If review reveals reusable workflow gap, capture it before handoff.
- Prefer updating an existing skill or router rule when that would prevent same miss next time.
- If not fixing now, create or reuse follow-up issue.

## Good review comments

- Point to the risk
- Explain why it matters
- Suggest the next move

## Use with

- `kaizen` when the coding pass is done and the diff needs a second look
- `verification` after review passes to confirm the claim is proven
- `writing-nebu-skills` when review exposes a recurring miss in agent workflow

## Avoid

- Nit-only reviews on otherwise risky code
- Blocking on preference fights
- Treating "looks clean" as evidence
