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
DSH_PRESET_ID="ask-kit"
DSH_PRESET_TARGET="$DSH_HOME/.agent-presets/$DSH_PRESET_ID"
DSH_PRESET_ROW_ID="ask-kit-router"
DSH_ROUTER_SOURCE="$REPO_ROOT/plugins/agent-skills-router.dsh.mjs"
DSH_ROUTER_CORE_SOURCE="$REPO_ROOT/core/router-core.js"
DSH_PANEL_SOURCE="$REPO_ROOT/plugins/dsh-panel-widget"
DSH_CLIENT_PLUGINS_TARGET="$DSH_HOME/client-plugins"
DSH_PANEL_TARGET="$DSH_CLIENT_PLUGINS_TARGET/ask-kit-panel"
DSH_PANEL_PACKAGE="ask-kit-panel"
DSH_PATCH_ROW_ID="$DSH_PANEL_PACKAGE"
DSH_PROFILES_NODE_MODULES="$DSH_HOME/profiles/node_modules"
DSH_WEB_PATCH_FILE="$DSH_HOME/profiles/web/cordis.patch.yml"
DSH_PATCH_MARKER="# ── agent-skills-kit: ask-kit panel widget (managed) ──"
INSTALL_METADATA_FILE="$AGENTS_DIR/.agent-skills-kit-install.txt"
MANAGED_SKILLS_MANIFEST=".ask-managed-skills.txt"
MANAGED_COMMANDS_MANIFEST=".ask-managed-commands.txt"
MANAGED_PROMPTS_MANIFEST=".ask-managed-prompts.txt"
DSH_SECTION_MARKER="<!-- agent-skills-kit:dsh -->"
CURRENT_MANAGED_SKILLS=""
CURRENT_MANAGED_COMMANDS=""
CURRENT_MANAGED_PROMPTS=""
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
    "$OPENCODE_DIR/plugins/nebu-skills-router.mjs" \
    "$OPENCODE_DIR/rules/nebu-ctx.md" \
    "$OPENCODE_DIR/rules/nebu-skills.md" \
    "$OPENCODE_DIR/plugins/rules/nebu-skills.md" \
    "$OPENCODE_DIR/.nebu-skills-install.txt" \
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

  if [ -n "$CURRENT_MANAGED_COMMANDS" ] && [ -f "$CURRENT_MANAGED_COMMANDS" ]; then
    rm -f "$CURRENT_MANAGED_COMMANDS"
  fi

  if [ -n "$CURRENT_MANAGED_PROMPTS" ] && [ -f "$CURRENT_MANAGED_PROMPTS" ]; then
    rm -f "$CURRENT_MANAGED_PROMPTS"
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

