# Session notes for agent-skills-kit

Working notes for the next session; `AGENTS.md` points here. `AGENTS.md` holds the binding project rules (layout, skills, router, releases, required checks); this file holds what was learned while working here and the current state. Do not copy `AGENTS.md` content into it. Update the status section at the end of each session.

## Direction

Claude Code is the primary harness for ASK. OpenCode, Codex, Copilot, and dsh stay supported and share `core/router-core.js`. New workflow behavior is designed and validated for Claude Code first.

## How the Claude Code integration works

- **Plugin:** `.claude-plugin/` (manifest, marketplace), `hooks/hooks.json`, `agents/` (read-only `ask-reviewer`, `ask-auditor`, `ask-researcher`, default `model: sonnet`), `skills/` (17 `ask-*`, all `disable-model-invocation: true`).
- **Hooks:** `scripts/agent-skills-hook.js` handles `session-start`, `subagent-start`, `prompt`, `post-edit`, `post-skill`, `post-skill-read`. State lives in `${CLAUDE_PLUGIN_DATA}`. Plain questions and slash commands get no hint. The risk line is announced again after compaction.
- **Loading skills:** the router names a `SKILL.md` and the agent reads it with Read; leaf skills are never invoked through the native Skill tool. Reading `ask-code-review/SKILL.md` (or loading it) clears the review reminder.
- **Path resolution:** the hook prefers the shared install (`~/.agents/skills`, or `ASK_SKILLS_DIR`) and falls back to the copy bundled in the plugin, so plugin-only installs work. Paths are backtick-quoted.
- **Shared helpers in `core/router-core.js`:** `askSkillsRoot`, `askSkillFileRef`, `skillReadAction`, `askSkillNameFromPath`. The Claude hook and the dsh router both use them; do not re-implement them per host. The regex `^ask-<name>/SKILL.md$` is the real guard in `askSkillNameFromPath`; the `..` containment is defense in depth.
- **Coding standards:** `rules/coding-standards.md` is the full canonical file (other hosts). `rules/claude/` is generated from it by `scripts/export-claude-coding-standards.js` (core plus per-language files with `paths:` frontmatter; Claude Code loads those on Read/Write/Edit of matching files). Both installers copy `rules/claude/*.md` into `~/.claude/rules/`; uninstall removes only identical files. Never hand-edit `rules/claude/`; run the script and commit. CI runs `--check`.
- **Cost routing:** `skills/ask-agent-workflows/references/model-routing.md`. Haiku for bounded mechanical chores, Sonnet for review and standard work, Opus only with a stated reason.

## Pitfalls learned here

- A helper declared inside `apply()` in `plugins/agent-skills-router.dsh.mjs` is not module-scoped; `steerReviewSkill` threw a swallowed ReferenceError and completion steering silently never fired. Keep module-level helpers at module level. Suspect silent `catch {}` blocks first when a feature quietly does nothing.
- When wording or action formats change, update the assertions in the check scripts in the same commit. Loosening an assertion to a bare substring hides regressions; assert the full form.
- Prove a new test discriminates: break the code (for example make the helper return `""`) and confirm the test fails.
- CI runs more checks than the old list in `AGENTS.md` did (`check-code-comments`, `check-evidence-aware-communication`, `check-model-agnostic-guidance`, among others). Derive the run list from `.github/workflows/ci.yml`, not from memory.
- `check-code-comments.js` wants an intent comment on the line before any line containing a function or arrow callback, including inline `.map(() => ...)` and `async () => ...` arguments. `check-tmp-usage.js` forbids `os.tmpdir()` in scripts; use `fs.mkdtemp` or avoid temp paths.
- Installer changes need `.sh` and `.ps1` parity. `pwsh` can parse-check `install.ps1`; the installed-artifact script exercises only the bash installer.
- After a PR merges, its remote branch is deleted. Fetch `origin/main` and rebase the unmerged commits onto it before pushing the same branch name. `git fetch --tags` may print a harmless v1.9.2 clobber error.
- Never declare release readiness from self-review. Behavioral deltas get one independent delta review (Sonnet, `ask-reviewer`) limited to the changed paths; mechanical deltas need validation only. Cite earlier gate evidence by diff reference instead of redoing it (`AGENTS.md`, Evidence reuse).

## Working environment

- The login shell is fish; run multi-line loops with `bash -c '...'`. `claude` is a fish function wrapper; use `command claude plugin validate <target> --strict` (Claude Code 2.1.284 here). `check-claude-code.js` runs it for the manifest, marketplace, skills, and agents.
- Do not add a `CLAUDE.md` at the repo root: the repo root is the plugin root, and `claude plugin validate --strict` fails on it ("not loaded as project context"). That is why these notes live in `SESSION-NOTES.md`.
- Scratch files go in the session scratchpad, not `/tmp`.
- Conversation with the user is in Dutch; code, docs, and commits are English. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not open a PR unless asked.
- The user's global rules live in `~/.claude/rules/` (`coding-standards*.md`, `agent-skills-kit.md`); they are generated from this repo.

## Status (2026-10-03)

- Branch `docs/agents-evidence-reuse` carries 2.5.2 work (unreleased; `v2.5.1` is the latest tag): model-cost routing, Read-based skill loading, dsh scoping fix, shared path helpers, Claude-first README, path-scoped coding standards. All CI-derived checks passed at `d49658c`.
- Independent reviews (Sonnet, `ask-reviewer`): `0692c1a..82ce304` findings fixed in `2133915` and `d33ece4`; `82ce304..d33ece4` passed; `d33ece4..d49658c` found a misplaced intent comment in `install.ps1`, a changelog typo, and an unsupported README claim, all fixed afterwards as a mechanical delta (validation only, no second review).
- No PR is open yet. The PR body should list each gate with its result, who ran it, and the diff reference, and say which evidence was reused.

## Open ideas, not done

- Memoize `fs.existsSync` in the hook (negligible gain).
- Extensionless shell scripts match no `paths` glob; the core file tells the agent to read the shell rules itself.
- `plugins/agent-skills-router/server.mjs` and `sidebar-status.js` keep their own containment code instead of `askSkillNameFromPath`.
- `check-installed-artifacts.sh` does not run the PowerShell installer.
