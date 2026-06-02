---
name: nebu-test-driven-development
description: Use when changing behavior that should stay fixed, especially bugfixes, stable seams, or code with existing test support.
triggers:
  - test-first
  - regression
  - regression test
  - behavior should stay fixed
  - failing check
  - lock behavior
  - prevent regression
---

# Nebu Test-Driven Development

Prefer test-first when the behavior matters and the test harness is credible. The point is durable proof, not ritual.

Once you have a credible failing check, stay in the loop until it passes or a real blocker appears.

## Default loop

1. Reproduce the behavior with a focused test or targeted failing check.
2. Watch it fail for the expected reason.
3. Make the smallest code change that should fix it.
4. Re-run the focused proof, then widen verification as risk demands.
5. Add or keep regression coverage for behavior that must stay fixed.
6. Self-review the final proof before moving on.

## Use strongest

- Bug fixes
- Business logic
- Parsing, validation, and edge cases
- Existing codepaths with good tests already in place

## Be pragmatic

- For config, wiring, or thin glue code, a lighter proof may be better than fake TDD theater.
- If no test harness exists, create the fastest trustworthy reproduction you can, then add durable coverage where it pays off.

## Avoid

- Writing implementation first and backfilling confidence later
- Overbuilding beyond what the failing check requires
- Stopping after red or green without deciding the next move
- Claiming a bug is fixed without a repeatable proof
