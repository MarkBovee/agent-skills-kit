#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
. "$SCRIPT_DIR/release-helpers.sh"

# Support an optional fast path that skips the repository pull step.
if [ "${1:-}" = "--skip-pull" ]; then
  shift
  SKIP_PULL=1
else
  SKIP_PULL=0
fi

if [ "$SKIP_PULL" -eq 0 ] && [ -d "$REPO_ROOT/.git" ]; then
  pull_managed_checkout "$REPO_ROOT"
fi

PREVIOUS_VERSION="$(read_repo_version "$REPO_ROOT")"
PREVIOUS_REF="$(read_repo_ref "$REPO_ROOT")"
INSTALL_SOURCE_ROOT="$REPO_ROOT"
RELEASE_WORKTREE=""

refresh_repo_tags "$REPO_ROOT" "$SKIP_PULL"
if SELECTED_REF="$(get_latest_stable_tag "$REPO_ROOT")"; then
  RELEASE_WORKTREE="$(create_release_worktree "$REPO_ROOT" "$SELECTED_REF")"
  INSTALL_SOURCE_ROOT="$RELEASE_WORKTREE"
  trap 'remove_release_worktree "$REPO_ROOT" "$RELEASE_WORKTREE"' EXIT
  if [ ! -f "$INSTALL_SOURCE_ROOT/scripts/install.sh" ]; then
    echo "Stable nebu-skills $(read_repo_version "$INSTALL_SOURCE_ROOT") ($SELECTED_REF) predates the unified installer. Falling back to current checkout $(read_repo_version "$REPO_ROOT") ($(read_repo_ref "$REPO_ROOT"))." >&2
    remove_release_worktree "$REPO_ROOT" "$RELEASE_WORKTREE"
    RELEASE_WORKTREE=""
    INSTALL_SOURCE_ROOT="$REPO_ROOT"
    trap - EXIT
  else
    echo "Using stable nebu-skills $(read_repo_version "$INSTALL_SOURCE_ROOT") ($SELECTED_REF)"
  fi
else
  SELECTED_REF="$(read_repo_ref "$REPO_ROOT")"
  echo "No stable release tag found yet. Using current checkout $(read_repo_version "$REPO_ROOT") ($SELECTED_REF)." >&2
fi

CURRENT_VERSION="$(read_repo_version "$INSTALL_SOURCE_ROOT")"
if [ "$PREVIOUS_VERSION" != "$CURRENT_VERSION" ] || [ "$PREVIOUS_REF" != "$SELECTED_REF" ]; then
  echo "Updated managed checkout from $PREVIOUS_VERSION ($PREVIOUS_REF) to $CURRENT_VERSION ($SELECTED_REF)"
else
  echo "Managed checkout already on latest stable $CURRENT_VERSION ($SELECTED_REF)"
fi

# Delegate the actual install step through bash so execution does not depend on file mode bits.
bash "$INSTALL_SOURCE_ROOT/scripts/install.sh"