<p align="center">
  <img src="assets/readme-banner.svg" alt="nebu-skills banner" width="100%" />
</p>

<p align="center">
  Workflow skills and smart routing for OpenCode, GitHub Copilot, and Claude Code.<br />
  OpenCode first, with native support for all three platforms out of the box.
</p>

<p align="center">
  <a href="#install">Install</a> •
  <a href="#what-you-get">What you get</a> •
  <a href="#why-it-feels-different">Why it feels different</a> •
  <a href="#skills">Skills</a> •
  <a href="#how-it-works">How it works</a>
</p>

## Why nebu-skills

`nebu-skills` gives OpenCode a sharper operating model and packages that same workflow layer for GitHub Copilot and Claude Code: focused skills, cleaner routing, better timing across the full engineering loop, and a path for the system to improve from real usage.

This started as a practical toolkit. It is turning into a tighter, more opinionated, more production-ready skill pack for developers who want sessions to feel deliberate instead of improvised.

- Better task routing from real user intent
- Strong workflow coverage from kickoff to wrap-up
- Auto-improvement loop: reusable misses can become tracked skill or router improvements
- Out-of-the-box support for OpenCode, GitHub Copilot, and Claude Code
- Simple install and update path across macOS, Linux, WSL, and Windows PowerShell
- Safe plugin behavior: hints only, no command rewriting, no tool hijacking

## What You Get

- `17` workflow skills under `skills/`
- `1` router plugin: `plugins/nebu-skills-router.js`
- `3` native platform targets: OpenCode, GitHub Copilot, and Claude Code
- `2` generated skill exports: `.github/skills/` and `.claude/skills/`
- Idempotent install/update scripts for shell and PowerShell

## Platform Support

`nebu-skills` is now a three-platform pack out of the box:

| Platform | Role | Native support |
| --- | --- | --- |
| OpenCode | Reference platform | Router plugin, bootstrap flow, install/update scripts |
| GitHub Copilot | Native secondary platform | Generated skills, instructions, install/update scripts |
| Claude Code | Native tertiary platform | Generated skills, rules, install/update scripts |

OpenCode remains the reference implementation for routing behavior. GitHub Copilot and Claude Code ship as native skill-based packages generated from the same canonical source.

## Generated Platform Assets

The canonical skill source still lives under `skills/`. Repo-local exports for GitHub Copilot and Claude Code are generated from that source, so the same workflow pack can load natively in all three environments.

Regenerate the exported skill directories after editing source skills:

```bash
node ./scripts/export-platform-skills.js
```

Generated targets:

- `.github/copilot-instructions.md`
- `.github/skills/`
- `CLAUDE.md`
- `.claude/skills/`

The default agent guidance also prefers generous comments during code edits: by default, one short intent comment above each function unless a repo clearly prefers less commentary.

## Why It Feels Different

Most prompt packs add more text.

`nebu-skills` aims to add better structure.

| Focus | What changes |
| --- | --- |
| Session starts | Better routing when the task is still fuzzy |
| Core execution | Stronger handoff between planning, implementation, debugging, and refactoring |
| Quality bar | Review and verification get explicit timing instead of being forgotten at the end |
| Plugin behavior | Guidance stays narrow and safe instead of taking over the session |

### Good fit if you want

- less prompt wrangling before useful work starts
- better transitions between brainstorming, implementation, debugging, review, and verification
- a reusable OpenCode setup that feels more deliberate than a pile of ad-hoc prompts

## Built For

- solo developers who move fast but still care about engineering quality
- teams building a repeatable OpenCode setup instead of one-off prompt habits
- projects growing from rough internal utility toward production-ready workflow

## Install

### OpenCode

OpenCode is the reference platform and remains the primary install path.

#### Bootstrap

Recommended path. Clones repo if needed, pulls latest, then installs everything. Run same command again to update.

