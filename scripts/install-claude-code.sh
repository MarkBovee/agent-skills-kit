#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
. "$SCRIPT_DIR/release-helpers.sh"
CLAUDE_DIR="${1:-$HOME/.claude}"
SKILLS_SOURCE="$REPO_ROOT/.claude/skills"
SKILLS_TARGET="$CLAUDE_DIR/skills"
RULES_TARGET="$CLAUDE_DIR/rules"
RULES_FILE="$RULES_TARGET/nebu-skills.md"
INSTALL_METADATA_FILE="$CLAUDE_DIR/.nebu-skills-install.txt"
MANAGED_SKILLS_MANIFEST=".nebu-managed-skills.txt"
STALE_SKILLS=(
  "refactor"
  "ui-ux-pro-max"
  "using-nebu-skills"
  "writing-nebu-skills"
  "workspace-wrapup"
  "nebu-test-driven-development"
)
CURRENT_MANAGED_SKILLS=""
GENERATED_ASSETS_LOCK_HELD=0

# Clean up installer temp state and shared locks on every exit path.
cleanup_install() {
  if [ -n "$CURRENT_MANAGED_SKILLS" ] && [ -f "$CURRENT_MANAGED_SKILLS" ]; then
    rm -f "$CURRENT_MANAGED_SKILLS"
  fi

  if [ "$GENERATED_ASSETS_LOCK_HELD" -eq 1 ]; then
    release_generated_assets_lock "$REPO_ROOT"
  fi
}

trap cleanup_install EXIT

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

# Write the global Claude rule file without depending on repo-local imports.
write_rules_file() {
  cat > "$RULES_FILE" <<'EOF'
# Nebu Skills

- Prefer workflow skills under `~/.claude/skills/` when the user's request clearly matches one of them instead of rewriting the workflow inline.
- Treat `nebu-kaizen` as the default execution baseline for normal software work and combine it with a more specific skill when needed.
- After code edits, bias toward `nebu-code-review` before `nebu-verification` when the user is moving toward done, ready, finished, handoff, or klaar wording.
- If review, verification, or wrap-up exposes a reusable workflow gap, capture it with `nebu-skill-improvement` before ending cold.
- When editing code, add concise intent comments by default; place one short comment above each function unless the repo's local convention says otherwise.
EOF
}

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to export Claude assets before install." >&2
  exit 1
fi

acquire_generated_assets_lock "$REPO_ROOT"
GENERATED_ASSETS_LOCK_HELD=1

node "$SCRIPT_DIR/export-platform-skills.js"

[ -d "$SKILLS_SOURCE" ] || {
  echo "Claude skills source directory not found: $SKILLS_SOURCE" >&2
  exit 1
}

mkdir -p "$SKILLS_TARGET" "$RULES_TARGET"

CURRENT_MANAGED_SKILLS="$(mktemp)"
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

write_rules_file

# Record install metadata so users can inspect the managed version later.
write_install_metadata "$REPO_ROOT" "claude-code" "$CLAUDE_DIR" "$INSTALL_METADATA_FILE"

echo "Installed ${installed_count} nebu-skills to $SKILLS_TARGET"
echo "Installed Claude Code rules to $RULES_FILE"
echo "Wrote install metadata to $INSTALL_METADATA_FILE"
echo "Removed legacy Claude skill installs when present."
echo "Removed stale managed Claude skills when present."
echo "Restart Claude Code or run /memory if the new rules do not appear immediately."
