#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/MarkBovee/agent-skills-kit.git"
REPO_DIR="${REPO_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/agent-skills-kit}"
LEGACY_REPO_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/nebu-skills"
SKIP_PULL="${SKIP_PULL:-0}"
HELPERS_PATH="$REPO_DIR/scripts/release-helpers.sh"

# Migrate a managed checkout from the old nebu-skills path to the new
# agent-skills-kit path, but only when no new-path checkout exists yet and
# the old one still points at this repo (avoids clobbering unrelated dirs).
if [ ! -e "$REPO_DIR" ] && [ -d "$LEGACY_REPO_DIR/.git" ]; then
  legacy_remote="$(git -C "$LEGACY_REPO_DIR" remote get-url origin 2>/dev/null || true)"
  case "$legacy_remote" in
    *nebu-skills*|*agent-skills-kit*)
      echo "Migrating managed checkout from $LEGACY_REPO_DIR to $REPO_DIR ..." >&2
      mkdir -p "$(dirname "$REPO_DIR")"
      mv "$LEGACY_REPO_DIR" "$REPO_DIR"
      git -C "$REPO_DIR" remote set-url origin "$REPO_URL"
      ;;
  esac
fi

# Pull one managed checkout, retrying after restoring generated artifacts when that is the only local drift.
bootstrap_pull_managed_checkout() {
  local repo_root="$1"
  local pull_output=""
  local pull_status=0
  local status_output=""
  local only_generated=1
  local path=""

  set +e
  pull_output="$(git -C "$repo_root" pull --ff-only 2>&1)"
  pull_status=$?
  set -e
  [ -n "$pull_output" ] && printf '%s\n' "$pull_output"
  if [ "$pull_status" -eq 0 ]; then
    return 0
  fi

  case "$pull_output" in
    *"would be overwritten by merge"*|*"Please commit your changes or stash them before you merge"*) ;;
    *)
      echo "git pull failed for managed checkout $repo_root. Resolve the git error above. If this checkout is incomplete, delete $repo_root and rerun bootstrap." >&2
      return 1
      ;;
  esac

  status_output="$(git -C "$repo_root" status --porcelain --untracked-files=all)" || {
    echo "git pull failed for managed checkout $repo_root. Resolve the git error above. If this checkout is incomplete, delete $repo_root and rerun bootstrap." >&2
    return 1
  }

  if [ -z "$status_output" ]; then
    echo "git pull failed for managed checkout $repo_root. Resolve the git error above. If this checkout is incomplete, delete $repo_root and rerun bootstrap." >&2
    return 1
  fi

  while IFS= read -r status_line; do
    [ -z "$status_line" ] && continue
    path="${status_line:3}"
    path="${path#"${path%%[![:space:]]*}"}"
    if [[ "$path" == *" -> "* ]]; then
      path="${path##* -> }"
    fi
    case "$path" in
      CLAUDE.md|.claude/*|.github/*) ;;
      *)
        only_generated=0
        break
        ;;
    esac
  done <<EOF
$status_output
EOF

  if [ "$only_generated" -ne 1 ]; then
    echo "git pull failed for managed checkout $repo_root. Resolve the git error above. If this checkout is incomplete, delete $repo_root and rerun bootstrap." >&2
    return 1
  fi

  git -C "$repo_root" restore --source=HEAD --staged --worktree -- .claude .github CLAUDE.md || {
    echo "Failed to restore generated platform artifacts in managed checkout $repo_root." >&2
    return 1
  }

  git -C "$repo_root" clean -fd -- .claude .github CLAUDE.md >/dev/null 2>&1 || {
    echo "Failed to clean generated platform artifacts in managed checkout $repo_root." >&2
    return 1
  }

  echo "Warning: managed checkout had local generated platform changes. Restored generated artifacts before pulling updates." >&2
  set +e
  pull_output="$(git -C "$repo_root" pull --ff-only 2>&1)"
  pull_status=$?
  set -e
  [ -n "$pull_output" ] && printf '%s\n' "$pull_output"
  if [ "$pull_status" -ne 0 ]; then
    echo "git pull failed for managed checkout $repo_root even after restoring generated platform artifacts. Resolve the git error above." >&2
    return 1
  fi
}

# Ensure the bootstrap flow fails early when git is unavailable.
if ! command -v git >/dev/null 2>&1; then
  echo "git is required to install or update agent-skills-kit." >&2
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
  bootstrap_pull_managed_checkout "$REPO_DIR"
fi

[ -f "$HELPERS_PATH" ] || {
  echo "Managed checkout is incomplete: expected bootstrap helpers at $HELPERS_PATH. Delete $REPO_DIR and rerun bootstrap." >&2
  exit 1
}

# Load helper functions from the managed checkout so raw stdin bootstrap works too.
. "$HELPERS_PATH"

refresh_repo_tags "$REPO_DIR" "$SKIP_PULL"
if SELECTED_REF="$(get_latest_stable_tag "$REPO_DIR")"; then
  RELEASE_WORKTREE="$(create_release_worktree "$REPO_DIR" "$SELECTED_REF")"
  INSTALL_SOURCE_ROOT="$RELEASE_WORKTREE"
  trap 'remove_release_worktree "$REPO_DIR" "$RELEASE_WORKTREE"' EXIT
  if [ ! -f "$INSTALL_SOURCE_ROOT/scripts/install.sh" ]; then
    echo "Stable agent-skills-kit $(read_repo_version "$INSTALL_SOURCE_ROOT") ($SELECTED_REF) predates the unified installer. Falling back to current checkout $(read_repo_version "$REPO_DIR") ($(read_repo_ref "$REPO_DIR"))." >&2
    remove_release_worktree "$REPO_DIR" "$RELEASE_WORKTREE"
    RELEASE_WORKTREE=""
    INSTALL_SOURCE_ROOT="$REPO_DIR"
    trap - EXIT
  else
    echo "Using stable agent-skills-kit $(read_repo_version "$INSTALL_SOURCE_ROOT") ($SELECTED_REF)"
  fi
else
  SELECTED_REF="$(read_repo_ref "$REPO_DIR")"
  echo "No stable release tag found yet. Using current checkout $(read_repo_version "$REPO_DIR") ($SELECTED_REF)." >&2
fi

# Delegate the actual installation to the unified installer script.
bash "$INSTALL_SOURCE_ROOT/scripts/install.sh"