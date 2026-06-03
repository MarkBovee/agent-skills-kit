#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
. "$SCRIPT_DIR/release-helpers.sh"

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
  echo "Using stable nebu-skills $(read_repo_version "$INSTALL_SOURCE_ROOT") ($SELECTED_REF)"
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

bash "$INSTALL_SOURCE_ROOT/scripts/install-claude-code.sh" "$@"
