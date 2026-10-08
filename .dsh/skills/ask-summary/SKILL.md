---
name: "summary"
description: "Summary: Explains what changed and what is proven, walks through code, or re-pitches unclear output. Use when work is done or the user asks what changed. Common triggers: summarize the changes, summarise the changes, summarize what you, recap the changes, what did you change, what changed, what did you build, explain what you built, walk me through, explain this so i can own it, wait what, wait, what, i don't understand, explain that simpler, re-pitch, repitch, leg uit wat je gedaan hebt, vat..."
whenToUse: "Common triggers: summarize the changes, summarise the changes, summarize what you, recap the changes, what did you change, what changed, what did you build, explain what you built, walk me through, explain this so i can own it, wait what, wait, what, i don't understand, explain that simpler, re-pitch, repitch, leg uit wat je gedaan hebt, vat samen wat je, wat is er veranderd."
disable-model-invocation: true
---
# ASK Summary

Goal: the owner can explain and maintain this code without having watched it being written. Short, factual, no marketing.

## Modes

- **Change summary** (default): after work, before commit or handoff.
- **Walkthrough**: the user asks how existing code or a feature works.
- **Re-pitch**: the user says the last message did not land.

## Change summary

Derive it from the diff (`git status`, `git diff` against the base), not from memory of the conversation. Use the owner's language. Fixed shape, in this order:

1. **What**: one or two sentences on the outcome.
2. **Changes**: one line per intent, naming the files. Group by purpose, do not narrate the diff.
3. **Decisions**: each choice with the alternative that was rejected and why, one line each. Promote one to an ADR only when it meets the bar in `intake`'s domain-language reference; otherwise it stays one line here.
4. **How it works**: at most five lines, only for non-trivial flow.
5. **Proven / Not proven**: what was run in this session and its result (tests, build, manual check), then what was not run. Never mark something proven without evidence from this session.
6. **Read yourself**: one to three `file:line` spots with the highest risk or complexity.
7. **Watch**: new dependencies, config or schema changes, deleted code, anything added beyond the request, known debt, open decisions for the owner.

Size: a small fix fits in six lines (What, Changes, Proven). A normal change stays under 20 lines. Omit empty sections.

## Walkthrough

Explain from the entry point: trigger, flow, key types and invariants, where to change what, and what would break if changed carelessly. Cite `file:line`. State uncertainty instead of guessing; read the code before explaining it.

## Re-pitch

Restate the last message so it lands, without repeating its wording:

1. Two sentences of context: where the work stands and why this point matters.
2. Short sentences in plain words, one idea each. Replace jargon with the term from `GLOSSARY.md` when the repository has one.
3. One concrete example or a before and after.
4. End with the decision or next step needed from the user, if any.

## Rules

- Say what is, not what was intended. If the diff and the plan disagree, report the diff.
- Report scope creep and unverified claims explicitly.
- Do not restate the diff line by line and do not praise the work.
- Do not fix or review while summarizing. Findings go to `code-review`, proof goes to `verification`.

## Boundaries

`verification` proves the claim and does workspace wrap-up. `code-review` finds defects. `session-review` reflects on skill usage. `handoff` briefs the next agent. `summary` explains the result to the owner and runs after `verification`, using its evidence or stating that none exists.

## Use with

- `verification` first, so the Proven section carries real evidence
- `code-review` when the summary shows risky spots worth a second look
- `handoff` when the next reader is another agent, not the owner
