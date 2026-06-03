#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
. "$SCRIPT_DIR/release-helpers.sh"
OPENCODE_DIR="${1:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}"
CORE_SOURCE="$REPO_ROOT/core"
SKILLS_SOURCE="$REPO_ROOT/skills"
PLUGINS_SOURCE="$REPO_ROOT/plugins"
CORE_TARGET="$OPENCODE_DIR/core"
SKILLS_TARGET="$OPENCODE_DIR/skills"
PLUGINS_TARGET="$OPENCODE_DIR/plugins"
INSTALL_METADATA_FILE="$OPENCODE_DIR/.nebu-skills-install.txt"
LEGACY_AGENT_SKILLS_DIR="$HOME/.agents/skills"
LEGACY_CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
MANAGED_SKILLS_MANIFEST=".nebu-managed-skills.txt"
STALE_SKILLS=(
  "refactor"
  "ui-ux-pro-max"
  "using-nebu-skills"
  "writing-nebu-skills"
  "workspace-wrapup"
  "nebu-test-driven-development"
)

# Remove older skill-pack installs that used the legacy lean naming.
remove_legacy_skill_installs() {
  local base_dir="$1"
  [ -d "$base_dir" ] || return 0

  find "$base_dir" -mindepth 1 -maxdepth 1 \( -name 'lean-*' -o -name '*leanctx*' \) -exec rm -rf {} +
}

# Remove stale skill directories that should no longer survive upgrades.
remove_stale_skill_installs() {
  local base_dir="$1"
  [ -d "$base_dir" ] || return 0

  local skill_name
  for skill_name in "${STALE_SKILLS[@]}"; do
    rm -rf "$base_dir/$skill_name"
  done
}

# Build the current managed skill list from the canonical source directory.
write_current_skill_manifest() {
  local source_dir="$1"
  local output_path="$2"

  : > "$output_path"

  local skill_dir
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
  [ -d "$target_dir" ] || return 0
  [ -f "$previous_manifest" ] || return 0

  local skill_name
  while IFS= read -r skill_name; do
    [ -n "$skill_name" ] || continue
    [ -d "$target_dir/$skill_name" ] || continue

    if ! grep -Fxq "$skill_name" "$current_manifest"; then
      rm -rf "$target_dir/$skill_name"
    fi
  done < "$previous_manifest"
}

[ -d "$CORE_SOURCE" ] || {
  echo "Core source directory not found: $CORE_SOURCE" >&2
  exit 1
}

# Fail fast when the canonical source directories are missing from the checkout.
[ -d "$SKILLS_SOURCE" ] || {
  echo "Skills source directory not found: $SKILLS_SOURCE" >&2
  exit 1
}

[ -d "$PLUGINS_SOURCE" ] || {
  echo "Plugins source directory not found: $PLUGINS_SOURCE" >&2
  exit 1
}

# Ensure the target OpenCode directories exist before copying managed assets.
mkdir -p "$CORE_TARGET" "$SKILLS_TARGET" "$PLUGINS_TARGET"

CURRENT_MANAGED_SKILLS="$(mktemp)"
trap 'rm -f "$CURRENT_MANAGED_SKILLS"' EXIT
write_current_skill_manifest "$SKILLS_SOURCE" "$CURRENT_MANAGED_SKILLS"

# Clean up legacy installs before copying the current managed skill set.
remove_legacy_skill_installs "$SKILLS_TARGET"
remove_legacy_skill_installs "$LEGACY_AGENT_SKILLS_DIR"
remove_legacy_skill_installs "$LEGACY_CLAUDE_SKILLS_DIR"
remove_stale_skill_installs "$SKILLS_TARGET"
remove_stale_skill_installs "$LEGACY_AGENT_SKILLS_DIR"
remove_stale_skill_installs "$LEGACY_CLAUDE_SKILLS_DIR"
remove_missing_managed_skills "$SKILLS_TARGET" "$SKILLS_TARGET/$MANAGED_SKILLS_MANIFEST" "$CURRENT_MANAGED_SKILLS"

# Replace each managed skill directory atomically enough for an idempotent reinstall.
installed_count=0
for skill_dir in "$SKILLS_SOURCE"/*; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  rm -rf "$SKILLS_TARGET/$skill_name"
  cp -R "$skill_dir" "$SKILLS_TARGET/$skill_name"
  installed_count=$((installed_count + 1))
done

cp "$CURRENT_MANAGED_SKILLS" "$SKILLS_TARGET/$MANAGED_SKILLS_MANIFEST"

# Copy the shared router core so the installed plugin can resolve its dependency.
rm -rf "$CORE_TARGET"
cp -R "$CORE_SOURCE" "$CORE_TARGET"

# Copy the router plugin after the skill directories are in place.
cp "$PLUGINS_SOURCE/nebu-skills-router.js" "$PLUGINS_TARGET/nebu-skills-router.js"

# Record install metadata so users can inspect the managed version later.
write_install_metadata "$REPO_ROOT" "opencode" "$OPENCODE_DIR" "$INSTALL_METADATA_FILE"

# Report only the managed changes made by this installer run.
echo "Installed ${installed_count} nebu-skills to $SKILLS_TARGET"
echo "Installed shared router core to $CORE_TARGET"
echo "Installed router plugin to $PLUGINS_TARGET/nebu-skills-router.js"
echo "Wrote install metadata to $INSTALL_METADATA_FILE"
echo "Removed legacy skill installs when present."
echo "Removed stale managed skills when present."
echo "Other opencode plugins were left untouched, so this should coexist with nebu-ctx."
echo "Restart opencode to load the new skills and plugin."
