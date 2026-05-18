---
name: nebu-code-review
description: Use when a meaningful diff is ready and fresh eyes would help catch requirement gaps, regressions, or risky design mistakes before handoff.
triggers:
  - review
  - diff
  - pull request
  - code review
  - fresh eyes
---

# Nebu Code Review

Review for correctness, requirements, and risk first. Style is optional; broken behavior is not.

## Review checklist

- Does the diff solve the asked problem?
- Did it change anything outside scope?
- Are contracts, edge cases, and failure paths handled?
- Is the proof proportional to the risk?
- Are docs or follow-on changes needed?

## Apply proportionally

- Tiny, local change: self-review may be enough.
- Medium or subtle change: use a review agent or second pass.
- Risky or cross-cutting diff: review against requirements and likely regressions explicitly.

## Good review comments

- Point to the risk
- Explain why it matters
- Suggest the next move

## Avoid

- Nit-only reviews on otherwise risky code
- Blocking on preference fights
- Treating "looks clean" as evidence
