#!/usr/bin/env bash

set -euo pipefail

usage() {
  printf 'Usage: %s <query> [repo]\n' "$0" >&2
  printf 'Example: %s "duplicate issue check before gh issue create" MarkBovee/agent-skills-kit\n' "$0" >&2
}

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  usage
  exit 1
fi

query="$1"
repo="${2:-}"

args=(issue list --state open --limit 10 --search "$query" --json number,title,url)

if [ -n "$repo" ]; then
  args+=(--repo "$repo")
fi

gh "${args[@]}"
