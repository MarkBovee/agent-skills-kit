#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"

# Support an optional fast path that skips the repository pull step.
if [ "${1:-}" = "--skip-pull" ]; then
  shift
  SKIP_PULL=1
else
  SKIP_PULL=0
fi

# Refresh the local checkout before reinstalling when this repo is a git clone.
if [ "$SKIP_PULL" -eq 0 ] && [ -d "$REPO_ROOT/.git" ]; then
  git -C "$REPO_ROOT" pull --ff-only
fi

# Refresh the cached awesome-copilot index when it is stale so nebu-skill-finder
# has up-to-date candidates without doing network work during a normal skill run.
if command -v node >/dev/null 2>&1 && [ -f "$REPO_ROOT/scripts/fetch-community-skills-index.js" ]; then
  node "$REPO_ROOT/scripts/fetch-community-skills-index.js" || echo "Warning: community-skills index refresh failed; continuing with cached data." >&2
fi

# Delegate the actual install step through bash so execution does not depend on file mode bits.
exec bash "$SCRIPT_DIR/install-opencode.sh" "$@"
