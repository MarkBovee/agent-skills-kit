# Gate benchmark

Evidence behind the default tier and effort of review and audit subagents. Load it before changing those defaults or moving a gate to a cheaper tier.

## Method

Seeded-bug cases are real defects that earlier review or audit rounds found, re-introduced as a self-contained patch with about 40 lines of context. Each case has one expected P1. A gate configuration passes a case when its report names that P1 with the right path and a plausible trigger. Every configuration ran both roles (review, audit) on every case with the same brief: scope is the patch only, a tool-call ceiling of 8, no validation, P0/P1 only.

| Case | Seeded P1 |
| --- | --- |
| Installer prefix match | An ownership check compares a link target by bare string prefix, so a sibling directory sharing the prefix is deleted. |
| Unknown-phase PASS | A PASS marker for a phase the release does not know completes the current gate. |
| Stale persisted phase | A persisted workflow with a retired phase is carried over as the current phase. |

## Results (first run, 3 cases per role)

| Configuration | Review recall | Audit recall | Review tokens | Audit tokens |
| --- | --- | --- | --- | --- |
| `light` tier (Haiku) | 3/3 | 3/3 | 78.6k | 79.4k |
| `standard` tier, effort low | 3/3 | 3/3 | 62.0k | 65.6k |
| `standard` tier, effort medium | 3/3 | 3/3 | 65.7k | 63.1k |

Tokens are the sum over the three cases. Reading the table:

- Recall is equal across the three, so the benchmark cannot separate them. Every case is a small patch with a visible removed guard, which is the easy end of real review.
- Effort low saved no tokens at this scale; the work is dominated by reading the patch. Expect the effort effect on larger diffs, not here.
- The `light` tier used more tokens per case than Sonnet (more tool calls), so its saving is price, not volume.
- Both findings of case one also surfaced as additional P1s (relative root, wildcard match) in several runs; no run missed the seeded P1.

## Defaults this supports

- Keep review and audit on `standard` at medium effort. The benchmark shows no recall loss at low effort or on `light`, but three easy cases do not justify lowering a gate that guards release-sensitive work.
- A `light` or low-effort `standard` review is acceptable for `small` and `normal` risk, as the gate table says.
- An audit stays on `standard` until a benchmark with harder cases (the defect is not visible in the diff itself, or spans two files) shows the same recall on a cheaper tier.

## Extending it

Add a case when a real review or audit round finds a P1: store the buggy diff, the expected P1 in one sentence, and the source commit. Re-run only the configuration under question. Record recall and tokens in the table above with the date and the count of cases.
