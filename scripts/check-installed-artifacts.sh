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

# Assert a managed JSON entry appears exactly once after installer normalization.
assert_count() {
  local label="$1" file="$2" needle="$3" expected="$4" actual
  actual="$(grep -cF -- "$needle" "$file" 2>/dev/null || true)"
  check "$label" "$([ "$actual" -eq "$expected" ] && printf true || printf false)" "expected $expected, got $actual"
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
  CODEX_HOME="$SANDBOX/codex"
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
    CODEX_HOME="$CODEX_HOME" \
    COPILOT_DIR="$COPILOT_DIR" \
    OPENCODE_DIR="$OPENCODE_DIR" \
    CLAUDE_DIR="$CLAUDE_DIR" \
    PATH="$SANDBOX/dsh-pkg/bin:$PATH" \
    bash "$REPO_ROOT/scripts/install.sh" >"$log" 2>&1
}

# Run the PowerShell installer against the same isolated layout for parity.
run_powershell_installer() {
  local log="$1"
  pwsh -NoLogo -NoProfile -File "$REPO_ROOT/scripts/install.ps1" \
    -AgentsDir "$AGENTS_DIR" \
    -CodexHome "$CODEX_HOME" \
    -CopilotDir "$COPILOT_DIR" \
    -OpencodeDir "$OPENCODE_DIR" \
    -ClaudeDir "$CLAUDE_DIR" \
    -DshHome "$DSH_HOME" >"$log" 2>&1
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
  assert_grep "installed widget shows the ASK status title" \
    "$DSH_HOME/client-plugins/ask-kit-panel/client.js" "Agent Skills Kit" present
  assert_grep "installed widget shows active skill hierarchy" \
    "$DSH_HOME/client-plugins/ask-kit-panel/client.js" "ACTIVE SKILL" present
  assert_grep "installed widget shows pending review hierarchy" \
    "$DSH_HOME/client-plugins/ask-kit-panel/client.js" "PENDING" present
  assert_grep "installed widget drops fabricated confidence" \
    "$DSH_HOME/client-plugins/ask-kit-panel/client.js" "CONFIDENCE" absent
  assert_grep "installed widget shows active skills hierarchy" \
    "$DSH_HOME/client-plugins/ask-kit-panel/client.js" "ACTIVE SKILLS" present
  assert_grep "installed OpenCode router package exposes a TUI entrypoint" \
    "$OPENCODE_DIR/plugins/agent-skills-router/package.json" '"./tui": "./tui.tsx"' present
  assert_grep "installed OpenCode TUI panel shows the ASK title" \
    "$OPENCODE_DIR/plugins/agent-skills-router/tui.tsx" "Agent Skills Kit" present
  assert_grep "installed OpenCode TUI panel uses sidebar content" \
    "$OPENCODE_DIR/plugins/agent-skills-router/tui.tsx" "sidebar_content" present
  assert_grep "installed OpenCode TUI panel hides pending prompt actions" \
    "$OPENCODE_DIR/plugins/agent-skills-router/tui.tsx" "props.item.action" absent
  assert_grep "installer configures the OpenCode router package" \
    "$OPENCODE_DIR/opencode.json" "./plugins/agent-skills-router" present
  assert_grep "installer writes managed OpenCode workflow guidance" \
    "$OPENCODE_DIR/AGENTS.md" "agent-skills-kit:opencode" present
  assert_grep "installed OpenCode workflow guidance uses shared source" \
    "$OPENCODE_DIR/AGENTS.md" "# ASK Workflow Mandate" present
  assert_grep "installer registers shared workflow mandate" \
    "$OPENCODE_DIR/opencode.json" "./rules/workflow.md" present
  assert_grep "installer copies shared workflow mandate" \
    "$OPENCODE_DIR/rules/workflow.md" "Never declare merge, release, or tag readiness" present
  assert_grep "installer removes old OpenCode router file configuration" \
    "$OPENCODE_DIR/opencode.json" "./plugins/agent-skills-router.mjs" absent
  assert_grep "installer registers the OpenCode TUI sidebar entry" \
    "$OPENCODE_DIR/tui.json" "./plugins/agent-skills-router/tui.tsx" present
  assert_count "installer registers one OpenCode TUI sidebar entry" \
    "$OPENCODE_DIR/tui.json" "./plugins/agent-skills-router/tui.tsx" 1
  assert_grep "installer retires the legacy OpenCode sidebar config" \
    "$OPENCODE_DIR/tui.json" "./plugins/agent-skills-sidebar.tsx" absent
  assert_grep "installer removes the legacy OpenCode sidebar plugin file" \
    "$OPENCODE_DIR/plugins/agent-skills-sidebar.tsx" "agent-skills-sidebar" absent
  assert_grep "installed opencode core carries the English header" \
    "$OPENCODE_DIR/plugins/core/router-core.js" "╌ Agent Skills Kit ╌" present
  assert_grep "shared root contains Codex-discoverable skills" \
    "$AGENTS_DIR/skills/.ask-managed-skills.txt" "ask-develop" present
  check "shared root installs renamed design skill" \
    "$([ -d "$AGENTS_DIR/skills/ask-design" ] && printf true || printf false)"
  check "shared root installs research skill" \
    "$([ -d "$AGENTS_DIR/skills/ask-research" ] && printf true || printf false)"
  check "shared root installs deep-research template" \
    "$([ -f "$AGENTS_DIR/skills/ask-deep-research/research-report-template.md" ] && printf true || printf false)"
  check "dsh installs research workflows" \
    "$([ -f "$DSH_HOME/skills/ask-research/SKILL.md" ] && [ -f "$DSH_HOME/skills/ask-deep-research/SKILL.md" ] && [ -f "$DSH_HOME/skills/ask-deep-research/research-report-template.md" ] && printf true || printf false)"
  check "shared root removes retired ui-ux skill" \
    "$([ ! -d "$AGENTS_DIR/skills/ask-ui-ux" ] && printf true || printf false)"
  check "installed OpenCode command uses design" \
    "$([ -f "$OPENCODE_DIR/commands/design.md" ] && printf true || printf false)"
  check "installed OpenCode commands include research workflows" \
    "$([ -f "$OPENCODE_DIR/commands/research.md" ] && [ -f "$OPENCODE_DIR/commands/deep-research.md" ] && printf true || printf false)"
  check "installed OpenCode command removes ui-ux" \
    "$([ ! -f "$OPENCODE_DIR/commands/ui-ux.md" ] && printf true || printf false)"
  check "installed Copilot prompt uses design" \
    "$([ -f "$COPILOT_DIR/prompts/design.prompt.md" ] && printf true || printf false)"
  check "installed Copilot prompts include research workflows" \
    "$([ -f "$COPILOT_DIR/prompts/research.prompt.md" ] && [ -f "$COPILOT_DIR/prompts/deep-research.prompt.md" ] && printf true || printf false)"
  check "installed Copilot prompt removes ui-ux" \
    "$([ ! -f "$COPILOT_DIR/prompts/ui-ux.prompt.md" ] && printf true || printf false)"
  check "installer does not create duplicate Codex skill tree" \
    "$([ ! -d "$CODEX_HOME/skills" ] && printf true || printf false)"
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

  if command -v pwsh >/dev/null 2>&1; then
    if run_powershell_installer "$SANDBOX/install-powershell.log"; then
      check "PowerShell installer succeeds in an isolated home" true
    else
      check "PowerShell installer succeeds in an isolated home" false "$(tail -5 "$SANDBOX/install-powershell.log" | tr '\n' ' ')"
    fi
    assert_installed_strings
  else
    check "PowerShell installer is available for parity validation" false "pwsh is required"
  fi

  # Migration path: seed the stale pre-English preset description exactly as
  # an existing old install would carry it, then refresh and expect the
  # managed English value to win — the drift this kit actually hit.
  local preset="$DSH_HOME/.agent-presets/ask-kit/preset.yml"
  if [ -f "$preset" ]; then
    printf 'name: Agent Skills Kit\n%s\n' "$STALE_PRESET_DESCRIPTION" > "$preset"
    printf '{\n  "plugin": [\n    "./plugins/agent-skills-router/tui.tsx",\n    "./plugins/agent-skills-router/tui.tsx"\n  ]\n}\n' > "$OPENCODE_DIR/tui.json"
    mkdir -p "$AGENTS_DIR/skills/ask-ui-ux" "$DSH_HOME/skills/ask-ui-ux"
    mkdir -p "$AGENTS_DIR/skills/ui-ux" "$DSH_HOME/skills/ui-ux"
    printf 'ask-ui-ux\n' > "$AGENTS_DIR/skills/.ask-managed-skills.txt"
    printf 'ask-ui-ux\n' > "$DSH_HOME/skills/.ask-managed-skills.txt"
    printf 'legacy\n' > "$AGENTS_DIR/skills/ask-ui-ux/SKILL.md"
    printf 'legacy\n' > "$DSH_HOME/skills/ask-ui-ux/SKILL.md"
    printf 'user-owned\n' > "$AGENTS_DIR/skills/ui-ux/SKILL.md"
    printf 'user-owned\n' > "$DSH_HOME/skills/ui-ux/SKILL.md"
    printf 'ui-ux.md\n' > "$OPENCODE_DIR/commands/.ask-managed-commands.txt"
    printf 'legacy\n' > "$OPENCODE_DIR/commands/ui-ux.md"
    printf 'ui-ux.prompt.md\n' > "$COPILOT_DIR/prompts/.ask-managed-prompts.txt"
    printf 'legacy\n' > "$COPILOT_DIR/prompts/ui-ux.prompt.md"
    printf 'user instruction\n<!-- agent-skills-kit:opencode -->\nold guidance\n' > "$OPENCODE_DIR/AGENTS.md"
    printf 'user instruction\n<!-- agent-skills-kit:dsh -->\nold guidance\n' > "$DSH_HOME/AGENTS.md"
    if run_installer "$SANDBOX/install-run-2.log"; then
      check "installer refresh succeeds over a stale install" true
    else
      check "installer refresh succeeds over a stale install" false "$(tail -5 "$SANDBOX/install-run-2.log" | tr '\n' ' ')"
    fi
    assert_grep "refresh migrates stale preset description to English" \
      "$preset" "$EXPECTED_PRESET_DESCRIPTION" present
    assert_grep "refresh removes the stale Dutch description" \
      "$preset" "$STALE_PRESET_DESCRIPTION" absent
    assert_count "refresh removes duplicate OpenCode TUI sidebar entries" \
      "$OPENCODE_DIR/tui.json" "./plugins/agent-skills-router/tui.tsx" 1
    check "refresh removes legacy shared ui-ux skill" \
      "$([ ! -d "$AGENTS_DIR/skills/ask-ui-ux" ] && printf true || printf false)"
    check "refresh installs renamed shared design skill" \
      "$([ -d "$AGENTS_DIR/skills/ask-design" ] && printf true || printf false)"
    check "refresh removes legacy dsh ui-ux skill" \
      "$([ ! -d "$DSH_HOME/skills/ask-ui-ux" ] && printf true || printf false)"
    check "refresh preserves user-owned shared ui-ux skill" \
      "$([ -f "$AGENTS_DIR/skills/ui-ux/SKILL.md" ] && printf true || printf false)"
    check "refresh preserves user-owned dsh ui-ux skill" \
      "$([ -f "$DSH_HOME/skills/ui-ux/SKILL.md" ] && printf true || printf false)"
    check "refresh removes legacy OpenCode ui-ux command" \
      "$([ ! -f "$OPENCODE_DIR/commands/ui-ux.md" ] && printf true || printf false)"
    check "refresh installs renamed OpenCode design command" \
      "$([ -f "$OPENCODE_DIR/commands/design.md" ] && printf true || printf false)"
    check "refresh removes legacy Copilot ui-ux prompt" \
      "$([ ! -f "$COPILOT_DIR/prompts/ui-ux.prompt.md" ] && printf true || printf false)"
    check "refresh installs renamed Copilot design prompt" \
      "$([ -f "$COPILOT_DIR/prompts/design.prompt.md" ] && printf true || printf false)"
    assert_grep "refresh repairs incomplete OpenCode workflow section" \
      "$OPENCODE_DIR/AGENTS.md" "Never declare merge, release, or tag readiness" present
    assert_grep "refresh repairs stale dsh workflow section" \
      "$DSH_HOME/AGENTS.md" "Never self-declare release readiness" present
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
