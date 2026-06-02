---
name: nebu-verification
description: Use when about to claim something works, is fixed, or ready to hand off and the needed proof should match the scope of that claim.
triggers:
  - verify
  - verifiëren
  - prove
  - controleren of het werkt
  - bewijzen dat het werkt
  - claim success
  - done
  - finished
  - ready
  - handoff
  - klaar
  - gereed
---

# Nebu Verification

Match the proof to the claim. Bigger claim, stronger evidence.

## Examples

- **One bug fixed:** reproduce the bug path and show the focused proof now passes
- **Feature works:** run targeted tests and exercise the important path
- **Ready to merge or hand off:** run the relevant suite, build, or lint checks that cover the touched surface

## Rules

1. Use fresh evidence, not memory.
2. Verify the original symptom when possible, not just nearby tests.
3. Say plainly what was not checked.
4. Do not inflate a partial check into a full-success statement.
5. Use verification to finish the loop, not as a pause for reassurance mid-flow.

## Avoid

- "Should work now"
- Equating green unit tests with full integration confidence
- Hiding unverified risk behind confident wording
