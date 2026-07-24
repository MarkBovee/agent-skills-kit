#!/usr/bin/env bash

# Read the declared nebu-skills version from the checked out repository.
read_repo_version() {
  local repo_root="$1"
  local version_file="$repo_root/VERSION"

  if [ -f "$version_file" ]; then
    tr -d '\r\n' < "$version_file"
    printf '\n'
    return 0
  fi

  printf '0.0.0\n'
}

# Emit the managed stale skill names that should be removed during upgrades.
stale_skill_names() {
  cat <<'EOF'
refactor
ui-ux-pro-max
using-nebu-skills
writing-nebu-skills
workspace-wrapup
nebu-test-driven-development
kaizen
nebu-kaizen
kickoff
nebu-kickoff
improve
nebu-improve
EOF
}

# Resolve the current git ref for user-facing release messages.
read_repo_ref() {
  local repo_root="$1"

  if git -C "$repo_root" describe --tags --exact-match >/dev/null 2>&1; then
    git -C "$repo_root" describe --tags --exact-match
    return 0
  fi

  if git -C "$repo_root" symbolic-ref --quiet --short HEAD >/dev/null 2>&1; then
    git -C "$repo_root" symbolic-ref --quiet --short HEAD
    return 0
  fi

  git -C "$repo_root" rev-parse --short HEAD
}

# Resolve the current git commit for install metadata.
read_repo_commit() {
  local repo_root="$1"

  if git -C "$repo_root" rev-parse --short HEAD >/dev/null 2>&1; then
    git -C "$repo_root" rev-parse --short HEAD
    return 0
  fi

  printf 'unknown\n'
}

# Refresh remote tags unless the caller explicitly asked for offline reuse.
refresh_repo_tags() {
  local repo_root="$1"
  local skip_fetch="${2:-0}"

  if [ "$skip_fetch" = "1" ]; then
    return 0
  fi

  if git -C "$repo_root" remote get-url origin >/dev/null 2>&1; then
    git -C "$repo_root" fetch --tags --force origin
  fi
}

# Remove older skill-pack installs that used the legacy lean naming.
remove_legacy_skill_installs() {
  local base_dir="$1"
  [ -d "$base_dir" ] || return 0

  find "$base_dir" -mindepth 1 -maxdepth 1 \( -name 'lean-*' -o -name '*leanctx*' \) -exec rm -rf {} +
}

# Remove stale managed skill directories that should no longer survive upgrades.
remove_stale_skill_installs() {
  local base_dir="$1"
  local skill_name=""
  [ -d "$base_dir" ] || return 0

  while IFS= read -r skill_name; do
    [ -n "$skill_name" ] || continue
    rm -rf "$base_dir/$skill_name"
  done <<EOF
$(stale_skill_names)
EOF
}

