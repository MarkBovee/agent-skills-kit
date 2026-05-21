#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
OPENCODE_DIR="${1:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}"
CORE_SOURCE="$REPO_ROOT/core"
SKILLS_SOURCE="$REPO_ROOT/skills"
PLUGINS_SOURCE="$REPO_ROOT/plugins"
CORE_TARGET="$OPENCODE_DIR/core"
SKILLS_TARGET="$OPENCODE_DIR/skills"
PLUGINS_TARGET="$OPENCODE_DIR/plugins"
LEGACY_AGENT_SKILLS_DIR="$HOME/.agents/skills"
LEGACY_CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
RENAMED_SKILLS=(
  "refactor"
  "ui-ux-pro-max"
  "using-nebu-skills"
  "writing-nebu-skills"
  "workspace-wrapup"
)

# Remove older skill-pack installs that used the legacy lean naming.
remove_legacy_skill_installs() {
  local base_dir="$1"
  [ -d "$base_dir" ] || return 0

  find "$base_dir" -mindepth 1 -maxdepth 1 \( -name 'lean-*' -o -name '*leanctx*' \) -exec rm -rf {} +
}

# Remove renamed skill directories that should no longer survive upgrades.
remove_renamed_skill_installs() {
  local base_dir="$1"
  [ -d "$base_dir" ] || return 0

  local skill_name
  for skill_name in "${RENAMED_SKILLS[@]}"; do
    rm -rf "$base_dir/$skill_name"
  done
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

# Clean up legacy installs before copying the current managed skill set.
remove_legacy_skill_installs "$SKILLS_TARGET"
remove_legacy_skill_installs "$LEGACY_AGENT_SKILLS_DIR"
remove_legacy_skill_installs "$LEGACY_CLAUDE_SKILLS_DIR"
remove_renamed_skill_installs "$SKILLS_TARGET"
remove_renamed_skill_installs "$LEGACY_AGENT_SKILLS_DIR"
remove_renamed_skill_installs "$LEGACY_CLAUDE_SKILLS_DIR"

# Replace each managed skill directory atomically enough for an idempotent reinstall.
installed_count=0
for skill_dir in "$SKILLS_SOURCE"/*; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  rm -rf "$SKILLS_TARGET/$skill_name"
  cp -R "$skill_dir" "$SKILLS_TARGET/$skill_name"
  installed_count=$((installed_count + 1))
done

# Copy the shared router core so the installed plugin can resolve its dependency.
rm -rf "$CORE_TARGET"
cp -R "$CORE_SOURCE" "$CORE_TARGET"

# Copy the router plugin after the skill directories are in place.
cp "$PLUGINS_SOURCE/nebu-skills-router.js" "$PLUGINS_TARGET/nebu-skills-router.js"

# Report only the managed changes made by this installer run.
echo "Installed ${installed_count} nebu-skills to $SKILLS_TARGET"
echo "Installed shared router core to $CORE_TARGET"
echo "Installed router plugin to $PLUGINS_TARGET/nebu-skills-router.js"
echo "Removed legacy skill installs when present."
echo "Removed renamed legacy skills when present."
echo "Other opencode plugins were left untouched, so this should coexist with nebu-ctx."
echo "Restart opencode to load the new skills and plugin."
