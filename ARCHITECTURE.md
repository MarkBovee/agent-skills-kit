# Architecture

How agent-skills-kit (ASK) fits together. Claude Code is the primary harness; OpenCode, Codex, GitHub Copilot, and dsh are supported through the same canonical sources. `README.md` explains installation and usage and links here for file-level detail; `AGENTS.md` holds the binding contributor rules.

## Source of truth and generated output

| Path | Role | Edit by hand? |
| --- | --- | --- |
| `skills/<name>/SKILL.md` | The 17 canonical workflow skills (`ask-<name>` ids; `references/` for rare-case detail) | Yes |
| `commands/<name>.md` | Canonical slash commands | Yes |
| `core/router-core.js` | Shared routing, lifecycle, state, frontmatter, and skill-path helpers | Yes |
| `hooks/hooks.json`, `scripts/agent-skills-hook.js` | Claude Code hooks | Yes |
| `agents/` | Claude Code read-only subagents (`ask-reviewer`, `ask-auditor`, `ask-researcher`, default `model: sonnet`) | Yes |
| `.claude-plugin/` | Plugin manifest and marketplace entry | Yes |
| `plugins/agent-skills-router/`, `plugins/agent-skills-router.dsh.mjs`, `plugins/dsh-*` | OpenCode server/TUI router and dsh router preset, widget, panel prototype | Yes |
| `rules/workflow.md`, `rules/coding-standards.md`, `rules/agent-skills-kit.md` | Shared workflow mandate, full coding standards, OpenCode router rules | Yes |
| `scripts/` | Installers, updater, exporters, and every check | Yes |
| `.github/skills`, `.github/prompts`, `.github/copilot-instructions.md`, `.dsh/skills`, `.opencode/commands` | Copilot, dsh, and OpenCode exports | No: `scripts/export-platform-skills.js` |
| `rules/claude/` | Path-scoped Claude coding standards | No: `scripts/export-claude-coding-standards.js` |

CI regenerates both exports and fails on a diff, so commit regenerated output with the source change.

## Claude Code runtime

`scripts/agent-skills-hook.js` is a dependency-free Node script. It requires `core/router-core.js` and receives each event as JSON on stdin.

| Event | What it does |
| --- | --- |
| `SessionStart` | Emits the routing table (one `Read <SKILL.md>` action per workflow) and the cost-aware default. Includes the workflow mandate only when `~/.claude/rules/agent-skills-kit.md` is not installed. Resets the announced-risk flag after compaction. |
| `SubagentStart` | Emits the same routing table, because subagents do not inherit session context. |
| `UserPromptSubmit` | Routes the prompt with `cascadeRoute`, then adds at most one routing suggestion, the workflow risk line with its gates and test budget (once per risk change), and the review reminder. Plain questions and slash commands get no output. |
| `PostToolUse` (Edit, Write, MultiEdit, NotebookEdit) | Arms the code-review reminder (`needsCodeReview`). |
| `PostToolUse` (Skill, Read) | Clears the reminder when `ask-code-review` is loaded through the Skill tool, or when its `SKILL.md` is read from a trusted root. |

Session state is a JSON file per session under `${CLAUDE_PLUGIN_DATA}/sessions`, falling back to `~/.cache/agent-skills-kit/sessions`, pruned after 14 days. It never lives in a shared temp directory.

## Loading a skill

Skills are `disable-model-invocation: true`, so the model cannot pick them from the native listing. The hook names the file and the agent reads it with Read; leaf skills are never invoked through the native Skill tool. Users can still run any skill as a slash command (`/ask-develop`, or `/agent-skills-kit:ask-develop` for the plugin).

`core/router-core.js` owns path handling for every host:

- `askSkillsRoot()` resolves the shared root: `ASK_SKILLS_DIR`, else `~/.agents/skills`.
- `askSkillFileRef(name)` names one skill file under it (`~/` form for the default root).
- `skillReadAction(name, file?)` renders ``Read `<path>` ``; the path is backtick-quoted so directories with spaces stay one token.
- `askSkillNameFromPath(path, roots)` is the only reader-side check: it resolves real paths and accepts exactly `ask-<name>/SKILL.md` directly under a trusted root. The regex is the real guard; the `..` containment is defense in depth.

The Claude hook prefers the shared install and falls back to the copy bundled in the plugin, so a plugin-only install works. The dsh router uses absolute paths under the same root.

## Routing and lifecycle

