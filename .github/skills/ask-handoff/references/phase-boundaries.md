# Phase boundaries

A phase is a chunk of work inside a session: the grilling, the build, the review. It ends when you think "that part is done". The gap between two phases is the only place the handoff decision belongs. Mid-phase the only moves are to keep going, to split the rest into subagents, or to fork a side task as a handoff. Compacting or clearing mid-phase makes the agent lose the thread.

## The options

| Option | What it does |
| --- | --- |
| Continue | Stay in the session; no context switch. |
| Clear | Empty the window and start from nothing; the old session stays resumable where the host supports it. |
| Hand off | Write a portable brief and start a session anywhere with it. |
| Subagent | Send a scoped task to its own window and get a report back. |
| Compact | Compress this context and carry the summary into the next phase. |

## Why the order

**Continue comes first because it costs nothing and loses nothing.** Every other move turns a primary source (the session as it happened) into a secondary one (a summary of it). A summary is lossy, so you only pay that when staying costs more than it saves. Two things make continuing the right call: the next phase needs this one verbatim, or enough of the window is left for the next phase to fit.

**Clear is the cheapest move, and the only one-way door.** Clearing relevant context loses the why behind what was built, and reading the diff back does not return it. Use it only when the whole session, dead ends included, is disposable.

**Hand off is narrow.** It exists for portability: another harness, another directory or repository, a colleague, a fresh session you will start later, or a side task forked mid-phase so the main phase is not derailed. If nothing travels, a handoff is ceremony.

**A subagent fits work that can run without you.** Automated review is the standard case: it reads the diff and reports while you are away. The task must be scoped tightly enough to need no steering.

**Compact is the default, not the first reach.** It is where the tree lands when the context is relevant, the harness and directory stay the same, and you need to stay in the loop. It sits last because the options above are each cheaper or more precise. The usual failure when people start here is a fresh session that is confidently wrong about a decision the summary flattened.

## Judgment calls

None of these questions has an objective answer; the same boundary can go two ways on two days. The value is in asking them in this order, at the boundary.
