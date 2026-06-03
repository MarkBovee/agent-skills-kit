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