# Build the current managed skill list from the canonical source directory.
write_current_skill_manifest() {
  local source_dir="$1"
  local output_path="$2"
  local skill_dir=""

  : > "$output_path"

  for skill_dir in "$source_dir"/*; do
    [ -d "$skill_dir" ] || continue
    basename "$skill_dir" >> "$output_path"
  done
}

# Remove previously managed skills that no longer exist in the current source set.
remove_missing_managed_skills() {
  local target_dir="$1"
  local previous_manifest="$2"
  local current_manifest="$3"
  local skill_name=""
  [ -d "$target_dir" ] || return 0
  [ -f "$previous_manifest" ] || return 0

  while IFS= read -r skill_name; do
    [ -n "$skill_name" ] || continue
    [ -d "$target_dir/$skill_name" ] || continue

    if ! grep -Fxq "$skill_name" "$current_manifest"; then
      rm -rf "$target_dir/$skill_name"
    fi
  done < "$previous_manifest"
}

# Detect whether one git status line only touches generated platform artifacts.
is_generated_platform_status_line() {
  local status_line="$1"
  local path=""

  if [ -z "$status_line" ] || [ "${#status_line}" -lt 4 ]; then
    return 1
  fi

  path="${status_line:3}"
  path="${path#"${path%%[![:space:]]*}"}"
  if [[ "$path" == *" -> "* ]]; then
    path="${path##* -> }"
  fi

  case "$path" in
    CLAUDE.md|.claude/*|.github/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

# Restore generated platform artifacts when they are the only dirty files in a managed checkout.
restore_generated_platform_artifacts() {
  local repo_root="$1"
  local status_output=""
  local restored=0

  status_output="$(git -C "$repo_root" status --porcelain --untracked-files=all)" || {
    echo "Failed to inspect managed checkout state at $repo_root before pull recovery." >&2
    return 1
  }

  if [ -z "$status_output" ]; then
    return 2
  fi

  while IFS= read -r status_line; do
    [ -z "$status_line" ] && continue
    if ! is_generated_platform_status_line "$status_line"; then
      return 2
    fi
    restored=1
  done <<EOF
$status_output
EOF

  [ "$restored" -eq 1 ] || return 2

  git -C "$repo_root" restore --source=HEAD --staged --worktree -- .claude .github CLAUDE.md || {
    echo "Failed to restore generated platform artifacts in managed checkout $repo_root." >&2
    return 1
  }

  git -C "$repo_root" clean -fd -- .claude .github CLAUDE.md >/dev/null 2>&1 || {
    echo "Failed to clean generated platform artifacts in managed checkout $repo_root." >&2
    return 1
  }

  echo "Warning: managed checkout had local generated platform changes. Restored generated artifacts before pulling updates." >&2
  return 0
}

# Pull one managed checkout, retrying once after restoring generated platform artifacts when safe.
pull_managed_checkout() {
  local repo_root="$1"
  local recovery_status=0
  local pull_output=""
  local has_generated_artifact_conflict=0

  set +e
  pull_output="$(git -C "$repo_root" pull --ff-only 2>&1)"
  recovery_status=$?
  set -e
  [ -n "$pull_output" ] && printf '%s\n' "$pull_output"
  if [ "$recovery_status" -eq 0 ]; then
    return 0
  fi

  case "$pull_output" in
    *"would be overwritten by merge"*|*"Please commit your changes or stash them before you merge"*)
      has_generated_artifact_conflict=1
      ;;
  esac

  if [ "$has_generated_artifact_conflict" -ne 1 ]; then
    echo "git pull failed for managed checkout $repo_root. Resolve the git error above. If this checkout is incomplete, delete $repo_root and rerun bootstrap." >&2
    return 1
  fi

  set +e
  restore_generated_platform_artifacts "$repo_root"
  recovery_status=$?
  set -e
  if [ "$recovery_status" -ne 0 ]; then
    if [ "$recovery_status" -eq 2 ]; then
      echo "git pull failed for managed checkout $repo_root. Resolve the git error above. If this checkout is incomplete, delete $repo_root and rerun bootstrap." >&2
    fi
    return 1
  fi

  set +e
  pull_output="$(git -C "$repo_root" pull --ff-only 2>&1)"
  recovery_status=$?
  set -e
  [ -n "$pull_output" ] && printf '%s\n' "$pull_output"
  if [ "$recovery_status" -ne 0 ]; then
    echo "git pull failed for managed checkout $repo_root even after restoring generated platform artifacts. Resolve the git error above." >&2
    return 1
  fi
}

# Resolve the latest stable SemVer tag from the local checkout.
get_latest_stable_tag() {
  local repo_root="$1"
  local tag=""

  while IFS= read -r tag; do
    [ -n "$tag" ] || continue
    printf '%s\n' "$tag"
    return 0
  done < <(git -C "$repo_root" tag --sort=-version:refname --list | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$')

  return 1
}

# Create a temporary worktree for one stable release install or update run.
create_release_worktree() {
  local repo_root="$1"
  local release_ref="$2"
  local worktree_path=""

  worktree_path="$(mktemp -d "${TMPDIR:-/tmp}/nebu-skills-release-XXXXXX")"
  git -C "$repo_root" worktree add --detach "$worktree_path" "$release_ref" >/dev/null
  printf '%s\n' "$worktree_path"
}

# Remove a temporary release worktree after install or update completes.
remove_release_worktree() {
  local repo_root="$1"
  local worktree_path="$2"

  [ -n "$worktree_path" ] || return 0
  [ -d "$worktree_path" ] || return 0

  git -C "$repo_root" worktree remove --force "$worktree_path" >/dev/null 2>&1 || rm -rf "$worktree_path"
}

# Resolve the shared lock directory used while generated platform assets are exported and copied.
generated_assets_lock_dir() {
  local repo_root="$1"
  printf '%s\n' "$repo_root/.generated-platform-assets.lock"
}

# Serialize export-plus-copy phases so Copilot and Claude installers cannot race on generated assets.
acquire_generated_assets_lock() {
  local repo_root="$1"
  local lock_dir=""
  local owner_file=""
  local deadline=""
  local owner_pid=""

  lock_dir="$(generated_assets_lock_dir "$repo_root")"
  owner_file="$lock_dir/owner.pid"
  deadline=$(( $(date +%s) + 30 ))

  while [ "$(date +%s)" -lt "$deadline" ]; do
    if mkdir "$lock_dir" 2>/dev/null; then
      printf '%s\n' "$$" > "$owner_file"
      return 0
    fi

    owner_pid=""
    if [ -f "$owner_file" ]; then
      owner_pid="$(tr -d '[:space:]' < "$owner_file" 2>/dev/null || true)"
    fi

    if [ -z "$owner_pid" ] || ! kill -0 "$owner_pid" >/dev/null 2>&1; then
      rm -rf "$lock_dir"
      continue
    fi

    sleep 0.1
  done

  echo "Timed out waiting for generated assets lock at $lock_dir" >&2
  return 1
}

# Release the shared generated-assets lock after one installer finishes copying exported files.
release_generated_assets_lock() {
  local repo_root="$1"
  rm -rf "$(generated_assets_lock_dir "$repo_root")"
}

# Write install metadata so users can inspect installed version details locally.
write_install_metadata() {
  local repo_root="$1"
  local platform="$2"
  local install_root="$3"
  local output_path="$4"
  local version=""
  local ref=""
  local commit=""
  local installed_at=""

  version="$(read_repo_version "$repo_root")"
  ref="$(read_repo_ref "$repo_root")"
  commit="$(read_repo_commit "$repo_root")"
  installed_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  cat > "$output_path" <<EOF
name: nebu-skills
platform: $platform
version: $version
ref: $ref
commit: $commit
installed_at: $installed_at
install_root: $install_root
EOF
}