**macOS / Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/MarkBovee/nebu-skills/main/scripts/bootstrap-opencode.sh | bash
```

**Windows PowerShell**

```powershell
irm https://raw.githubusercontent.com/MarkBovee/nebu-skills/main/scripts/bootstrap-opencode.ps1 | iex
```

#### Local clone

```bash
gh repo clone MarkBovee/nebu-skills
cd nebu-skills
bash ./scripts/install-opencode.sh
```

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\install-opencode.ps1
```

#### Custom OpenCode directory

```bash
bash ./scripts/install-opencode.sh /path/to/opencode
```

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\install-opencode.ps1 -OpencodeDir "C:\path\to\opencode"
```

#### Manual install

Copy each folder under `skills/` into your global OpenCode `skills/` directory, and copy `core/router-core.js` plus `plugins/nebu-skills-router.js` into the matching `core/` and `plugins/` directories.

Common locations:

- macOS / Linux / WSL: `~/.config/opencode/skills/`, `~/.config/opencode/core/`, and `~/.config/opencode/plugins/`
- PowerShell: `$HOME\.config\opencode\skills\`, `$HOME\.config\opencode\core\`, and `$HOME\.config\opencode\plugins\`

### GitHub Copilot

#### User profile

Installs generated skills into `~/.copilot/skills/` and a reusable instructions file into `~/.copilot/instructions/`.

```bash
bash ./scripts/install-copilot.sh
```

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\install-copilot.ps1
```

### Claude Code

#### User profile

Installs generated skills into `~/.claude/skills/` and a global rules file into `~/.claude/rules/`.

