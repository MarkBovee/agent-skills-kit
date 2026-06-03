#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
. "$SCRIPT_DIR/release-helpers.sh"
COPILOT_DIR="${1:-$HOME/.copilot}"
SKILLS_SOURCE="$REPO_ROOT/.github/skills"
INSTRUCTIONS_SOURCE="$REPO_ROOT/.github/copilot-instructions.md"
SKILLS_TARGET="$COPILOT_DIR/skills"
INSTRUCTIONS_TARGET="$COPILOT_DIR/instructions"
INSTRUCTIONS_FILE="$INSTRUCTIONS_TARGET/nebu-skills.instructions.md"
INSTALL_METADATA_FILE="$COPILOT_DIR/.nebu-skills-install.txt"
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

# Build the current managed skill list from the generated source directory.
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

CURRENT_MANAGED_SKILLS="$(mktemp)"
trap 'rm -f "$CURRENT_MANAGED_SKILLS"' EXIT
write_current_skill_manifest "$SKILLS_SOURCE" "$CURRENT_MANAGED_SKILLS"

remove_legacy_skill_installs "$SKILLS_TARGET"
remove_stale_skill_installs "$SKILLS_TARGET"
remove_missing_managed_skills "$SKILLS_TARGET" "$SKILLS_TARGET/$MANAGED_SKILLS_MANIFEST" "$CURRENT_MANAGED_SKILLS"

installed_count=0
for skill_dir in "$SKILLS_SOURCE"/*; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  rm -rf "$SKILLS_TARGET/$skill_name"
  cp -R "$skill_dir" "$SKILLS_TARGET/$skill_name"
  installed_count=$((installed_count + 1))
done

cp "$CURRENT_MANAGED_SKILLS" "$SKILLS_TARGET/$MANAGED_SKILLS_MANIFEST"

cp "$INSTRUCTIONS_SOURCE" "$INSTRUCTIONS_FILE"

# Record install metadata so users can inspect the managed version later.
write_install_metadata "$REPO_ROOT" "copilot" "$COPILOT_DIR" "$INSTALL_METADATA_FILE"

echo "Installed ${installed_count} nebu-skills to $SKILLS_TARGET"
echo "Installed Copilot instructions to $INSTRUCTIONS_FILE"
echo "Wrote install metadata to $INSTALL_METADATA_FILE"
echo "Removed legacy Copilot skill installs when present."
echo "Removed stale managed Copilot skills when present."
echo "Restart VS Code or reload chat customizations if Copilot does not pick up the new files immediately."
