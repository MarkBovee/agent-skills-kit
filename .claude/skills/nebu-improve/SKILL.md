---
name: "improve"
description: "Use when the codebase needs a structured audit, audit-driven plans, execution of those plans, or a focused refactoring/simplification pass. Covers correctness, security, performance, tech debt, migrations, DX, direction, and code cleanup in one skill."
when_to_use: "Common triggers: improve, audit, tech debt, tech debt audit, audit codebase, improve codebase, direction, audit and plan, refactor this, refactoren, code cleanup, opschonen, simplify this code, vereenvoudigen, remove over-engineering, deduplicate logic, restructure this code, reduce complexity, untangle this, clean architecture mess."
---
# Nebu Improve

Structured, evidence-first codebase audit that produces executable implementation plans. Also covers focused refactoring and simplification passes. Runs once to audit and plan; re-invoke `execute`, `reconcile`, or `next` modes for follow-through.

## When to use

Use when:
- you want a structured audit (correctness, security, performance, tech debt, deps, DX, docs, direction)
- you have audit output and need executable implementation plans
- you need to execute, reconcile, or publish those plans as issues
- the user asks for a refactor, cleanup, simplification, or deduplication

Skip when:
- the problem is a single known bug (use `debugging`)
- you only need a quick code review (use `code-review`)

## Audit flow

1. **Recon**: detect repo layout, conventions, commands, existing docs/ADRs, intent signals (TODOs, flags, stubs, PRDs, roadmap)
2. **Audit**: run category audits — each finding is evidence-grounded (`file:line`)
3. **Plan**: convert findings into self-contained, executor-ready plans with drift checks, verification gates, hard boundaries, and escape hatches
4. **Follow-through**: `execute <plan>`, `reconcile`, `next`, `branch`

## Modes

- (bare): Full audit + plans (recon → audit → plan)
- `quick` / `deep`: Audit depth modifier
- `security` / `perf` / `tests` / `deps` / `dx` / `docs` / `direction` / `tech-debt`: Focus on one category
- `refactor`: Focused simplification pass — not full audit
- `execute <plan>`: Dispatch executor, review, verdict (APPROVE/REVISE/BLOCK)
- `reconcile`: Refresh plan backlog, verify DONE, investigate BLOCKED
- `next` / `features` / `roadmap`: Direction-only audit
- `branch`: Diff-only audit of current branch vs default branch
- `--issues`: Publish plans as GitHub issues

## Refactoring pattern

1. Find the actual pain point, not the most stylistically ugly code.
2. Choose one high-leverage simplification in the smallest owning area.
3. Implement the smallest coherent change set, then validate.
4. Stop when the main complexity is gone.
5. Prefer deletion over indirection, extraction over rewrites. If the best refactor is leaving code alone, leave it alone.

## Rules

- Every finding cites evidence (`file:line`). "Probably has N+1" is not a finding; `orders/api.ts:142 issues one query per item` is.
- Plans are self-contained: executor has zero context beyond the plan file. Every step ends with a verification command and expected result.
- STOP conditions are explicit. Plans stamp the commit SHA they were written against for drift detection.
- Never copy secrets into plans or issues.
- Advisor never edits source code; `execute` dispatches a separate executor.

## Use with

- `intake` when the work scope is ambiguous
- `code-review` for executor diffs or standalone PRs
- `debugging` when audit finds a bug that needs tracing
- `verification` to confirm preserved behavior or executed plans

## Avoid

- Full audit on every small change (use `quick`, `branch`, or focused category)
- Broad rewrites because code "could be cleaner"
- New abstractions for a single current use case
- Style-only rewrites in untouched areas
- Publishing sensitive findings as public issues without confirmation
