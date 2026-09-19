---
name: "code-review"
description: "Use when code changed and a meaningful diff is ready; fresh eyes should catch requirement gaps, regressions, or risky design mistakes before handoff or success claims. Common triggers: review, nakijken, pull request, code review, fresh eyes, start reviewing, review deze wijziging, check de wijziging, review changes, second look, bekijk de diff, controleer de code, code check, diff review, PR review."
whenToUse: "Common triggers: review, nakijken, pull request, code review, fresh eyes, start reviewing, review deze wijziging, check de wijziging, review changes, second look, bekijk de diff, controleer de code, code check, diff review, PR review."
---
# ASK Code Review

Review for correctness, requirements, and risk first. Enforce `coding-standards.md` hard rules, including its scoped .NET/C# section when applicable, as correctness — not style.

Keep scope clear: code-review checks behavior, requirements, regressions, and design risk. The final `verification` pass owns proportional code-smell scanning and evidence-based test-gap reporting; escalate deeper repository-wide smell analysis to `improve`.

This is a mandatory second pass after **every** code edit. For `small` and `normal` workflows, use one lightweight combined pass covering correctness, regressions, local conventions, and a bounded counterexample/security sanity check. For `spec-required`, `significant`, and `release-sensitive` workflows, keep review separate from audit and escalate when the diff reveals higher risk.

## Lightweight combined review

Use this compact path only when the workflow reports `review=combined`:

1. Confirm the diff solves the request and does not change unrelated behavior.
2. Check the touched callers, local conventions, required intent comments, and the smallest meaningful regression proof.
3. Try one or two bounded counterexamples, including unsafe input, stale state, or an error path when relevant.
4. Escalate to separate audit/review handling when you find security, compatibility, migration, architecture, ownership, routing, release, or other cross-cutting risk.

The combined pass still ends with the normal review evidence contract. It does not replace `verification`, and it can never satisfy the `AUDIT` gate required by higher-risk workflows.

## Completion handoff

When review is fully complete, include `review-generation`, `review-scope: REVIEW`, `review-reference`, `review-completed-at`, and `review-result: PASS` metadata, followed by terminal `ASK_REVIEW_COMPLETE`. Generation must match current session state; stale evidence must not clear newer review debt. Do not emit the marker for blocked, partial, or still-actionable reviews.

For delegated review, return `ASK_WORKFLOW_PASS phase=REVIEW` only when requirements, regressions, local conventions, and relevant callers were checked. Use `ASK_WORKFLOW_FINDINGS phase=REVIEW` for concrete issues, `ASK_WORKFLOW_BLOCKED phase=REVIEW` when required evidence is unavailable, and `ASK_WORKFLOW_FAILED phase=REVIEW` when the review could not execute. A review is not an audit: do not claim independent counterexample analysis unless that is the assigned audit role.

## Review checklist

- Does the diff solve the asked problem?
- Follows `coding-standards.md`? — inspect every changed function, method, callback, closure, and handler; verify its immediately preceding intent comment, then run the repository's source-comment check when available. Missing comments are blocking findings. Also check DRY, meaningful names, explicit data shapes, language-specific rules, and fail-fast error handling.
- **Hard style gate:** Was local code, `.editorconfig`, and tool configuration inspected before formatting? Was formatting scoped by language/file type, valid local style preserved, and a representative example checked? For C#, apply ASK's 240-character default unless `.editorconfig` explicitly overrides it; reject unnecessary wrapping of fitting signatures/calls, lost newline braces, or missing comments at meaningful workflow boundaries. Check the complete tree for unintended generated output. Treat any failure as a blocking finding.
- Did it change anything outside scope?
- Is the proof proportional to the risk?
- Are docs or follow-on changes needed?

## Additional axes

Check these explicitly on the diff when it touches them:

- **Security:** Is input validated and untrusted external data rejected at boundaries? Are secrets kept out of code, logs, and revision history? Is authorization checked where access is gated? Are SQL queries parameterized and outputs encoded?
- **Performance:** Does the diff introduce N+1 or unbounded query/fetch patterns, unbounded loops, or sync-over-async in hot paths? Deep smell-scanning of these patterns is owned by `verification`; here, judge only what the diff itself ships.

## Structural remedies

When you flag a structural problem, name the move, not just the problem: "replace a chain of conditionals with a typed dispatcher," "delete a pass-through wrapper," "make the type boundary explicit," "separate orchestration from business logic." Prefer the remedy that removes moving pieces over one that spreads the same complexity elsewhere.

## Apply proportionally

- Tiny, local change: quick checklist pass — still required, just fast.
- Medium or subtle change: use a review agent or second pass.
- Risky or cross-cutting diff: review against requirements and likely regressions explicitly.

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
