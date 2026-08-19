#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
. "$SCRIPT_DIR/release-helpers.sh"

AGENTS_DIR="${AGENTS_DIR:-$HOME/.agents}"
COPILOT_DIR="${COPILOT_DIR:-$HOME/.copilot}"
OPENCODE_DIR="${OPENCODE_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"

SHARED_SKILLS_SOURCE="$REPO_ROOT/skills"
COPILOT_INSTRUCTIONS_SOURCE="$REPO_ROOT/.github/copilot-instructions.md"
OPENCODE_COMMANDS_SOURCE="$REPO_ROOT/.opencode/commands"
COPILOT_PROMPTS_SOURCE="$REPO_ROOT/.github/prompts"
OPENCODE_CORE_SOURCE="$REPO_ROOT/core"
OPENCODE_PLUGINS_SOURCE="$REPO_ROOT/plugins"
OPENCODE_RULES_SOURCE="$REPO_ROOT/rules"
DSH_SKILLS_SOURCE="$REPO_ROOT/.dsh/skills"

SHARED_SKILLS_TARGET="$AGENTS_DIR/skills"
COPILOT_SKILLS_TARGET="$COPILOT_DIR/skills"
COPILOT_INSTRUCTIONS_TARGET="$COPILOT_DIR/instructions"
COPILOT_INSTRUCTIONS_FILE="$COPILOT_INSTRUCTIONS_TARGET/agent-skills-kit.instructions.md"
COPILOT_PROMPTS_TARGET="$COPILOT_DIR/prompts"
OPENCODE_COMMANDS_TARGET="$OPENCODE_DIR/commands"
OPENCODE_CORE_TARGET="$OPENCODE_DIR/core"
OPENCODE_SKILLS_TARGET="$OPENCODE_DIR/skills"
OPENCODE_PLUGINS_TARGET="$OPENCODE_DIR/plugins"
OPENCODE_RULES_TARGET="$OPENCODE_DIR/rules"
CLAUDE_SKILLS_TARGET="$CLAUDE_DIR/skills"
CLAUDE_RULES_TARGET="$CLAUDE_DIR/rules"
CLAUDE_RULES_FILE="$CLAUDE_RULES_TARGET/agent-skills-kit.md"
DSH_SKILLS_TARGET="$DSH_HOME/skills"
DSH_AGENTS_FILE="$DSH_HOME/AGENTS.md"
DSH_METADATA_FILE="$DSH_HOME/.agent-skills-kit-dsh-install.txt"
INSTALL_METADATA_FILE="$AGENTS_DIR/.agent-skills-kit-install.txt"
MANAGED_SKILLS_MANIFEST=".ask-managed-skills.txt"
DSH_SECTION_MARKER="<!-- agent-skills-kit:dsh -->"
CURRENT_MANAGED_SKILLS=""
GENERATED_ASSETS_LOCK_HELD=0

# Remove files from the pre-ASK installer without touching user-owned content.
remove_legacy_install_artifacts() {
  rm -f \
    "$AGENTS_DIR/.nebu-skills-install.txt" \
    "$SHARED_SKILLS_TARGET/.nebu-managed-skills.txt" \
    "$COPILOT_DIR/.nebu-skills-install.txt" \
    "$COPILOT_DIR/instructions/nebu-skills.instructions.md" \
    "$COPILOT_DIR/mcp-config.json.nebu-ctx.bak" \
    "$OPENCODE_DIR/opencode.json.nebu-ctx.bak" \
    "$OPENCODE_DIR/plugins/nebu-ctx.ts" \
    "$OPENCODE_DIR/plugins/nebu-ctx.ts.nebu-ctx.bak" \
    "$OPENCODE_DIR/plugins/nebu-skills-router.js" \
    "$OPENCODE_DIR/rules/nebu-ctx.md" \
    "$CLAUDE_DIR/hooks/nebu-ctx-redirect-native" \
    "$CLAUDE_DIR/hooks/nebu-ctx-redirect-native.nebu-ctx.bak" \
    "$CLAUDE_DIR/hooks/nebu-ctx-redirect.sh" \
    "$CLAUDE_DIR/hooks/nebu-ctx-redirect.sh.nebu-ctx.bak" \
    "$CLAUDE_DIR/hooks/nebu-ctx-rewrite-native" \
    "$CLAUDE_DIR/hooks/nebu-ctx-rewrite-native.nebu-ctx.bak" \
    "$CLAUDE_DIR/hooks/nebu-ctx-rewrite.sh" \
    "$CLAUDE_DIR/hooks/nebu-ctx-rewrite.sh.nebu-ctx.bak" \
    "$CLAUDE_DIR/rules/nebu-ctx.md" \
    "$CLAUDE_DIR/rules/nebu-skills.md"
}

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

