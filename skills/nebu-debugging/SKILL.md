---
name: nebu-debugging
description: Use when a bug, failing test, or broken build is not already explained by a clear local mistake, or when a first fix did not work.
triggers:
  - bug
  - failing test
  - broken build
  - debug
  - debuggen
  - error
  - fout opsporen
---

# Nebu Debugging

Fix obvious one-line mistakes directly. For everything else, earn the fix by narrowing the problem first, then keep iterating until the bug is fixed or a real blocker appears.

## Flow

1. Reproduce the issue and capture the exact symptom.
2. Find the smallest boundary where expected becomes actual.
3. Compare against a working path, example, or prior behavior.
4. Instrument the boundary that is most likely lying.
5. Form one hypothesis and test it with the smallest useful change.
6. Verify the result, self-review the explanation, and continue if the issue is not yet solved.

## Escalate your rigor when

- The first fix failed
- Multiple components are involved
- The error is timing-, state-, or environment-dependent
- You are tempted to stack speculative changes

## Rules

- Preserve evidence.
- Change one thing at a time.
- Do not stop for status-only check-ins between normal debugging attempts.
- After two failed fixes, zoom out and question assumptions or architecture.

## Use with

- `nebu-verification` to prove the bug path is fixed with focused fresh evidence

## Avoid

- Guess-patch-repeat loops
- Bundling three fixes and hoping one helps
- Declaring root cause before tracing the path
