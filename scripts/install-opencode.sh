#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
OPENCODE_DIR="${1:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}"
SKILLS_SOURCE="$REPO_ROOT/skills"
PLUGINS_SOURCE="$REPO_ROOT/plugins"
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

remove_legacy_skill_installs() {
  local base_dir="$1"
  [ -d "$base_dir" ] || return 0

  find "$base_dir" -mindepth 1 -maxdepth 1 \( -name 'lean-*' -o -name '*leanctx*' \) -exec rm -rf {} +
}

remove_renamed_skill_installs() {
  local base_dir="$1"
  [ -d "$base_dir" ] || return 0

  local skill_name
  for skill_name in "${RENAMED_SKILLS[@]}"; do
    rm -rf "$base_dir/$skill_name"
  done
}

[ -d "$SKILLS_SOURCE" ] || {
  echo "Skills source directory not found: $SKILLS_SOURCE" >&2
  exit 1
}

[ -d "$PLUGINS_SOURCE" ] || {
  echo "Plugins source directory not found: $PLUGINS_SOURCE" >&2
  exit 1
}

mkdir -p "$SKILLS_TARGET" "$PLUGINS_TARGET"

remove_legacy_skill_installs "$SKILLS_TARGET"
remove_legacy_skill_installs "$LEGACY_AGENT_SKILLS_DIR"
remove_legacy_skill_installs "$LEGACY_CLAUDE_SKILLS_DIR"
remove_renamed_skill_installs "$SKILLS_TARGET"
remove_renamed_skill_installs "$LEGACY_AGENT_SKILLS_DIR"
remove_renamed_skill_installs "$LEGACY_CLAUDE_SKILLS_DIR"

installed_count=0
for skill_dir in "$SKILLS_SOURCE"/*; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  rm -rf "$SKILLS_TARGET/$skill_name"
  cp -R "$skill_dir" "$SKILLS_TARGET/$skill_name"
  installed_count=$((installed_count + 1))
done

cp "$PLUGINS_SOURCE/nebu-skills-router.js" "$PLUGINS_TARGET/nebu-skills-router.js"

echo "Installed ${installed_count} nebu-skills to $SKILLS_TARGET"
echo "Installed router plugin to $PLUGINS_TARGET/nebu-skills-router.js"
echo "Removed legacy skill installs when present."
echo "Removed renamed legacy skills when present."
echo "Other opencode plugins were left untouched, so this should coexist with nebu-ctx."
echo "Restart opencode to load the new skills and plugin."