```bash
bash ./scripts/install-claude-code.sh
```

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\install-claude-code.ps1
```

## Update

Use the platform-specific updater that matches how you installed the pack:

```bash
bash ./scripts/update-opencode.sh
bash ./scripts/update-opencode.sh --skip-pull
bash ./scripts/update-copilot.sh
bash ./scripts/update-copilot.sh --skip-pull
bash ./scripts/update-claude-code.sh
bash ./scripts/update-claude-code.sh --skip-pull
```

## Skills

All repo-managed workflow skills use the `nebu-` prefix, so loaded skills and router hints stay easy to recognize while testing and during normal use.

| Skill | Use when |
| --- | --- |
| `nebu-kaizen` | Normal software work, small safe iterations, no unnecessary pauses |
| `nebu-brainstorming` | Feature or system shape still fuzzy |
| `nebu-kickoff` | Work starts ambiguous and constraints are not crisp yet |
| `nebu-planning` | Multi-file or multi-phase work needs a short execution plan |
| `nebu-implementation` | Need best route between direct work, batching, or delegation |
| `nebu-debugging` | Bug, failing test, or broken build lacks obvious local cause |
| `nebu-test-driven-development` | Behavior change should stay fixed and protected |
| `nebu-code-review` | Diff is ready and deserves a fresh engineering pass |
| `nebu-github-issues` | Need clean issue from bug report, finding, or follow-up |
| `nebu-verification` | About to claim fixed, working, or ready |
| `nebu-refactoring` | Cleanup or simplification without turning it into rewrite |
| `nebu-ui-ux` | UI/UX design or implementation work |
| `nebu-agent-workflows` | Multi-agent coordination, parallel work, handoff |
| `nebu-skill-improvement` | Reusable workflow or routing improvement should become tracked follow-up |
| `nebu-workspace-wrapup` | Finishing workspace changes before handoff |
| `nebu-using-nebu-skills` | Need help choosing right skill |
| `nebu-writing-nebu-skills` | Creating or revising workflow skills |

## From First Prompt To Final Handoff

`nebu-skills` is built around the shape of real sessions:

| Stage | Skills |
| --- | --- |
| Start well | `nebu-kickoff`, `nebu-brainstorming`, `nebu-planning` |
| Execute cleanly | `nebu-kaizen`, `nebu-implementation`, `nebu-debugging`, `nebu-refactoring` |
| Protect behavior | `nebu-test-driven-development`, `nebu-code-review`, `nebu-verification` |
| Improve system | `nebu-skill-improvement`, `nebu-github-issues` |
| Close strong | `nebu-workspace-wrapup` |

## Auto-Improvement Flow

Work should improve system that does work.

Default loop:

1. Agent does normal task flow.
2. Review, verification, or wrap-up notices reusable friction, missed judgment, or missing guardrail.
3. Route to `nebu-skill-improvement`.
4. If fix is small and clear, update skill or router directly.
5. Even after direct fix, create or reuse issue in the `nebu-skills` source repo so upstream source stays aligned.
6. If not fixing now, create or reuse GitHub issue.

Example:

- During issue creation, agent notices it should first check whether matching open issue already exists.
- That becomes reusable guidance in `nebu-github-issues`.
- If that guidance is fixed locally during the session, a `nebu-skills` source issue still gets created or reused so the improvement is tracked at the source.
- If broader follow-up is needed, `nebu-skill-improvement` captures it as tracked issue instead of losing it in chat history.

Practical helper:

- `skills/nebu-github-issues/check-existing-issue.sh "<query>" [owner/repo]` runs a default `gh issue list` duplicate search before creating a new issue.

## How It Works

### Skills

Each skill is a self-contained `SKILL.md` file with YAML frontmatter:

- `name`
- `description`
- `triggers`

That frontmatter powers routing, discovery, and cleaner testing.

### Router plugin

`plugins/nebu-skills-router.js` scans installed skills, scores them against user messages, and injects routing hints into the system prompt.

Important behavior:

- Adds hints only
- Does not auto-run tools
- Does not rewrite commands
- Tracks session edits and nudges `nebu-code-review` when review timing makes sense
- Tracks review and wrap-up timing so reusable workflow improvements can be captured before the session ends
- Stays compatible with other OpenCode plugins

### Install scripts

Install scripts copy managed skills, the shared router core, and the router plugin into the global OpenCode config directory.

They also:

- clean up legacy `lean-*` and `*leanctx*` installs
- remove renamed legacy skills when present
- leave unrelated plugins and other custom skills alone
- remain safe to run more than once

## nebu-ctx Compatibility

`nebu-skills` coexists cleanly with `nebu-ctx`.

Router scope is intentionally narrow: skill-routing hints only. It does not interfere with shell rewriting, tool output shaping, or other plugin responsibilities.

## Repo Structure

```text
skills/                     Workflow skills, one per directory
.github/skills/            Generated GitHub Copilot skill export
.claude/skills/            Generated Claude Code skill export
core/router-core.js
plugins/nebu-skills-router.js
scripts/install-copilot.*
scripts/update-copilot.*
scripts/install-claude-code.*
scripts/update-claude-code.*
scripts/bootstrap-opencode.*
scripts/install-opencode.*
scripts/update-opencode.*
```

## Notes

- OpenCode is platform 1 and remains the reference behavior for router and plugin support.
- GitHub Copilot install targets `~/.copilot/skills/` and `~/.copilot/instructions/` by default.
- Claude Code install targets `~/.claude/skills/` and `~/.claude/rules/` by default.
- Restart OpenCode after install or update.
- `bootstrap-opencode.ps1` stores repo cache in `XDG_DATA_HOME` when set, otherwise `LOCALAPPDATA`, then falls back to `$HOME\.local\share\nebu-skills`.
- `nebu-ui-ux` ships Python scripts and CSV data for design guidance. Requires Python `3.8+`.
- Installer overwrites only `nebu-skills`-managed skill folders, shared router core, and router plugin.

## Status

This project is actively evolving from useful internal toolkit to polished, production-ready OpenCode workflow layer.

If you want OpenCode sessions to start sharper, steer smarter, and finish cleaner, this repo is built for exactly that.
