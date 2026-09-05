#!/usr/bin/env bash
# Verifies the installers actually deploy the repo's current user-visible
# strings. Runs scripts/install.sh against fully isolated homes (a fake dsh
# package shim on PATH makes the dsh preset path runnable even without a real
# dsh install), then asserts the installed copies of the preset.yml
# description, the router prompt header, and the widget status bar match the
# repo strings. Also seeds the stale pre-English preset description and
# asserts a refresh converges back to the managed English value — the exact
# drift this kit hit when a repo-side suite stayed green while installed
# output was still Dutch. Exits non-zero on any failure.
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"

# Expected user-visible strings, verbatim from the installers / plugin sources.
EXPECTED_PRESET_DESCRIPTION="description: Standard coding agent with the ASK decision tree in every prompt, skill/review state tracking, and optional tool gating until a skill is loaded."
STALE_PRESET_DESCRIPTION="description: Standaard codeer-agent met de ASK-beslisboom in elke prompt, skill/review-state tracking en optionele tool-gating tot een skill is geladen."

# Known-stale managed strings that must never survive in a deployed install.
# Extend this list whenever a user-visible string is replaced in the
# installers or plugin sources; both installers must still carry them as
# migration triggers (asserted below).
STALE_STRINGS=("Standaard codeer-agent")

failures=0

# Record one assertion outcome and keep going so one run reports everything.
check() {
  local label="$1" ok="$2" detail="${3:-}"
  if [ "$ok" = "true" ]; then
    echo "  ok    $label"
  else
    failures=$((failures + 1))
    echo "  FAIL  $label${detail:+ — $detail}" >&2
  fi
}

# Assert `grep -qF` on a file matches the expected outcome ("present"/"absent").
assert_grep() {
  local label="$1" file="$2" needle="$3" expect="${4:-present}"
  local rc=0
  grep -qF -- "$needle" "$file" 2>/dev/null || rc=1
  if { [ "$expect" = "present" ] && [ "$rc" -eq 0 ]; } \
      || { [ "$expect" = "absent" ] && [ "$rc" -ne 0 ]; }; then
    check "$label" true
  else
    check "$label" false
  fi
}

# Build the isolated sandbox: per-platform homes plus a fake dsh package shim
# so install_dsh_preset finds a "deployed standard preset" without real dsh.
make_sandbox() {
  SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/ask-install-check.XXXXXX")"
  mkdir -p \
    "$SANDBOX/home" \
    "$SANDBOX/dsh-pkg/bin" \
    "$SANDBOX/dsh-pkg/config/agent-presets/standard"
  printf '{}\n' > "$SANDBOX/dsh-pkg/package.json"
  printf '#!/usr/bin/env sh\nexit 0\n' > "$SANDBOX/dsh-pkg/bin/dsh"
  chmod +x "$SANDBOX/dsh-pkg/bin/dsh"
  cat > "$SANDBOX/dsh-pkg/config/agent-presets/standard/agent.cordis.yml" <<'EOF'
# Minimal standard preset so the installer's preset composition runs in tests.
EOF

  HOME_DIR="$SANDBOX/home"
  DSH_HOME="$SANDBOX/dsh"
  AGENTS_DIR="$SANDBOX/agents"
  COPILOT_DIR="$SANDBOX/copilot"
  OPENCODE_DIR="$SANDBOX/opencode"
  CLAUDE_DIR="$SANDBOX/claude"
}

# Run the unified installer once with fully isolated homes; returns non-zero
# when the installer itself fails (the run log is left for the caller).
run_installer() {
  local log="$1"
  env \
    HOME="$HOME_DIR" \
    DSH_HOME="$DSH_HOME" \
    AGENTS_DIR="$AGENTS_DIR" \
    COPILOT_DIR="$COPILOT_DIR" \
    OPENCODE_DIR="$OPENCODE_DIR" \
    CLAUDE_DIR="$CLAUDE_DIR" \
    PATH="$SANDBOX/dsh-pkg/bin:$PATH" \
    bash "$REPO_ROOT/scripts/install.sh" >"$log" 2>&1
}

