---
name: "nebu-improve"
description: "Use when the codebase needs a structured audit, audit-driven plans, or execution of those plans — correctness, security, performance, tech debt, migrations, DX, direction, or a focused slice of those. Run once at the start of a session to produce an audit + plans, or invoke a specific mode (execute, reconcile, next, branch) for targeted follow-through. Common triggers: improve, audit, code review, tech debt, tech debt audit, audit codebase, improve codebase, direction, next steps, what should we do next, plan this, audit and plan."
---
# Nebu Improve

Structured, evidence-first codebase audit that produces executable implementation plans. Runs once to audit and plan; re-invoke `execute`, `reconcile`, or `next` modes for follow-through.

## When to use

Use when:

- you want a structured audit of the codebase (correctness, security, performance, tech debt, deps, DX, docs, direction)
- you have audit output and need executable implementation plans
- you need to execute, reconcile, or publish those plans as issues

Skip when:

- the problem is a single known bug (use `nebu-debugging`)
- the task is a known refactor (use `nebu-refactoring`)
- you only need a quick code review (use `nebu-code-review`)

## What it does

1. **Recon**: detect repo layout, conventions, commands, existing docs/ADRs, intent signals (TODOs, flags, stubs, PRDs, roadmap)
2. **Audit**: run category audits (correctness, security, perf, tests, tech-debt, deps, DX, docs, direction) — each finding is evidence-grounded
3. **Plan**: convert findings into self-contained, executor-ready plans with drift checks, verification gates, hard boundaries, and escape hatches
4. **Follow-through modes**:
   - `execute <plan>` — dispatch executor subagent in isolated worktree, review diff, render verdict (APPROVE/REVISE/BLOCK)
   - `reconcile` — refresh plan status, verify DONE, investigate BLOCKED, update `plans/README.md`
   - `next` — audit only the "direction" category for grounded forward-looking suggestions
   - `branch` — audit only the current branch's changes vs default branch
5. `--issues` modifier publishes plans as GitHub issues (requires `gh` auth, warns on public repos for sensitive findings)

## Modes

| Mode | What it does |
|------|--------------|
| (bare) | Full audit + plans (recon → audit → plan) |
| `quick` / `deep` | Audit depth modifier: lighter or deeper pass |
| `security` / `perf` / `tests` / `deps` / `dx` / `docs` / `direction` / `tech-debt` | Focus on one category only |
| `execute <plan>` | Dispatch executor, review, verdict |
| `reconcile` | Refresh plan backlog since last session |
| `next` / `features` / `roadmap` | Direction-only audit (grounded suggestions) |
| `branch` | Diff-only audit of current branch vs default |
| `plan <description>` | Skip audit; write one plan for a known change |
| `review-plan <file>` | Critique an existing plan in `plans/` |
| `--issues` | Modifier: publish plans as GitHub issues |

## Rules

- Every finding cites evidence (`file:line`). "Probably has N+1" is not a finding; `orders/api.ts:142 issues one query per item` is.
- Plans are self-contained: executor has zero context beyond the plan file.
- Every step ends with a verification command and expected result.
- STOP conditions are explicit (drift, scope breach, assumption failure).
- Never copy secrets into plans or issues — reference `file:line` and credential type only.
- Advisor never edits source code; `execute` dispatches a separate executor.
- Plans stamp the commit SHA they were written against for drift detection.

## Use with

- `nebu-kickoff` — start here when the work scope is ambiguous
- `nebu-code-review` — review executor diffs or standalone PRs
- `nebu-debugging` — when audit finds a bug that needs tracing
- `nebu-refactoring` — when plans target tech debt consolidation
- `nebu-verification` — verify executed plans meet done criteria
- `nebu-skill-improvement` — capture recurring audit patterns as reusable skills

## Avoid

- Running full audit on every small change (use `quick`, `branch`, or focused category)
- Proposing direction ideas without repo evidence (grounding rule: cite TODOs, flags, stubs, PRDs)
- Publishing sensitive findings as public issues without explicit confirmation
- Duplicating plans — `reconcile` merges, refreshes, or rejects stale plans