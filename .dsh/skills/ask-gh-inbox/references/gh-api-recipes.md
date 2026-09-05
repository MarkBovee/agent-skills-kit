# GitHub API Recipes

## Fetch

```bash
gh repo view --json nameWithOwner
```

```bash
gh issue list --state open --json number,title,updatedAt,comments,labels --limit 50
```

```bash
OWNER=$(gh repo view --json owner --jq '.owner.login')
NAME=$(gh repo view --json name --jq '.name')
gh api graphql -f owner="$OWNER" -f name="$NAME" -f query='query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { discussions(first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { number title updatedAt url comments(first: 20) { totalCount nodes { id createdAt author { login } body replies(first: 20) { totalCount nodes { id createdAt author { login } body } } } } } } } }'
```

## Post

```bash
gh issue comment <n> --body "<text>"
```

```bash
gh api graphql \
  -f discussionId="$DISCUSSION_ID" \
  -f body="$TEXT" \
  -f replyToId="$ROOT_COMMENT_ID" \
  -f query='mutation($discussionId: ID!, $body: String!, $replyToId: ID) { addDiscussionComment(input: {discussionId: $discussionId, body: $body, replyToId: $replyToId}) { comment { id } } }'
```

For a top-level discussion comment, omit `replyToId`. For a threaded reply, use the
thread's root comment ID, not an existing reply ID.

## State persistence (without python3)

Write `.gh-inbox-state.json` with your file tool using this exact shape: `{"issue-<n>": {"last_updated_at": "<iso>", "last_comment_count": <int>, "replied_to": <bool>}}` per scanned item; preserve existing `replied_to: true` values unless a reply was never posted; do this for every scanned item, not just new ones.