# Assert every installed user-visible surface matches the repo strings.
assert_installed_strings() {
  assert_grep "preset.yml ships the English description" \
    "$DSH_HOME/.agent-presets/ask-kit/preset.yml" "$EXPECTED_PRESET_DESCRIPTION" present
  assert_grep "preset.yml has no stale Dutch description" \
    "$DSH_HOME/.agent-presets/ask-kit/preset.yml" "$STALE_PRESET_DESCRIPTION" absent
  assert_grep "installed router row appends the English prompt header" \
    "$DSH_HOME/.agent-presets/ask-kit/plugins/ask-kit-router.mjs" "--- Agent Skills Kit ---" present
  assert_grep "installed router row carries the decision-tree header line" \
    "$DSH_HOME/.agent-presets/ask-kit/plugins/ask-kit-router.mjs" "╌ Agent Skills Kit ╌" present
  assert_grep "vendored router-core carries the English decision-tree line" \
    "$DSH_HOME/.agent-presets/ask-kit/vendor/router-core.js" "Decision tree — load a different skill" present
  assert_grep "installed widget shows the English status badge" \
    "$DSH_HOME/client-plugins/ask-kit-panel/client.js" "╌ Agent Skills Kit ╌" present
  assert_grep "installed widget shows the English no-skill chip" \
    "$DSH_HOME/client-plugins/ask-kit-panel/client.js" "no skill loaded" present
  assert_grep "installed widget shows the English review nudge" \
    "$DSH_HOME/client-plugins/ask-kit-panel/client.js" "⚠ code-review needed" present
  assert_grep "installed widget shows the English improvement nudge" \
    "$DSH_HOME/client-plugins/ask-kit-panel/client.js" "✓ capture improvement?" present
  assert_grep "installed opencode core carries the English header" \
    "$OPENCODE_DIR/plugins/core/router-core.js" "╌ Agent Skills Kit ╌" present
  assert_grep "installed opencode sidebar plugin registers the sidebar slot" \
    "$OPENCODE_DIR/plugins/agent-skills-sidebar.tsx" "sidebar_content" present
  assert_grep "installed opencode sidebar plugin shows the English title" \
    "$OPENCODE_DIR/plugins/agent-skills-sidebar.tsx" "Agent Skills Kit" present
  assert_grep "installed opencode sidebar distinguishes observed loads" \
    "$OPENCODE_DIR/plugins/agent-skills-sidebar.tsx" "Last loaded" present
  assert_grep "installed opencode sidebar shows an English review reminder" \
    "$OPENCODE_DIR/plugins/agent-skills-sidebar.tsx" "! code-review needed" present
  assert_grep "installed opencode sidebar drops the default-only profile" \
    "$OPENCODE_DIR/plugins/agent-skills-sidebar.tsx" "Execution Profile" absent
  assert_grep "installed opencode tui.json registers the sidebar plugin" \
    "$OPENCODE_DIR/tui.json" "agent-skills-sidebar.tsx" present
  if node --input-type=module -e '
    import { pathToFileURL } from "node:url";
    const plugin = await import(pathToFileURL(process.argv[1]));
    await plugin.AgentSkillsRouter();
  ' "$OPENCODE_DIR/plugins/agent-skills-router.mjs"; then
    check "installed opencode router resolves its deployed core" true
  else
    check "installed opencode router resolves its deployed core" false
  fi
}

# Sweep the installed roots for known-stale managed strings.
assert_no_stale_strings() {
  local stale dir
  for stale in "${STALE_STRINGS[@]}"; do
    local found="false"
    for dir in "$DSH_HOME" "$AGENTS_DIR" "$OPENCODE_DIR" "$COPILOT_DIR"; do
      if [ -d "$dir" ] && grep -rqF -- "$stale" "$dir" 2>/dev/null; then
        found="true"
        break
      fi
    done
    if [ "$found" = "true" ]; then
      check "no stale string deployed: $stale" false
    else
      check "no stale string deployed: $stale" true
    fi
  done
}

main() {
  command -v node >/dev/null 2>&1 || {
    echo "node is required to run the installer check." >&2
    exit 1
  }

  make_sandbox
  trap 'rm -rf "$SANDBOX"' EXIT

  echo "Installing into isolated homes (sandbox: $SANDBOX)…"

  if run_installer "$SANDBOX/install-run-1.log"; then
    check "installer succeeds in an isolated home" true
  else
    check "installer succeeds in an isolated home" false "$(tail -5 "$SANDBOX/install-run-1.log" | tr '\n' ' ')"
  fi

  assert_installed_strings
  assert_no_stale_strings

  # Migration path: seed the stale pre-English preset description exactly as
  # an existing old install would carry it, then refresh and expect the
  # managed English value to win — the drift this kit actually hit.
  local preset="$DSH_HOME/.agent-presets/ask-kit/preset.yml"
  if [ -f "$preset" ]; then
    printf 'name: Agent Skills Kit\n%s\n' "$STALE_PRESET_DESCRIPTION" > "$preset"
    if run_installer "$SANDBOX/install-run-2.log"; then
      check "installer refresh succeeds over a stale install" true
    else
      check "installer refresh succeeds over a stale install" false "$(tail -5 "$SANDBOX/install-run-2.log" | tr '\n' ' ')"
    fi
    assert_grep "refresh migrates stale preset description to English" \
      "$preset" "$EXPECTED_PRESET_DESCRIPTION" present
    assert_grep "refresh removes the stale Dutch description" \
      "$preset" "$STALE_PRESET_DESCRIPTION" absent
  else
    check "preset.yml exists for the migration test" false "preset was not installed"
  fi

  # Both installers must still recognize the stale string as a migration
  # trigger, so future refreshes keep converging (static check; ps1 needs no
  # PowerShell runner).
  assert_grep "install.sh still migrates the stale preset description" \
    "$REPO_ROOT/scripts/install.sh" "$STALE_PRESET_DESCRIPTION" present
  assert_grep "install.ps1 still migrates the stale preset description" \
    "$REPO_ROOT/scripts/install.ps1" "$STALE_PRESET_DESCRIPTION" present

  assert_no_stale_strings

  echo
  if [ "$failures" -eq 0 ]; then
    echo "All installed-artifact checks passed."
  else
    echo "$failures installed-artifact check(s) failed." >&2
    exit 1
  fi
}

main "$@"
