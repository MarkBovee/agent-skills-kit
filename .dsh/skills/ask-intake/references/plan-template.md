# Plan template for behavior changes

Use when new user-visible behavior, an external contract, or unclear acceptance criteria call for a formal plan. The sections live in the shared plan document, or in a file that its Decisions-so-far list links to. Write it from what the grill already settled; do not interview again.

Use the glossary's terms and respect the decision records in the area you touch. Stay within the test budget for the workflow risk (see `verification`).

## Sections

**Problem.** What goes wrong or is missing, as the user experiences it. One short paragraph.

**Solution.** What the user will see and be able to do once it is solved. The user's side only; no implementation yet.

**User stories.** Numbered, one line each: `As <actor>, I want <capability>, so that <benefit>`. Cover every actor and every path the grill surfaced, including the unhappy ones. A long list is the point: each story is a candidate acceptance check, and a missing story is a missing requirement.

**Implementation decisions.** The choices that were made: modules to build or change and their interfaces, schema or API contracts, architectural calls, technical clarifications from the user. Name modules and interfaces, not file paths or code snippets; those go stale first. One exception: a prototype snippet that pins down a decision better than prose can (a state machine, a reducer, a schema), trimmed to the decision-rich lines and marked as coming from a prototype.

**Testing decisions.** What a good test means here: it checks external behavior and survives a refactor. List the seams under test (the highest seam that reaches the behavior, an existing one when possible, as few as possible, one ideally), which modules they cover, and where similar tests already live. The user confirms the seams before development.

**Out of scope.** What this plan deliberately does not do, so nobody builds it by accident.

**Further notes.** Anything that does not fit above but a later reader needs.

## Check before handing on

- Every story maps to a behavior a test or a manual check can show.
- Every implementation decision either traces to a story or says why it is needed anyway.
- Nothing in the plan restates what a decision record or glossary entry already holds; it links instead.
- No question is left open: each one is answered, looked up, assumed with what would prove it wrong, blocking, or tied to a later slice (see Closing intake).
