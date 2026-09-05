---
name: "gh-inbox"
description: "Process the current repository's GitHub issues and discussions, triage activity, reply when clear, and persist inbox state. Use when asked to check the GitHub inbox, triage issues or discussions, or catch up on repo activity. Common triggers: github inbox, gh inbox, triage issues, check issues, check discussions, reply to issue, process inbox, gh-inbox."
whenToUse: "Common triggers: github inbox, gh inbox, triage issues, check issues, check discussions, reply to issue, process inbox, gh-inbox."
---
# ASK GitHub Inbox

Reachable via the `/gh-inbox` command on every platform and proposed by the router when you mention issues or discussions; the decision tree keeps it as a companion skill.

Process the current repository's GitHub inbox. Detect the repository from the current
working directory, fetch issues and discussions, diff against stored state, triage new
items, reply to users where the action is clear, and persist updated state to the local
`.gh-inbox-state.json` file using your file tool (see `references/gh-api-recipes.md` §state).

All GitHub replies, issue drafts, and report text must be written in English. Preserve
user quotes and proper nouns as written. Never infer repository-specific behavior from
this skill; inspect the repository, its documentation, and its existing GitHub
conversation first.

GitHub replies must use clean Markdown: complete sentences, correct punctuation,
paragraphs separated by blank lines, and new lines for lists or distinct points. Do not
post compressed, run-on, or caveman-style prose to GitHub.

## Flow

### 1. Fetch current state

First resolve the repository without hard-coded owner or name:

```bash
gh repo view --json nameWithOwner
gh issue list --state open --json number,title,updatedAt,comments,labels --limit 50
```

For discussions, use the GraphQL query in `references/gh-api-recipes.md` §fetch. Threaded replies are nested below top-level comments and do not bump `comments.totalCount`; count them explicitly.

### 2. Diff against stored state

Read `.gh-inbox-state.json` from the repository root. The file is local, git-ignored
state and must not be committed.

```bash
test -f .gh-inbox-state.json && cat .gh-inbox-state.json || printf '{}\n'
```

Stored entries use key `issue-<n>` or `discussion-<n>`, value JSON:
`{"last_updated_at": "<iso>", "last_comment_count": <int>, "replied_to": <bool>}`.

An item is **new** when:
- `updatedAt > last_updated_at`, OR
- comment count (top-level + threaded replies) > `last_comment_count`

Items with no stored entry are always new. Report items where `updatedAt` is older than
the stored state (nothing changed) as silent. Because `updatedAt` also changes on edits and
reactions, never dismiss an "updated but count unchanged" discussion without checking its
`replies` connections — a threaded user reply can arrive with the top-level count unchanged.

### 3. Triage and reply

For each **new** item, decide:

**Reply directly** (post without asking the repository owner) only when all of these apply:
- The response is factual, low-risk, and supported by repository evidence.
- The response does not promise unapproved work, change product behavior, or make a support commitment.
- The response is a short acknowledgment, clarification, duplicate reference, or confirmation of an already completed action.

**Suggest to the repository owner** (do not post) when:
- The request would change product behavior, scope, or support commitments
- The request is stale, contradicts earlier info, or needs investigation before answering
- The user reports a bug on unsupported/unknown hardware
- Multiple interpretations exist

Draft new issues from discussion feature requests only as suggestions. Create issues only
after explicit approval with `gh issue create`.

Post issue replies with `gh issue comment <n> --body "<text>"`; use the GraphQL recipe for discussions. When replying inside a thread, `replyToId` must be the thread's root comment. After posting, mark the item `replied_to: true`.

### 4. Report

Give a compact English summary per item, for example:

```
#123 User report - reply posted; follow-up: investigate
#122 Feature report - no reply needed; existing fix covers it
Discussion 7 Feature request - reply suggested; issue creation needs approval
```

Also list items that changed since the last run but were already replied to, and any
closed issues that were open before.

### 5. Persist state

Update `.gh-inbox-state.json` with one entry per scanned item using your file tool:

```json
{"issue-<n>": {"last_updated_at": "<iso>", "last_comment_count": <int>, "replied_to": <bool>}}
```

See `references/gh-api-recipes.md` §state for the exact shape. Do this for every scanned item, not just the new ones. Preserve existing `replied_to: true` values unless a reply was never posted.

## Use with

- `session-review` when inbox triage surfaces a workflow gap worth filing
- `verification` when repo cleanup follows an inbox pass

## Avoid

- Replying twice to the same thread (check `replied_to` and the live thread before posting)
- Fabricating answers about behavior, support, compatibility, or planned work
- Closing, labeling, assigning, or modifying issues without explicit approval
- Guessing when repository metadata, discussion access, local state, or a reply target is unclear — stop and report the blocker
