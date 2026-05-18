#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"

if [ "${1:-}" = "--skip-pull" ]; then
  shift
  SKIP_PULL=1
else
  SKIP_PULL=0
fi

if [ "$SKIP_PULL" -eq 0 ] && [ -d "$REPO_ROOT/.git" ]; then
  git -C "$REPO_ROOT" pull --ff-only
fi

exec "$SCRIPT_DIR/install-opencode.sh" "$@"