# Locate an optional dsh preset source without depending on one package layout.
find_dsh_standard_preset() {
  local dsh_bin="" pkg_root="" candidate=""

  if command -v dsh >/dev/null 2>&1; then
    # BSD readlink has no -f; an empty result just skips the walk-up branch.
    dsh_bin="$(readlink -f "$(command -v dsh)" 2>/dev/null || true)"
    if [ -n "$dsh_bin" ]; then
      pkg_root="$(dirname "$dsh_bin")"
      while [ "$pkg_root" != "/" ]; do
        if [ -f "$pkg_root/package.json" ]; then break; fi
        pkg_root="$(dirname "$pkg_root")"
      done
      candidate="$pkg_root/config/agent-presets/standard"
      if [ -f "$candidate/agent.cordis.yml" ]; then
        printf '%s\n' "$candidate"
        return 0
      fi
    fi
  fi

  if command -v npm >/dev/null 2>&1; then
    candidate="$(npm root -g)/@deepseek-ai/dsh/config/agent-presets/standard"
    if [ -f "$candidate/agent.cordis.yml" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  fi

  return 1
}

# Install (or refresh the managed parts of) the ask-kit agent preset. The
# composition is copied once from the deployed standard preset; the kit's own
# preset metadata replaces the copied one on first install only, so user edits
# survive. Only this kit's plugin file and vendored core are rewritten on every
# install. Echoes "new", "refresh", or "skipped"; unexpected failures exit the
# installer via set -e.
install_dsh_preset() {
  local standard_dir="" state="refresh"

  if [ ! -f "$DSH_PRESET_TARGET/agent.cordis.yml" ]; then
    state="new"
    if ! standard_dir="$(find_dsh_standard_preset)"; then
      # Recent dsh packages no longer ship a copyable standard preset. The kit
      # row only needs a valid composition file, so bootstrap the minimal one.
      standard_dir=""
      mkdir -p "$DSH_PRESET_TARGET"
      : > "$DSH_PRESET_TARGET/agent.cordis.yml"
    else
      mkdir -p "$DSH_PRESET_TARGET"
      cp -R "$standard_dir/." "$DSH_PRESET_TARGET/"
    fi
  fi

  mkdir -p "$DSH_PRESET_TARGET/plugins" "$DSH_PRESET_TARGET/vendor"
  cp "$DSH_ROUTER_SOURCE" "$DSH_PRESET_TARGET/plugins/ask-kit-router.mjs"
  cp "$DSH_ROUTER_CORE_SOURCE" "$DSH_PRESET_TARGET/vendor/router-core.js"

  # Write the preset metadata on first install, and migrate it on refresh only
  # when the description is still the pre-English managed default, so a
  # user-edited description always survives. The Dutch string below is the
  # historical stale default, kept verbatim as the migration trigger.
  if [ "$state" = "new" ] || { [ -f "$DSH_PRESET_TARGET/preset.yml" ] \
      && grep -qxF "description: Standaard codeer-agent met de ASK-beslisboom in elke prompt, skill/review-state tracking en optionele tool-gating tot een skill is geladen." "$DSH_PRESET_TARGET/preset.yml"; }; then
    cat > "$DSH_PRESET_TARGET/preset.yml" <<'EOF'
name: Agent Skills Kit
description: Standard coding agent with the ASK decision tree in every prompt, skill/review state tracking, and optional tool gating until a skill is loaded.
EOF
  fi

  if ! grep -qF -- "- id: $DSH_PRESET_ROW_ID" "$DSH_PRESET_TARGET/agent.cordis.yml"; then
    cat >> "$DSH_PRESET_TARGET/agent.cordis.yml" <<EOF

# ── agent-skills-kit ──────────────────────────────────────────────────────

# Router row: injects the decision-tree section every model step, tracks
# per-session skill/review state, and optionally gates tools until a skill
# loads. Managed by agent-skills-kit install; set blockUntilSkillLoaded to
# true for OpenCode-parity gating.
- id: $DSH_PRESET_ROW_ID
  name: ./plugins/ask-kit-router.mjs
  config:
    blockUntilSkillLoaded: false
EOF
  fi

  printf '%s\n' "$state"
}

# Install (or refresh) the dual-face panel widget package into the dsh client
# plugin root. The copy is unconditional so reinstalls always refresh managed
# files; output is identical on every run.
# Install (or refresh) the dual-face panel widget package into the dsh client
# plugin root. The copy is unconditional so reinstalls always refresh managed
# files; output is identical on every run. Returns non-zero when the source
# package is absent so roster-row management can be skipped.
install_dsh_panel_widget() {
  if [ ! -f "$DSH_PANEL_SOURCE/package.json" ]; then
    echo "Skipped dsh panel widget: source package not found at $DSH_PANEL_SOURCE." >&2
    return 1
  fi
  mkdir -p "$DSH_PANEL_TARGET"
  for file_name in package.json index.mjs client.js README.md; do
    [ -f "$DSH_PANEL_SOURCE/$file_name" ] || continue
    cp "$DSH_PANEL_SOURCE/$file_name" "$DSH_PANEL_TARGET/$file_name"
  done
  link_dsh_panel_bundle
  printf 'Installed dsh panel widget package to %s\n' "$DSH_PANEL_TARGET"
}

# Link the installed panel package into the dsh profile's hoisted module root so
# its bare package name resolves for both the node loader (ESM import of the
# package's index.mjs) and the client-module registry (require.resolve of its
# package.json). A pre-existing unrelated file or directory is never removed.
link_dsh_panel_bundle() {
  mkdir -p "$DSH_PROFILES_NODE_MODULES"
  local link_path="$DSH_PROFILES_NODE_MODULES/$DSH_PANEL_PACKAGE"
  if [ -L "$link_path" ]; then
    [ "$(readlink "$link_path")" = "$DSH_PANEL_TARGET" ] && return 0
    rm -f "$link_path"
  elif [ -e "$link_path" ]; then
    echo "Skipped dsh panel bundle link: unrelated path exists at $link_path" >&2
    return 0
  fi
  ln -s "$DSH_PANEL_TARGET" "$link_path"
  printf 'Linked dsh panel bundle %s -> %s\n' "$DSH_PANEL_PACKAGE" "$DSH_PANEL_TARGET"
}

# Idempotently manage the ask-kit-panel roster entry in the web profile patch
# layer under marker comments. Existing user content is never rewritten: a
# row that already carries our id is left alone; an empty `[]` placeholder is
# swapped for the managed section; anything else gets the section appended.
manage_web_patch_row() {
  [ -f "$DSH_WEB_PATCH_FILE" ] || {
    echo "Skipped panel roster row: web profile patch file not found at $DSH_WEB_PATCH_FILE." >&2
    return 0
  }
  # Already managed: report the same outcome a fresh insert would, so repeated
  # installs produce identical output.
  if ! grep -qF -- "- id: $DSH_PATCH_ROW_ID" "$DSH_WEB_PATCH_FILE"; then
    local managed_block=""
    managed_block="$DSH_PATCH_MARKER
- insert:
    - id: $DSH_PATCH_ROW_ID
      name: '$DSH_PANEL_PACKAGE'"

    # Only a file whose sole entry is the empty `[]` placeholder is rewritten
    # in place (header comments kept); any other content gets the managed
    # section appended after a blank separator, never spliced mid-file.
    local entry_lines="" placeholder_lines="" tmp_file=""
    entry_lines="$(grep -c '^[[:space:]]*[^[:space:]#]' "$DSH_WEB_PATCH_FILE" || true)"
    placeholder_lines="$(grep -c '^[[:space:]]*\[\][[:space:]]*$' "$DSH_WEB_PATCH_FILE" || true)"
    tmp_file="$(mktemp)"
    if [ "$entry_lines" -eq 1 ] && [ "$placeholder_lines" -eq 1 ]; then
      { grep '^[[:space:]]*#' "$DSH_WEB_PATCH_FILE" || true; printf '%s\n' "$managed_block"; } > "$tmp_file"
      chmod --reference="$DSH_WEB_PATCH_FILE" "$tmp_file" 2>/dev/null || true
      mv "$tmp_file" "$DSH_WEB_PATCH_FILE"
    else
      rm -f "$tmp_file"
      { printf '\n'; printf '%s\n' "$managed_block"; } >> "$DSH_WEB_PATCH_FILE"
    fi
  fi
  printf 'Managed ask-kit-panel roster row in %s\n' "$DSH_WEB_PATCH_FILE"
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
# Both targets are managed-by-manifest so commands retired from the pack disappear
# on reinstall instead of surviving forever as ghost slash-commands.
if [ -d "$OPENCODE_COMMANDS_SOURCE" ]; then
  mkdir -p "$OPENCODE_COMMANDS_TARGET"
  CURRENT_MANAGED_COMMANDS="$(mktemp)"
  write_current_file_manifest "$OPENCODE_COMMANDS_SOURCE" "$CURRENT_MANAGED_COMMANDS"
  remove_missing_managed_files "$OPENCODE_COMMANDS_TARGET" "$OPENCODE_COMMANDS_TARGET/$MANAGED_COMMANDS_MANIFEST" "$CURRENT_MANAGED_COMMANDS"
  cp -R "$OPENCODE_COMMANDS_SOURCE"/. "$OPENCODE_COMMANDS_TARGET/"
  cp "$CURRENT_MANAGED_COMMANDS" "$OPENCODE_COMMANDS_TARGET/$MANAGED_COMMANDS_MANIFEST"
fi
if [ -d "$COPILOT_PROMPTS_SOURCE" ]; then
  mkdir -p "$COPILOT_PROMPTS_TARGET"
  CURRENT_MANAGED_PROMPTS="$(mktemp)"
  write_current_file_manifest "$COPILOT_PROMPTS_SOURCE" "$CURRENT_MANAGED_PROMPTS"
  remove_missing_managed_files "$COPILOT_PROMPTS_TARGET" "$COPILOT_PROMPTS_TARGET/$MANAGED_PROMPTS_MANIFEST" "$CURRENT_MANAGED_PROMPTS"
  cp -R "$COPILOT_PROMPTS_SOURCE"/. "$COPILOT_PROMPTS_TARGET/"
  cp "$CURRENT_MANAGED_PROMPTS" "$COPILOT_PROMPTS_TARGET/$MANAGED_PROMPTS_MANIFEST"
fi

mkdir -p "$OPENCODE_PLUGINS_TARGET"
rm -rf "$OPENCODE_CORE_TARGET"
rm -rf "$OPENCODE_PLUGINS_TARGET/core"
cp -R "$OPENCODE_CORE_SOURCE" "$OPENCODE_PLUGINS_TARGET/core"
cp "$OPENCODE_PLUGINS_SOURCE/agent-skills-router.mjs" "$OPENCODE_PLUGINS_TARGET/agent-skills-router.mjs"
cp "$OPENCODE_PLUGINS_SOURCE/agent-skills-sidebar.tsx" "$OPENCODE_PLUGINS_TARGET/agent-skills-sidebar.tsx"

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

# Register the sidebar TUI plugin in tui.json so OpenCode actually loads it.
# TUI plugins are discovered from the `plugin` array in tui.json (not by
# scanning the plugins dir), so a bare file copy alone would never render.
TUI_JSON="$OPENCODE_DIR/tui.json"
if [ ! -f "$TUI_JSON" ]; then
  printf '{\n  "$schema": "https://opencode.ai/tui.json",\n  "plugin": []\n}\n' > "$TUI_JSON"
fi
node -e "
  var fs=require('fs'), f='$TUI_JSON';
  var c=JSON.parse(fs.readFileSync(f,'utf-8'));
  c.plugin=c.plugin||[];
  var p='./plugins/agent-skills-sidebar.tsx';
  var found=c.plugin.some(function(e){return (typeof e==='string'&&e===p)||(Array.isArray(e)&&e[0]===p);});
  if(!found){c.plugin.push(p);fs.writeFileSync(f,JSON.stringify(c,null,2)+'\n');}
"

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
  dsh_preset_state="$(install_dsh_preset)"
  if install_dsh_panel_widget; then
    manage_web_patch_row
  fi
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
echo "Installed OpenCode sidebar plugin to $OPENCODE_PLUGINS_TARGET/agent-skills-sidebar.tsx"
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
  case "$dsh_preset_state" in
    new) echo "Installed ask-kit dsh agent preset (copy of standard + router row) to $DSH_PRESET_TARGET" ;;
    refresh) echo "Refreshed ask-kit dsh agent preset router files at $DSH_PRESET_TARGET" ;;
    *) echo "Skipped dsh preset install; see warning above." ;;
  esac
  echo "Wrote dsh install metadata to $DSH_METADATA_FILE"
fi
echo "Wrote install metadata to $INSTALL_METADATA_FILE"
echo "Removed previous managed skill copies from editor-specific skill roots when present."
echo "Restart VS Code / OpenCode / Claude Code / dsh if the new files are not picked up immediately."
