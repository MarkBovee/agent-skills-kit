---
name: nebu-debugging
description: Use when a bug, failing test, or broken build is not already explained by a clear local mistake, or when a first fix did not work.
triggers:
  - bug
  - failing test
  - broken build
  - debug
  - error
---

# Nebu Debugging

Fix obvious one-line mistakes directly. For everything else, earn the fix by narrowing the problem first.

## Flow

1. Reproduce the issue and capture the exact symptom.
2. Find the smallest boundary where expected becomes actual.
3. Compare against a working path, example, or prior behavior.
4. Instrument the boundary that is most likely lying.
5. Form one hypothesis and test it with the smallest useful change.

## Escalate your rigor when

- The first fix failed
- Multiple components are involved
- The error is timing-, state-, or environment-dependent
- You are tempted to stack speculative changes

## Rules

- Preserve evidence.
- Change one thing at a time.
- After two failed fixes, zoom out and question assumptions or architecture.

## Avoid

- Guess-patch-repeat loops
- Bundling three fixes and hoping one helps
- Declaring root cause before tracing the path
