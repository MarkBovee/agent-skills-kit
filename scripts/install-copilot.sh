#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
COPILOT_DIR="${1:-$HOME/.copilot}"
SKILLS_SOURCE="$REPO_ROOT/.github/skills"
INSTRUCTIONS_SOURCE="$REPO_ROOT/.github/copilot-instructions.md"
SKILLS_TARGET="$COPILOT_DIR/skills"
INSTRUCTIONS_TARGET="$COPILOT_DIR/instructions"
INSTRUCTIONS_FILE="$INSTRUCTIONS_TARGET/nebu-skills.instructions.md"
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

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to export Copilot assets before install." >&2
  exit 1
fi

node "$SCRIPT_DIR/export-platform-skills.js"

[ -d "$SKILLS_SOURCE" ] || {
  echo "Copilot skills source directory not found: $SKILLS_SOURCE" >&2
  exit 1
}

[ -f "$INSTRUCTIONS_SOURCE" ] || {
  echo "Copilot instructions source file not found: $INSTRUCTIONS_SOURCE" >&2
  exit 1
}

mkdir -p "$SKILLS_TARGET" "$INSTRUCTIONS_TARGET"

remove_legacy_skill_installs "$SKILLS_TARGET"
remove_renamed_skill_installs "$SKILLS_TARGET"

installed_count=0
for skill_dir in "$SKILLS_SOURCE"/*; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  rm -rf "$SKILLS_TARGET/$skill_name"
  cp -R "$skill_dir" "$SKILLS_TARGET/$skill_name"
  installed_count=$((installed_count + 1))
done

cp "$INSTRUCTIONS_SOURCE" "$INSTRUCTIONS_FILE"

echo "Installed ${installed_count} nebu-skills to $SKILLS_TARGET"
echo "Installed Copilot instructions to $INSTRUCTIONS_FILE"
echo "Removed legacy Copilot skill installs when present."
echo "Restart VS Code or reload chat customizations if Copilot does not pick up the new files immediately."