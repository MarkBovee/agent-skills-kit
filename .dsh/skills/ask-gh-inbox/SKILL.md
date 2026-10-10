---
name: "gh-inbox"
description: "GitHub Inbox: Triages and replies to a repository's issues and discussions. Use when asked to check the GitHub inbox or catch up on repo activity. Common triggers: github inbox, gh inbox, triage issues, check issues, check discussions, reply to issue, process inbox, gh-inbox."
whenToUse: "Common triggers: github inbox, gh inbox, triage issues, check issues, check discussions, reply to issue, process inbox, gh-inbox."
disable-model-invocation: true
---
# ASK GitHub Inbox

Process the current repository's GitHub inbox. Detect the repository from the current
working directory, fetch issues and discussions, diff against stored state, triage new
items, reply to users where the action is clear, and persist updated state to the local
`.gh-inbox-state.json` file.

All GitHub replies, issue drafts, and report text must be written in English. Preserve
user quotes and proper nouns as written. Never infer repository-specific behavior from
this skill; inspect the repository, its documentation, and its existing GitHub
conversation first.

GitHub replies must use clean Markdown: complete sentences, correct punctuation,
paragraphs separated by blank lines, and new lines for lists or distinct points. Do not
post compressed, run-on, or caveman-style prose to GitHub.

## Evidence-aware communication

Before asking a reporter for more information, apply this policy:

1. Read the complete issue, all comments, linked attachments, relevant fixtures, and recent implementation or release history.
2. Separate evidence already available from the facts still unknown. Do not request an existing dump, log, or reproduction again.
3. Identify the phase: `report → investigation → evidence → implementation → release → verification`.
4. When an implementation or release exists, switch to verification mode. Confirm what changed and ask only for evidence of the remaining integration or real-world gap.
5. Ask for the smallest fresh capture needed, and state what it will verify. Fresh evidence is justified when version, configuration, or hardware state changed.

Example: if existing raw data proves that registers are exposed and a released fix changes their integration mapping, request a fresh integration discovery capture from the new release. Do not restart with a generic diagnostic checklist or request the raw register proof again.

## Flow

### 1. Fetch current state

First resolve the repository without hard-coded owner or name:

```bash
gh repo view --json nameWithOwner
```

**Issues** (sorted by most recently updated first):

```bash
gh issue list --state open --json number,title,updatedAt,comments,labels --limit 50
```

**Discussions** (number, title, updatedAt, latest comments and replies with author + date):

```bash
OWNER=$(gh repo view --json owner --jq '.owner.login')
NAME=$(gh repo view --json name --jq '.name')
gh api graphql -f owner="$OWNER" -f name="$NAME" -f query='query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { discussions(first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { number title updatedAt url comments(last: 20) { totalCount nodes { id createdAt author { login } body replies(first: 20) { totalCount nodes { id createdAt author { login } body } } } } } } } }'
```

Run the snippets in `bash` (`bash -c '...'` from fish or zsh); the `$VAR` handling and quoting below assume bash.

`comments(last: 20)` returns the newest top-level comments; `first` returns the oldest, so a busy discussion would hide its latest post. When `totalCount` exceeds the 20 fetched, page older comments with `comments(last: 20, before: <cursor>)` (request `pageInfo { startCursor hasPreviousPage }`) only if the state diff needs them. GitHub rejects a query that can return more than 500,000 nodes (`MAX_NODE_LIMIT_EXCEEDED`); keep `discussions(first: 50)` × `comments(last: 20)` × `replies(first: 20)` and lower one of the three instead of raising any.

`Discussion.comments` returns only top-level comments; threaded replies hide under each comment's
`replies` connection and do not bump `comments.totalCount`. When scanning, treat reply nodes as
comments (author + body), so a threaded user reply is triaged like any other new comment.

For every item, derive the **activity marker** from what you fetched: the newest `createdAt` among
its comments and replies (`activity_at`) and that comment's author login (`activity_by`). Issues use
the `createdAt` and `author` of the newest entry in `comments`; an issue without comments has no marker.

### 2. Diff against stored state

Read `.gh-inbox-state.json` from the repository root. The file is local, git-ignored
state and must not be committed.

```bash
test -f .gh-inbox-state.json && cat .gh-inbox-state.json || printf '{}\n'
```

Stored entries use key `issue-<n>` or `discussion-<n>`, value JSON:
`{"last_updated_at": "<iso>", "last_comment_count": <int>, "last_activity_at": "<iso>", "last_activity_by": "<login>", "replied_to": <bool>}`.

An item is **new** when a comment or reply is newer than the marker: `activity_at > last_activity_at`.
`last_activity_by` tells you who had the last word. When it is the repository owner (or you), the
user is not waiting for an answer, so report the item as changed but do not draft a reply.

`last_comment_count` stays an exact check for issues (`comments.length`). For discussions it is only
comparable while `comments.totalCount` and every fetched `replies.totalCount` fit the query window
(20 top-level comments, 20 replies each); beyond that the count depends on the window, so use the
marker alone and never compare counts.

Items with no stored entry are always new. An entry saved before the marker existed has no
`last_activity_at`: compare `updatedAt` and the count once, then store the marker. When `updatedAt` moved but
no comment or reply is newer than the marker, the item was only edited or reacted to: report it as touched,
do not triage it. If a discussion exceeds the window and `updatedAt` moved with nothing newer in view,
page older comments (see above) or read the thread by hand before calling it touched.

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

Post a direct reply with `gh issue comment <n> --body "<text>"` (for discussions, reply via
`gh api` GraphQL `addDiscussionComment`; REST cannot create discussion comments — POST returns
404). When replying inside a thread, `replyToId` must be the thread's **root** comment: pointing
it at a reply already inside the thread is rejected ("Parent comment is already in a thread,
cannot reply to it"). After posting, mark the item `replied_to: true`.

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

Update `.gh-inbox-state.json` with one entry per scanned item:

```bash
python3 - <<'PY'
import json
from pathlib import Path

path = Path(".gh-inbox-state.json")
state = json.loads(path.read_text()) if path.exists() else {}
state["issue-<n>"] = {
    "last_updated_at": "<iso>",
    "last_comment_count": <int>,
    "last_activity_at": "<iso>",
    "last_activity_by": "<login>",
    "replied_to": <bool>,
}
path.write_text(json.dumps(state, indent=2) + "\n")
PY
```

Use the same shape for discussions. Do this for every scanned item, not just the new
ones. Preserve existing `replied_to: true` values unless a reply was never posted.

## Use with

- `session-review` when inbox triage surfaces a workflow gap worth filing
- `verification` when repo cleanup follows an inbox pass

## Avoid

- Replying twice to the same thread (check `replied_to` and the live thread before posting)
- Fabricating answers about behavior, support, compatibility, or planned work
- Closing, labeling, assigning, or modifying issues without explicit approval
- Guessing when repository metadata, discussion access, local state, or a reply target is unclear — stop and report the blocker
