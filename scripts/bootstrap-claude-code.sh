#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/MarkBovee/nebu-skills.git"
REPO_DIR="${REPO_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/nebu-skills}"
CLAUDE_DIR="${1:-$HOME/.claude}"
SKIP_PULL="${SKIP_PULL:-0}"

# Ensure the bootstrap flow fails early when git is unavailable.
if ! command -v git >/dev/null 2>&1; then
  echo "git is required to install or update nebu-skills." >&2
  exit 1
fi

# Create the parent directory for the managed checkout before clone or update.
mkdir -p "$(dirname "$REPO_DIR")"

# Clone the managed checkout on first run, or fast-forward it on update.
if [ ! -d "$REPO_DIR/.git" ]; then
  if [ -e "$REPO_DIR" ]; then
    echo "Repo directory exists but is not a git checkout: $REPO_DIR" >&2
    exit 1
  fi

  git clone "$REPO_URL" "$REPO_DIR"
elif [ "$SKIP_PULL" != "1" ]; then
  git -C "$REPO_DIR" pull --ff-only
fi

# Delegate the actual Claude Code installation to the local installer script.
exec bash "$REPO_DIR/scripts/install-claude-code.sh" "$CLAUDE_DIR"
