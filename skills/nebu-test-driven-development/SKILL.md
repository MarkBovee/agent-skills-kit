---
name: nebu-test-driven-development
description: Use when changing behavior that should stay fixed, especially bugfixes, stable seams, or code with existing test support.
triggers:
  - test-first
  - regression
  - behavior should stay fixed
  - bug fix
  - failing check
---

# Nebu Test-Driven Development

Prefer test-first when the behavior matters and the test harness is credible. The point is durable proof, not ritual.

## Default loop

1. Reproduce the behavior with a focused test or targeted failing check.
2. Watch it fail for the expected reason.
3. Make the smallest code change that should fix it.
4. Re-run the focused proof, then widen verification as risk demands.
5. Add or keep regression coverage for behavior that must stay fixed.

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
- Claiming a bug is fixed without a repeatable proof
