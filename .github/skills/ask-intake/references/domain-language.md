# Domain language and decision records

Lightweight shared language for a project: a glossary of domain terms and short records of decisions. Create both lazily, only when there is something real to write. Never scaffold empty files.

## Glossary

`GLOSSARY.md` at the repository root. When a repository has several distinct contexts, a `GLOSSARY-MAP.md` at the root points to one glossary per context.

Entry shape, one per term:

```markdown
**Order cancellation**: the customer withdraws a whole order before shipping. _Avoid_: refund, void.
```

Rules:

1. One canonical term per concept, with the words to avoid. Use the canonical term in code, tests, commits, and conversation.
2. Domain meaning only. Skip implementation details and generic programming terms.
3. When the user's wording conflicts with an entry, name the conflict and ask which meaning is intended before continuing.
4. When a word is vague or overloaded ("account"), propose the precise terms and ask which one is meant.
5. When the user states how something works, check the code. If code and statement disagree, surface the contradiction instead of choosing silently.
6. Update the glossary in the same change that settles the term, not in a later cleanup.

## Decision records (ADR)

`docs/adr/NNNN-short-title.md`, numbered in order. Context-specific decisions live beside their context.

Write an ADR only when all three hold:

1. Hard to reverse: changing it later costs real work.
2. Surprising without context: a future reader would ask why it was done this way.
3. A real trade-off: there were credible alternatives and one was chosen for stated reasons.

Skip the ADR when any of the three is missing; a code comment or commit message is enough.

Shape, kept to a few lines:

```markdown
# 0007: Store money as integer minor units

Status: accepted
Context: rounding errors in totals across currencies.
Decision: store amounts as integer minor units plus an ISO currency code.
Alternatives rejected: decimal columns (driver-dependent rounding), floats.
Consequences: formatting happens at the edge; reports convert on read.
```

Supersede instead of editing: add a new ADR and mark the old one `Status: superseded by NNNN`.

## When not to use

- Trivial or local changes with no new terms and no hard-to-reverse choice.
- Repositories that already keep an equivalent glossary or decision log: update that record instead of adding a parallel one.