# Write the Claude rule file when a Claude home already exists.
write_claude_rules_file() {
  cat > "$CLAUDE_RULES_FILE" <<'EOF'
# ASK Skills

- Prefer workflow skills under `~/.claude/skills/` when the user's request clearly matches one of them instead of rewriting the workflow inline.
- Treat `develop` as the default execution baseline for normal software work and combine it with a more specific skill when needed.
- After code edits, bias toward `ask-code-review` before `ask-verification` when the user is moving toward done, ready, finished, handoff, or klaar wording.
- If review, verification, or wrap-up exposes a reusable workflow gap, capture it with `write-skill` before ending cold.
- When editing code, add concise intent comments by default; place one short comment above each function unless the repo's local convention says otherwise.
EOF
}

# Append the always-on dsh routing guidance to $DSH_HOME/AGENTS.md exactly once.
# The section is marker-delimited and only written when the marker is absent,
# so existing user instruction content is never rewritten or clobbered.
write_dsh_agents_section() {
  local section=""
  section="$(cat <<'EOF'

<!-- agent-skills-kit:dsh -->
## Agent Skills Kit (dsh)

- Prefer the workflow skills in this kit when the user's request clearly matches one of them: load the skill via the `skill` tool using the exact name from the available-skills catalog before doing the work, then follow its instructions.
- Treat `develop` as the default execution baseline for normal software work and combine it with a more specific skill when needed.
- After meaningful, subtle, or risky code changes, load `code-review` before moving on. Skip review for trivial edits where the change is obvious and low-risk.
- If review or verification exposes a reusable workflow gap, capture it with `write-skill` before ending cold.
- When editing code, add concise intent comments by default; place one short comment above each function unless the repo's local convention says otherwise.
<!-- /agent-skills-kit:dsh -->
EOF
)"

  if [ -f "$DSH_AGENTS_FILE" ] && grep -qF "$DSH_SECTION_MARKER" "$DSH_AGENTS_FILE"; then
    return 0
  fi

  mkdir -p "$DSH_HOME"

  if [ -f "$DSH_AGENTS_FILE" ] && [ -s "$DSH_AGENTS_FILE" ] && [ -n "$(tail -c 1 "$DSH_AGENTS_FILE")" ]; then
    printf '\n' >> "$DSH_AGENTS_FILE"
  fi

  printf '%s\n' "$section" >> "$DSH_AGENTS_FILE"
}

