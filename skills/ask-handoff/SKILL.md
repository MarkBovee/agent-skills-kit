---
name: ask-handoff
disable-model-invocation: true
description: "Handoff: Writes a short brief so a fresh agent can continue the work. Use when pausing, switching agents or sessions, or when context is nearly full."
execution_tier: light
delegation_default: owner-only
triggers:
  - write a handoff
  - handoff document
  - handoff brief
  - hand over to a fresh agent
  - overdracht schrijven
  - continue in a new session
  - fresh agent
  - context is full
  - pick this up later
---

# ASK Handoff

Goal: a fresh agent with no conversation history can continue the work correctly from one short document.

## When to hand off, and when not

Write the brief when the user asks for one, when they will pause and resume in a fresh session, or when the context window is nearly full. When the question is whether to hand off at all, decide at a phase boundary (the grilling is done, the build is done) and take the first yes; `references/phase-boundaries.md` explains each branch. Mid-phase only continue, send a subagent, or fork a side task: clearing or compacting there loses the thread.

1. **Continue** in this session when the next phase needs this one as a primary source, or the window still has room for it. A grill flowing into the build is the standard case: the build wants the reasoning verbatim, not a summary.
2. **Clear** the context when nothing in this session matters to what comes next. It cannot be undone for the reasoning behind what was built.
3. **Hand off** when the work travels: to another harness, another directory or repository, a colleague, a fresh session you will start later, or as a side task forked off mid-phase. A handoff buys portability; with nothing travelling, skip it.
4. **Send a subagent** when the next task is tightly scoped and can run without the user. Give it context pointers and leave this session untouched.
5. **Compact** otherwise: relevant context, same harness, same directory, the user stays in the loop. Tell it what the next phase needs so the summary keeps that.

If the answer to "should we hand off?" is anything but a handoff, say so and stop instead of writing a brief nobody needs.

## Steps

1. Derive the state from the repository (`git status`, `git diff` against the base, branch, plan or spec record, open issues), not from memory of the conversation.
2. Write the brief with these sections, omitting empty ones:
   - **Goal**: one or two sentences.
   - **State**: done, in progress, not started.
   - **Decisions**: each choice with its reason, one line each.
   - **In play**: files and areas touched, and the branch or diff reference.
   - **Proof so far**: commands run and results, with the diff reference they apply to; gates already passed and who ran them.
   - **Open**: blockers, unanswered questions, risks.
   - **Next step**: the single next action.
   - **Suggested skills**: the ASK skills the next agent should read, as `~/.agents/skills/ask-<name>/SKILL.md`.
3. Reference artifacts that already exist (specs, plans, ADRs, issues, commits, diffs) by path or URL. Do not copy their content.
4. Redact secrets, tokens, and personal data.
5. Save the brief outside the workspace so it is never committed: create a private directory with `mktemp -d` (PowerShell: a `New-TemporaryFile`-based directory) and write `handoff.md` there. Use a path the user names instead when given.
6. Report the exact path and one line the user can paste to start the next session ("Read <path> and continue with the next step").

If the user passed arguments, treat them as the focus of the next session and tailor the brief to it.

## Rules

- Facts over narrative: what is true in the repository now. Mark anything unverified as such.
- Keep it under about 60 lines; link instead of explaining.
- Do not start the next phase or fix open items while writing the brief.

## Boundaries

`summary` explains the result to the owner. `session-review` reflects on skill usage and files issues. `handoff` briefs the next agent.

## Use with

- `verification` before handing off, so the proof section is real
- `intake` in the next session when the plan is still open
- `summary` when the reader is the owner rather than another agent
