#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
CLAUDE_DIR="${1:-$HOME/.claude}"
SKILLS_SOURCE="$REPO_ROOT/.claude/skills"
SKILLS_TARGET="$CLAUDE_DIR/skills"
RULES_TARGET="$CLAUDE_DIR/rules"
RULES_FILE="$RULES_TARGET/nebu-skills.md"
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

node "$SCRIPT_DIR/export-platform-skills.js"

[ -d "$SKILLS_SOURCE" ] || {
  echo "Claude skills source directory not found: $SKILLS_SOURCE" >&2
  exit 1
}

mkdir -p "$SKILLS_TARGET" "$RULES_TARGET"

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

write_rules_file

echo "Installed ${installed_count} nebu-skills to $SKILLS_TARGET"
echo "Installed Claude Code rules to $RULES_FILE"
echo "Removed legacy Claude skill installs when present."
echo "Restart Claude Code or run /memory if the new rules do not appear immediately."