# Sync the generated dsh skill variant into the user-global dsh skill root.
sync_dsh_skills() {
  local installed_count=0
  local skill_dir=""
  local skill_name=""

  mkdir -p "$DSH_SKILLS_TARGET"
  remove_legacy_skill_installs "$DSH_SKILLS_TARGET"
  remove_stale_skill_installs "$DSH_SKILLS_TARGET"
  remove_missing_managed_skills "$DSH_SKILLS_TARGET" "$DSH_SKILLS_TARGET/$MANAGED_SKILLS_MANIFEST" "$CURRENT_MANAGED_SKILLS"

  for skill_dir in "$DSH_SKILLS_SOURCE"/*; do
    [ -d "$skill_dir" ] || continue
    skill_name="$(basename "$skill_dir")"
    rm -rf "$DSH_SKILLS_TARGET/$skill_name"
    cp -R "$skill_dir" "$DSH_SKILLS_TARGET/$skill_name"
    installed_count=$((installed_count + 1))
  done

  cp "$CURRENT_MANAGED_SKILLS" "$DSH_SKILLS_TARGET/$MANAGED_SKILLS_MANIFEST"
  printf '%s\n' "$installed_count"
}

# Remove managed skills from one former install root without touching unrelated user content.
clean_old_skill_root() {
  local target_dir="$1"
  local skill_name=""

  [ -d "$target_dir" ] || return 0
  [ ! -L "$target_dir" ] || return 0

  remove_legacy_skill_installs "$target_dir"
  remove_stale_skill_installs "$target_dir"
  remove_missing_managed_skills "$target_dir" "$target_dir/$MANAGED_SKILLS_MANIFEST" "$CURRENT_MANAGED_SKILLS"

  while IFS= read -r skill_name; do
    [ -n "$skill_name" ] || continue
    rm -rf "$target_dir/$skill_name"
  done < "$CURRENT_MANAGED_SKILLS"

  rm -f "$target_dir/$MANAGED_SKILLS_MANIFEST"
  rmdir "$target_dir" >/dev/null 2>&1 || true
}

# Sync the canonical managed skills into the shared ~/.agents skill root.
sync_shared_skills() {
  local installed_count=0
  local skill_dir=""
  local skill_name=""

  mkdir -p "$SHARED_SKILLS_TARGET"
  remove_legacy_skill_installs "$SHARED_SKILLS_TARGET"
  remove_stale_skill_installs "$SHARED_SKILLS_TARGET"
  remove_missing_managed_skills "$SHARED_SKILLS_TARGET" "$SHARED_SKILLS_TARGET/$MANAGED_SKILLS_MANIFEST" "$CURRENT_MANAGED_SKILLS"

  for skill_dir in "$SHARED_SKILLS_SOURCE"/*; do
    [ -d "$skill_dir" ] || continue
    skill_name="$(basename "$skill_dir")"
    rm -rf "$SHARED_SKILLS_TARGET/$skill_name"
    cp -R "$skill_dir" "$SHARED_SKILLS_TARGET/$skill_name"
    installed_count=$((installed_count + 1))
  done

  cp "$CURRENT_MANAGED_SKILLS" "$SHARED_SKILLS_TARGET/$MANAGED_SKILLS_MANIFEST"
  printf '%s\n' "$installed_count"
}

# Replace one directory path with a symlink to the shared skill root.
ensure_directory_symlink() {
  local link_path="$1"
  local target_path="$2"

  if [ -L "$link_path" ] && [ "$(readlink "$link_path")" = "$target_path" ]; then
    return 0
  fi

  rm -rf "$link_path"
  ln -s "$target_path" "$link_path"
}

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to export Copilot assets before install." >&2
  exit 1
fi

acquire_generated_assets_lock "$REPO_ROOT"
GENERATED_ASSETS_LOCK_HELD=1

node "$SCRIPT_DIR/export-platform-skills.js"

[ -d "$SHARED_SKILLS_SOURCE" ] || {
  echo "Shared skills source directory not found: $SHARED_SKILLS_SOURCE" >&2
  exit 1
}

[ -f "$COPILOT_INSTRUCTIONS_SOURCE" ] || {
  echo "Copilot instructions source file not found: $COPILOT_INSTRUCTIONS_SOURCE" >&2
  exit 1
}

[ -d "$OPENCODE_CORE_SOURCE" ] || {
  echo "OpenCode core source directory not found: $OPENCODE_CORE_SOURCE" >&2
  exit 1
}

[ -d "$OPENCODE_PLUGINS_SOURCE" ] || {
  echo "OpenCode plugins source directory not found: $OPENCODE_PLUGINS_SOURCE" >&2
  exit 1
}

[ -f "$OPENCODE_RULES_SOURCE/coding-standards.md" ] || {
  echo "OpenCode rules source file not found: $OPENCODE_RULES_SOURCE/coding-standards.md" >&2
  exit 1
}

CURRENT_MANAGED_SKILLS="$(mktemp)"
write_current_skill_manifest "$SHARED_SKILLS_SOURCE" "$CURRENT_MANAGED_SKILLS"

remove_legacy_install_artifacts
installed_count="$(sync_shared_skills)"

clean_old_skill_root "$COPILOT_SKILLS_TARGET"
clean_old_skill_root "$OPENCODE_SKILLS_TARGET"
clean_old_skill_root "$CLAUDE_SKILLS_TARGET"

# Symlink managed ask skills into opencode skills dir so native Agent Skills
# discovers them globally without clobbering existing non-ask skills.
mkdir -p "$OPENCODE_SKILLS_TARGET"
for skill_dir in "$SHARED_SKILLS_TARGET"/*/; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  link_path="$OPENCODE_SKILLS_TARGET/$skill_name"
  target_path="$skill_dir"
  if [ -L "$link_path" ] && [ "$(readlink "$link_path")" = "$target_path" ]; then
    continue
  fi
  rm -rf "$link_path"
  ln -s "$target_path" "$link_path"
done

mkdir -p "$COPILOT_INSTRUCTIONS_TARGET"
cp "$COPILOT_INSTRUCTIONS_SOURCE" "$COPILOT_INSTRUCTIONS_FILE"

# Install OpenCode commands (global) and Copilot/VS Code prompt files (user profile).
if [ -d "$OPENCODE_COMMANDS_SOURCE" ]; then
  mkdir -p "$OPENCODE_COMMANDS_TARGET"
  cp -R "$OPENCODE_COMMANDS_SOURCE"/. "$OPENCODE_COMMANDS_TARGET/"
fi
if [ -d "$COPILOT_PROMPTS_SOURCE" ]; then
  mkdir -p "$COPILOT_PROMPTS_TARGET"
  cp -R "$COPILOT_PROMPTS_SOURCE"/. "$COPILOT_PROMPTS_TARGET/"
fi

mkdir -p "$OPENCODE_PLUGINS_TARGET"
rm -rf "$OPENCODE_CORE_TARGET"
rm -rf "$OPENCODE_PLUGINS_TARGET/core"
cp -R "$OPENCODE_CORE_SOURCE" "$OPENCODE_PLUGINS_TARGET/core"
cp "$OPENCODE_PLUGINS_SOURCE/agent-skills-router.mjs" "$OPENCODE_PLUGINS_TARGET/agent-skills-router.mjs"

# Install rules for OpenCode.
mkdir -p "$OPENCODE_RULES_TARGET"
for rule in coding-standards.md agent-skills-kit.md; do
  rm -f "$OPENCODE_RULES_TARGET/$rule"
  if [ -f "$OPENCODE_RULES_SOURCE/$rule" ]; then
    cp "$OPENCODE_RULES_SOURCE/$rule" "$OPENCODE_RULES_TARGET/$rule"
  fi
done
OPENCODE_JSON="$OPENCODE_DIR/opencode.json"
if [ -f "$OPENCODE_JSON" ]; then
  node -e "
    var fs=require('fs'), f='$OPENCODE_JSON';
    var c=JSON.parse(fs.readFileSync(f,'utf-8'));
    c.instructions=c.instructions||[];
    var rules=['./rules/coding-standards.md','./rules/agent-skills-kit.md'];
    for(var i=0;i<rules.length;i++){if(!c.instructions.includes(rules[i])){c.instructions.push(rules[i]);}}
    c.plugin=c.plugin||[];
    var p='./plugins/agent-skills-router.mjs';
    if(!c.plugin.includes(p)){c.plugin.push(p);}
    c.permission=c.permission||{};
    c.permission.external_directory=c.permission.external_directory||{};
    var ocPath=require('path').resolve(require('os').homedir(),'.config','opencode')+'/**';
    if(c.permission.external_directory[ocPath]!=='allow'){c.permission.external_directory[ocPath]='allow';}
    fs.writeFileSync(f,JSON.stringify(c,null,2)+'\n');
  "
fi

if [ -d "$CLAUDE_DIR" ]; then
  mkdir -p "$CLAUDE_RULES_TARGET"
  write_claude_rules_file
  cp "$OPENCODE_RULES_SOURCE/coding-standards.md" "$CLAUDE_RULES_TARGET/coding-standards.md"
  ensure_directory_symlink "$CLAUDE_SKILLS_TARGET" "$SHARED_SKILLS_TARGET"
fi

# Install the dsh-optimized skill variant and routing guidance when dsh is
# present (a reachable `dsh` binary or an existing dsh home). The generated
# variant shadows the canonical shared copy for dsh because the user root
# (~/.dsh/skills) outranks the shared agents root (~/.agents/skills).
if command -v dsh >/dev/null 2>&1 || [ -d "$DSH_HOME" ]; then
  [ -d "$DSH_SKILLS_SOURCE" ] || {
    echo "DSH skills source directory not found: $DSH_SKILLS_SOURCE" >&2
    exit 1
  }

  dsh_installed_count="$(sync_dsh_skills)"
  write_dsh_agents_section
  write_install_metadata "$REPO_ROOT" "dsh" "$DSH_HOME" "$DSH_METADATA_FILE"
else
  echo "Skipped dsh install because dsh is not on PATH and $DSH_HOME does not exist."
  dsh_installed_count=""
fi

mkdir -p "$AGENTS_DIR"
write_install_metadata "$REPO_ROOT" "shared-agents" "$AGENTS_DIR" "$INSTALL_METADATA_FILE"

echo "Installed ${installed_count} agent-skills-kit to $SHARED_SKILLS_TARGET"
echo "Installed Copilot instructions to $COPILOT_INSTRUCTIONS_FILE"
echo "Installed OpenCode commands to $OPENCODE_COMMANDS_TARGET"
echo "Installed Copilot/VS Code prompt files to $COPILOT_PROMPTS_TARGET"
echo "Installed OpenCode router core to $OPENCODE_PLUGINS_TARGET/core"
echo "Installed OpenCode router plugin to $OPENCODE_PLUGINS_TARGET/agent-skills-router.mjs"
echo "Installed OpenCode rules to $OPENCODE_RULES_TARGET/coding-standards.md"
echo "Installed OpenCode agent-skills-kit usage guide to $OPENCODE_RULES_TARGET/agent-skills-kit.md"
if [ -d "$CLAUDE_DIR" ]; then
  echo "Installed Claude Code rules to $CLAUDE_RULES_FILE"
  echo "Linked Claude skills at $CLAUDE_SKILLS_TARGET -> $SHARED_SKILLS_TARGET"
else
  echo "Skipped Claude linking because $CLAUDE_DIR does not exist."
fi
if [ -n "$dsh_installed_count" ]; then
  echo "Installed ${dsh_installed_count} dsh skills to $DSH_SKILLS_TARGET"
  echo "Added dsh routing guidance to $DSH_AGENTS_FILE"
  echo "Wrote dsh install metadata to $DSH_METADATA_FILE"
fi
echo "Wrote install metadata to $INSTALL_METADATA_FILE"
echo "Removed previous managed skill copies from editor-specific skill roots when present."
echo "Restart VS Code / OpenCode / Claude Code / dsh if the new files are not picked up immediately."