`router-core.js` scores a prompt against phrase lists per skill (`cascadeRoute`), classifies workflow risk (`small`, `normal`, `spec-required`, `significant`, `release-sensitive`), and derives required phases (`PLAN → EXECUTE → VALIDATE → REVIEW`, plus `ITERATE → AUDIT` and `RELEASE_GATE` at higher risk). Subagent results count only with `ASK_WORKFLOW_PASS`, `_FINDINGS`, `_BLOCKED`, or `_FAILED` plus a phase, bound to a diff identity. Routing hints are advisory: a match stays hollow until the skill file is read. Decision-tree rows come from `routingHintLines()`; never duplicate them by hand.

Other hosts reuse this core:

- **OpenCode:** `plugins/agent-skills-router/server.mjs` audits the first prompt and emits compact status; `tui.tsx` and `sidebar-status.js` only read state.
- **dsh:** `plugins/agent-skills-router.dsh.mjs` is installed as an ask-kit preset row with `router-core.js` vendored beside it; helpers must stay at module scope, outside `apply()`.
- **Codex:** native discovery of `~/.agents/skills`; no router.
- **Copilot:** VS Code Agent Plugin through the same `.claude-plugin/` manifest, plus generated skills and instructions.

## Rules pipeline

- `rules/workflow.md` is the workflow mandate. The installers write it to `~/.claude/rules/agent-skills-kit.md` (with a managed marker) and into OpenCode's `AGENTS.md` section.
- `rules/coding-standards.md` is the full standard for hosts without path scoping. For Claude, `scripts/export-claude-coding-standards.js` splits it into `rules/claude/`: an always-loaded core plus one file per language with `paths:` frontmatter. Claude Code loads a scoped rule when it reads, writes, or edits a matching file. Both installers copy `rules/claude/*.md` into `~/.claude/rules/`; uninstall removes only files identical to the generated ones. Plugin-only users can run the script with `--install`.

## Subagent cost routing

`skills/ask-agent-workflows/references/model-routing.md` is the policy: Haiku for bounded mechanical work, Sonnet for standard work and review, Opus only with a stated reason. The agent files default to Sonnet; the coordinator should still pass a model per delegation, and an alias can be remapped by organization policy, so confirm the model that actually ran.

## Installation

`scripts/install.sh` and `scripts/install.ps1` must stay behaviorally aligned and idempotent. For Claude, `ASK_CLAUDE_MODE` picks `plugin` (CLI marketplace install), `skills` (per-skill links that never replace user directories), `off`, or `auto`. The installers also write the Claude rules above. `scripts/bootstrap.*` and `scripts/update.*` resolve the latest stable `vX.Y.Z` tag. Releases are cut from `main` after merge, never before.

## Checks

CI (`.github/workflows/ci.yml`) is the source of truth for what must pass; `AGENTS.md` lists the same set. Groups: plugin and manifest validity (`validate-plugin`, `check-claude-code` including `claude plugin validate --strict`), routing and lifecycle (`check-router-nudges`, `check-workflow-lifecycle`, `check-trigger-overlap`, `check-research-workflow`), host adapters (`check-dsh-plugin`, `check-opencode-v2-plugin`, `check-panel-widget`, `check-widget-live-state`), installers (`check-installed-artifacts.sh`), guidance and style (`check-code-comments`, `check-evidence-aware-communication`, `check-model-agnostic-guidance`, `check-tier-vocabulary`, `check-test-policy`, `check-tmp-usage`), generated output (`export-platform-skills`, `export-claude-coding-standards --check`), and `check-release-readiness`.

## Contributor gotchas

- **Update assertions with the wording.** When an action format or phrase changes, change the check scripts in the same commit, and assert the full form. Prove a new test discriminates by breaking the code and watching it fail.
- **Silent `catch {}` hides dead features.** A helper nested in the wrong scope threw a swallowed ReferenceError once and disabled completion steering without any failing check.
- **Intent comments.** `check-code-comments.js` wants a comment on the line before every function and before any line containing an arrow callback.
- **No shared temp paths.** `check-tmp-usage.js` rejects `os.tmpdir()` in scripts; use `fs.mkdtemp` or avoid temp paths.
- **No `CLAUDE.md` at the repo root.** The root is also the plugin root, and `claude plugin validate --strict` fails on it.
- **Installer parity.** Change `.sh` and `.ps1` together; the installed-artifact check exercises only the bash installer, so parse-check the PowerShell one (`pwsh`) at minimum.
- **After a PR merges,** its branch is deleted on the remote: fetch `origin/main` and rebase unmerged commits onto it before pushing the same branch name.
- **Evidence reuse.** Cite a passed gate by diff reference instead of repeating it; behavioral deltas get one independent delta review, mechanical deltas validation only (`AGENTS.md`).
