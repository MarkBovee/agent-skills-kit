# Host details

Install and wiring details for every host. The short version lives in the [README](../README.md#quick-start).

## Contents

- Installer and environment variables
- Bootstrap and local clone
- OpenCode
- GitHub Copilot / VS Code
- Claude Code
- Codex
- DeepSeek Harness (dsh)
- Shared root policy
- Slash commands per host
- Updating

## Installer and environment variables

Stable installs resolve the latest `vX.Y.Z` tag before copying managed assets. The bootstrap entrypoints are fetched from `main`, but the managed checkout prefers the newest stable tag and only falls back to the current checkout when no stable tag exists yet. The `design` skill ships Python scripts and CSV data and needs Python 3.8+.

The managed installer now does one thing: install all shared skills into `~/.agents/skills`, which Codex discovers natively, install Copilot instructions and prompt files, install the OpenCode router/plugin and slash commands, wire Claude Code (plugin or per-skill links plus generated rules, never replacing user skills), and when dsh is present install the dsh-optimized skill variant into `~/.dsh/skills` plus routing guidance into `~/.dsh/AGENTS.md`.

If you want non-default locations, set environment variables before running the installer:

* `AGENTS_DIR`
* `COPILOT_DIR`
* `OPENCODE_DIR`
* `CLAUDE_DIR`
* `DSH_HOME`

Codex needs no separate installer path or config patch. Native Codex skill discovery scans the shared `~/.agents/skills/` root. ASK never copies skills into `~/.codex/skills` and never edits Codex-owned configuration.

## Bootstrap and local clone

**Linux / macOS — Bash:**

```bash
curl -fsSL https://raw.githubusercontent.com/MarkBovee/agent-skills-kit/main/scripts/bootstrap.sh | bash
```

**Windows — PowerShell:**

```powershell
irm https://raw.githubusercontent.com/MarkBovee/agent-skills-kit/main/scripts/bootstrap.ps1 | iex
```

### Local clone install

**Linux / macOS — Bash:**

```bash
gh repo clone MarkBovee/agent-skills-kit
cd agent-skills-kit
bash ./scripts/install.sh
```

**Windows — PowerShell:**

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\install.ps1
```

## OpenCode

Manual install copies:

* all folders under `~/.agents/skills/`
* `core/router-core.js`
* `plugins/agent-skills-router/` — dual-entrypoint router package: server routing hooks and TUI sidebar panel
* `tui.json` entry `./plugins/agent-skills-router/tui.tsx` — required because OpenCode has no directory auto-discovery for TUI plugins

Common OpenCode config locations:

| Platform            | Path                      |
| ------------------- | ------------------------- |
| macOS / Linux / WSL | `~/.config/opencode/`     |
| Windows PowerShell  | `$HOME\.config\opencode\` |

Custom roots use the unified installer via environment variables instead of platform-specific positional arguments.

## GitHub Copilot / VS Code

Installed paths:

* `~/.agents/skills/`
* `~/.copilot/instructions/`

VS Code / Copilot now consumes the shared skill root from `~/.agents/skills/`. The Copilot-specific part that remains native is `~/.copilot/instructions/`.

The repository also ships a VS Code Agent Plugin under `.claude-plugin/`, with native skills under `skills/` and lifecycle hooks under `hooks/`. Install it from the GitHub repository through `Chat: Install Plugin From Source`, or register a local checkout with `chat.pluginLocations`:

```json
{
  "chat.pluginLocations": {
    "/path/to/agent-skills-kit": true
  }
}
```

The plugin hook routes requests to the appropriate skill file; it does not invoke native leaf skills. The plugin manifest and hooks are maintained source assets; `scripts/validate-plugin.js` checks their contract and version alignment. `SessionStart` provides the router table, and `UserPromptSubmit` recomputes its route per prompt. Hooks are preview functionality in VS Code. Inspect hook activity in Agent Debug Logs.

## Claude Code

ASK ships as a native Claude Code plugin. Skills carry the id `ask-<name>` (for example `/ask-develop`, or `/agent-skills-kit:ask-develop` when installed as a plugin); descriptions are third person, start with the nice name (`Develop: ...`), and carry what the skill does and when to use it, because Claude Code selects skills from `description` alone. Hook internals and path resolution are documented in [ARCHITECTURE.md](../ARCHITECTURE.md#claude-code-runtime).

Install as a plugin (recommended):

```text
/plugin marketplace add MarkBovee/agent-skills-kit
/plugin install agent-skills-kit@agent-skills-kit
```

### What the plugin provides

| Piece | Behavior |
| --- | --- |
| 19 `ask-` skills | Hidden from automatic model invocation (`disable-model-invocation`). The router picks one and the agent reads its `SKILL.md`; you can also run any of them as a slash command. |
| `SessionStart` hook | Routing table with the exact `SKILL.md` path per workflow plus the workflow mandate. Announced again after compaction. |
| `SubagentStart` hook | Hands the same routing table to subagents, which do not inherit session context. |
| `UserPromptSubmit` hook | One routing suggestion, the workflow risk and its gates, the test budget, and the review reminder. Plain questions and slash commands get nothing. |
| `PreToolUse` hook | The git guard: denies destructive `git` commands in Bash before they run (see below). |
| `PostToolUse` hooks | Edits arm the review reminder, and writing a prose file such as a README or docs page adds a one-time nudge to read `ask-text-writing`; reading the `ask-code-review` file (or loading it through the Skill tool) clears the reminder. Session state lives in `${CLAUDE_PLUGIN_DATA}`. |
| Subagents | `ask-worker` (Sonnet, can edit) runs a routed workflow skill end to end. Read-only `ask-reviewer`, `ask-auditor`, and `ask-researcher` return `ASK_WORKFLOW_*` evidence markers. All four default to Sonnet. |

### Git guard

The `PreToolUse` hook on Bash denies destructive git commands and tells the agent to ask you instead. By default it blocks `reset --hard`, `clean -f` (not `-n`), `branch -D`, `checkout .`, `restore .` (not `--staged`), force, delete, and mirror pushes, forced or deleting refspecs, and any push to `main` or `master` (including a bare `git push` while one of them is checked out). Other pushes go through.

Set `ASK_GIT_GUARD` in the environment (for example in the `env` block of `settings.json`): `strict` blocks every push, `off` disables the guard. It is a safety net against agent mistakes, not a security boundary: it does not look inside `bash -c` strings or scripts. It is part of the plugin, so a skills-mode install (`ASK_CLAUDE_MODE=skills`) does not have it.

Skill files resolve in this order: the shared install (`~/.agents/skills`, or `ASK_SKILLS_DIR`) when it exists, otherwise the copy bundled in the plugin. A plugin-only install therefore works without running the installer.

### Slash commands and turning skills on or off

Every workflow has two slash names. The short command is unprefixed: `/gh-inbox`, `/research`, `/develop` (`/agent-skills-kit:gh-inbox` when two plugins collide). It comes from `commands/`, which the plugin loads, and it reads `~/.agents/skills/ask-<name>/SKILL.md`, so the shared skills install (the installer always provides it) must be present; a plugin-only install still has the `/ask-*` skill entries. A user-owned file with the same name is never overwritten or removed. The skill id still works too: `/ask-gh-inbox`, or `/agent-skills-kit:ask-gh-inbox` when ASK is installed as a plugin (plugin skills are namespaced). Without the plugin (`ASK_CLAUDE_MODE=skills`) the installer copies the short commands into `~/.claude/commands/` and tracks them in `.ask-managed-commands.txt`, so retired ones are removed on update.

* **Model vs user:** every skill sets `disable-model-invocation: true`. You can run it with a slash command; the agent never starts it through the Skill tool, it reads the `SKILL.md` the router names.
* **`skillOverrides` in `settings.json`:** values are `on`, `name-only`, `user-invocable-only`, and `off` (`off` hides the skill from `/` autocomplete and blocks invoking it). Set them with Space in the `/skills` menu. Per the Claude Code docs they do not apply to plugin skills; manage those with `/plugin`. ASK never writes `skillOverrides`. If you linked skills (`ASK_CLAUDE_MODE=skills`) and want `/ask-<name>` hidden from the model but still typeable, use `"user-invocable-only"`, not `"off"`.
* **No `/ask-*` commands at all?** Run `claude plugin list`. `failed to load: cache-miss` means the marketplace points at a deleted directory (older bootstrap and update runs registered a temporary release worktree). Rerun `scripts/update.sh` (set `ASK_MARKETPLACE_SOURCE` to force another marketplace source), or `claude plugin marketplace remove agent-skills-kit` then `claude plugin marketplace add MarkBovee/agent-skills-kit`.

### Cost-aware subagents

On Claude Code the tiers map to models: `light` → Haiku, `standard` → Sonnet, `deep` → Opus, only for justified high-judgment tasks. You choose the model for your own conversation; the workflow skills run in the Sonnet `ask-worker` so a Haiku session still gets Sonnet-level work. The coordinator picks a model per other delegated task. The invocation choice beats agent frontmatter, and an alias can still be remapped by your organization, so confirm the model that actually ran in `/tasks`. Avoid `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`; it forces one model onto every subagent. The full table is in `skills/ask-agent-workflows/references/model-routing.md`.

### Installer modes

The installer (`install.sh` / `install.ps1`) never replaces `~/.claude/skills`. `ASK_CLAUDE_MODE` selects the wiring:

* `auto` (default): plugin when the `claude` CLI exists, per-skill links when only `~/.claude/` exists, otherwise skipped.
* `plugin`: marketplace add + install through the CLI; falls back to per-skill links when that fails.
* `skills`: per-skill symlinks `~/.claude/skills/ask-<name>` that never overwrite a user-owned directory.
* `off`: skip Claude entirely.

Rules are generated into `~/.claude/rules/agent-skills-kit.md` from `rules/workflow.md`; the hook skips its bundled copy of the mandate when those rules exist. Remove everything ASK added with `scripts/install.sh --uninstall-claude` or `scripts/install.ps1 -UninstallClaude`. Legacy installs that linked the whole `~/.claude/skills` directory to `~/.agents/skills` are migrated automatically.

### Verify and troubleshoot

* Validate locally with `node scripts/check-claude-code.js` and, when the CLI is installed, `claude plugin validate . --strict`.
* No routing hint appears: run `/plugin` and confirm `agent-skills-kit` is enabled, then start a new session. Slash commands and plain questions intentionally get no hint.
* The review reminder never clears: it clears when the agent reads the `ask-code-review` `SKILL.md` or loads the skill. Both the plugin and shared paths count.
* Coding standards are path-scoped for Claude: the installer writes `rules/claude/*.md` into `~/.claude/rules/` instead of the full `rules/coding-standards.md`. The always-loaded core is about a third smaller, and each language file loads only when Claude reads or edits a matching file. Without the installer (plugin-only), run `node ./scripts/export-claude-coding-standards.js --install`; it skips a differing file unless you add `--force`. Edit `rules/coding-standards.md` and rerun the script without flags to regenerate `rules/claude/`; CI fails on drift. Uninstall removes only files identical to the generated ones.
* Measure skill activation with `node ./scripts/eval-skill-activation.js`. It runs 20 realistic prompts through `claude -p` and spends tokens, so it is manual and not part of CI.

## Codex

Codex loads skills from the Agent Skills standard. It scans repository `.agents/skills` directories and the user shared `~/.agents/skills/` root. ASK installs canonical skill directories there and never edits `~/.codex/config.toml`.

Use the global Codex `AGENTS.md` router guidance to read a selected shared `SKILL.md` directly. Native invocation remains enabled only for dispatcher skills. ASK's OpenCode router is not installed into Codex: the current Codex skill host exposes no supported equivalent hook for prompt injection, tool gating, or session-state widgets.

## DeepSeek Harness (dsh)

dsh (DeepSeek Harness) is a Cordis-based "everything is a plugin" agent harness. The optional `ask-kit` agent preset routes to shared workflow files and reads the selected `SKILL.md` directly; it does not depend on native discovery for workflow bodies.

Installed paths (when dsh is present — a reachable `dsh` binary or an existing dsh home):

* `~/.dsh/skills/` — dsh-optimized skill variant (frontmatter `name` + trigger-augmented `description` capped at the dsh catalog limit, plus `whenToUse`)
* `~/.dsh/AGENTS.md` — always-on routing guidance, appended once behind a `<!-- agent-skills-kit:dsh -->` marker (never rewrites existing content)
* `~/.dsh/.agent-presets/ask-kit/` — optional agent preset: a one-time copy of the deployed `standard` preset plus this kit's managed router row (`plugins/ask-kit-router.mjs`, `vendor/router-core.js`)
* `~/.dsh/.agent-skills-kit-dsh-install.txt` — install metadata

### dsh router preset (optional)

The `ask-kit` preset mounts `plugins/agent-skills-router.dsh.mjs` as a Cordis row. Per model step it appends an `--- Agent Skills Kit ---` section built from `routingHintLines()` in `core/router-core.js`, reads the selected shared `SKILL.md`, tracks router-directed reads, flags review debt after code edits, and clears nudges on completion evidence — mirroring the OpenCode router. Its compact composer panel reads the same `ask-kit/state` snapshot. Slash commands steer the session to read the selected file directly, with any typed remainder as focus. Row config: `blockUntilSkillLoaded: true` gates edits until the router has read an ASK workflow file; it defaults to `false`.

Reinstall refreshes only the managed files (`plugins/ask-kit-router.mjs`, `vendor/router-core.js`); the copied composition, the appended router row, and any edits you made are left alone — delete `~/.dsh/.agent-presets/ask-kit/` and reinstall to rebase on the current `standard` preset or re-add a removed row. Select the preset per session from dsh's picker; removing the directory removes it from the roster.

dsh also loads the canonical shared skills from `~/.agents/skills/` (rank 500); the generated variant installed to `~/.dsh/skills/` (rank 400) shadows them for dsh sessions, so the trigger-augmented descriptions win. dsh discovers the generated `.dsh/skills/` in this repository as project-scoped skills (rank 100) when a session runs inside the kit checkout.

dsh skill roots and ranks (preview, see API exposure below): `<project>/.dsh/skills` (100) → `<project>/.agents/skills` (200) → configured `customSkillDirs` (300) → `~/.dsh/skills` (400) → `~/.agents/skills` (500).

### dsh preview API exposure

Everything dsh-related is `0.1.0-rc.x` developer preview and can change without notice. The kit's dsh support depends on:

| Surface                       | What the kit relies on                                                                                                               | Break risk                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Skill discovery roots & ranks | `~/.dsh/skills` (400) and `~/.agents/skills` (500) discovery, project `.dsh/skills` (100)                                            | Path or rank changes silently change which variant loads                                  |
| Skill frontmatter contract    | `name` (kebab-case) + `description`; optional `whenToUse`; unknown fields (e.g. `triggers`) tolerated                                | A stricter validator could reject unknown fields                                          |
| Catalog rendering             | `name` + `description` only, `catalogDescriptionMaxLength` default 500                                                               | Description truncation; if `whenToUse` starts rendering, descriptions may read duplicated |
| `agent-instructions`          | `~/.dsh/AGENTS.md` user-global candidate, project `AGENTS.md` candidates, per-directory content dedup, `maxBytes` budget | Candidate-name changes or dedup changes alter which guidance loads                        |
| Skill registry (`ctx.skills`) | `registerProvider`/`snapshot`/`list`/`get`, duplicate-name shadowing across layers                                                   | API churn in the registry contract                                                        |
| MCP bridge (`dsh-mcp-client`) | Not used by the kit (tools only; skills are not MCP)                                                                                 | n/a                                                                                       |

After a dsh update, start a fresh session with the `ask-kit` preset, verify a routed prompt reads the matching skill file, and confirm `/` offers the kit's router commands.

## Shared root policy

Skills are now centralized in `~/.agents/skills/`. The remaining editor-specific surfaces are:

* VS Code / Copilot still uses `~/.copilot/instructions/` for user instructions

* OpenCode still uses its own config/plugin surfaces under `~/.config/opencode/`
* dsh uses `~/.dsh/skills/` for its optimized skill variant and `~/.dsh/AGENTS.md` for routing guidance

The unified installer removes old managed skill copies from editor-specific skill directories so `~/.agents/skills/` becomes the single managed source of truth.

## Slash commands per host

Each workflow command routes to and reads its skill file, then applies the workflow — no duplicated instructions, always the current skill body.

| Platform                 | Mechanism                            | Location                                              |
| ------------------------ | ------------------------------------ | ----------------------------------------------------- |
| OpenCode                 | `.md` command files                  | `~/.config/opencode/commands/` (global)               |
| GitHub Copilot / VS Code | prompt files                         | `.github/prompts/*.prompt.md` + `~/.copilot/prompts/` |
| Claude Code              | plugin `commands/` (or `.md` files)  | plugin-loaded, or `~/.claude/commands/` in skills mode |
| DeepSeek Harness (dsh)   | registered by the ask-kit preset row | no files — `ctx.commands.register()` at runtime       |

Commands are authored once under `commands/` and exported by `export-platform-skills.js` into `.opencode/commands/` (OpenCode) and `.github/prompts/*.prompt.md` (Copilot/VS Code). Claude Code loads `commands/` straight from the plugin (`plugin.json` sets `"commands": "./commands/"`), so `/gh-inbox` works next to the `/ask-gh-inbox` skill entry; in skills mode the installer copies them into `~/.claude/commands/`. Each command reads the router-selected `SKILL.md`; it does not invoke a hidden native leaf skill. dsh has no file-based command discovery; its picker entries are registered programmatically by the ask-kit router preset and steer the session to read the corresponding file.

## Updating

Bootstrap-managed installs update when you rerun `bootstrap.sh` or `bootstrap.ps1` unless `SKIP_PULL=1` or `-SkipPull` is used.

`SKIP_PULL=1` and `-SkipPull` now skip the remote tag refresh step and reuse the current local checkout state.

Local clone install or update:

**Linux / macOS — Bash:**

```bash
bash ./scripts/install.sh

bash ./scripts/update.sh
bash ./scripts/update.sh --skip-pull
```

**Windows — PowerShell:**

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\install.ps1

pwsh -NoLogo -NoProfile -File .\scripts\update.ps1
pwsh -NoLogo -NoProfile -File .\scripts\update.ps1 -SkipPull
```

The unified installer writes one local metadata file after each run:

* Shared managed root: `~/.agents/.agent-skills-kit-install.txt`
