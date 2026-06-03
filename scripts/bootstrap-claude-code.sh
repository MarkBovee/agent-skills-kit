#!/usr/bin/env bash
set -euo pipefail

. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/release-helpers.sh"
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

INSTALL_SOURCE_ROOT="$REPO_DIR"
RELEASE_WORKTREE=""

# Clone the managed checkout on first run, or reuse the managed clone on update.
if [ ! -d "$REPO_DIR/.git" ]; then
  if [ -e "$REPO_DIR" ]; then
    echo "Repo directory exists but is not a git checkout: $REPO_DIR" >&2
    exit 1
  fi

  git clone "$REPO_URL" "$REPO_DIR"
elif [ "$SKIP_PULL" != "1" ]; then
  git -C "$REPO_DIR" pull --ff-only
fi

refresh_repo_tags "$REPO_DIR" "$SKIP_PULL"
if SELECTED_REF="$(get_latest_stable_tag "$REPO_DIR")"; then
  RELEASE_WORKTREE="$(create_release_worktree "$REPO_DIR" "$SELECTED_REF")"
  INSTALL_SOURCE_ROOT="$RELEASE_WORKTREE"
  trap 'remove_release_worktree "$REPO_DIR" "$RELEASE_WORKTREE"' EXIT
  echo "Using stable nebu-skills $(read_repo_version "$INSTALL_SOURCE_ROOT") ($SELECTED_REF)"
else
  SELECTED_REF="$(read_repo_ref "$REPO_DIR")"
  echo "No stable release tag found yet. Using current checkout $(read_repo_version "$REPO_DIR") ($SELECTED_REF)." >&2
fi

# Delegate the actual Claude Code installation to the local installer script.
bash "$INSTALL_SOURCE_ROOT/scripts/install-claude-code.sh" "$CLAUDE_DIR"
