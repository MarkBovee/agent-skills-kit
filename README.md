<p align="center">
  <img src="assets/readme-banner.svg" alt="nebu-skills banner" width="100%" />
</p>

<p align="center">
  <strong>Workflow skills and routing support for coding agents.</strong><br />
  OpenCode-first skill pack with generated exports for GitHub Copilot and Claude Code.
</p>

<p align="center">
  <img alt="OpenCode first" src="https://img.shields.io/badge/OpenCode-first-00E6FF?style=for-the-badge&labelColor=10131A" />
  <img alt="GitHub Copilot export" src="https://img.shields.io/badge/GitHub_Copilot-exported-FF4FD8?style=for-the-badge&labelColor=10131A" />
  <img alt="Claude Code export" src="https://img.shields.io/badge/Claude_Code-exported-FFD166?style=for-the-badge&labelColor=10131A" />
  <img alt="Kaizen default" src="https://img.shields.io/badge/Kaizen-default-7C5CFF?style=for-the-badge&labelColor=10131A" />
</p>

<p align="center">
  <code>17 skills</code>
  <code>1 router plugin</code>
  <code>3 platforms</code>
  <code>review + verification</code>
</p>

<p align="center">
  <a href="#install">Install</a> •
  <a href="#skills">Skills</a> •
  <a href="#workflow-model">Workflow</a> •
  <a href="#router">Router</a> •
  <a href="#maintenance">Maintenance</a> •
  <a href="#repo-map">Repo Map</a> •
  <a href="./CHANGELOG.md">Changelog</a>
</p>

---

## Overview

| Signal | What it means |
| --- | --- |
| One canonical source | Skills live once under `skills/` and export into native GitHub Copilot and Claude Code formats. |
| OpenCode is reference | Router behavior and plugin support are designed around OpenCode first. |
| Kaizen by default | Normal software work starts with steady iterative progress, not heavyweight process. |
| Hints only | Router suggests skills. It does not rewrite commands, auto-run tools, or hijack sessions. |

## Goals

- make workflow routing sharper without building a giant prompt constitution
- keep implementation, debugging, review, verification, and wrap-up as explicit stages
- let one repo ship portable workflow guidance to three agent platforms
- encourage proof that matches the claim instead of ritual for its own sake
- stay compatible with existing tooling such as `nebu-ctx`

Project changes are tracked in [CHANGELOG.md](./CHANGELOG.md).

---

## Install

Bootstrap scripts are the recommended path. They clone if needed, update existing installs, install managed assets, and stay safe to rerun.

### OpenCode

```bash
curl -fsSL https://raw.githubusercontent.com/MarkBovee/nebu-skills/main/scripts/bootstrap-opencode.sh | bash
```

```powershell
irm https://raw.githubusercontent.com/MarkBovee/nebu-skills/main/scripts/bootstrap-opencode.ps1 | iex
```

### GitHub Copilot

```bash
curl -fsSL https://raw.githubusercontent.com/MarkBovee/nebu-skills/main/scripts/bootstrap-copilot.sh | bash
```

```powershell
irm https://raw.githubusercontent.com/MarkBovee/nebu-skills/main/scripts/bootstrap-copilot.ps1 | iex
```

### Claude Code

```bash
curl -fsSL https://raw.githubusercontent.com/MarkBovee/nebu-skills/main/scripts/bootstrap-claude-code.sh | bash
```

```powershell
irm https://raw.githubusercontent.com/MarkBovee/nebu-skills/main/scripts/bootstrap-claude-code.ps1 | iex
```

<details>
<summary><strong>Detailed install paths and local-clone commands</strong></summary>

### OpenCode Details

Local clone install:

```bash
gh repo clone MarkBovee/nebu-skills
cd nebu-skills
bash ./scripts/install-opencode.sh
```

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\install-opencode.ps1
```

Custom OpenCode directory:

```bash
bash ./scripts/install-opencode.sh /path/to/opencode
```

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\install-opencode.ps1 -OpencodeDir "C:\path\to\opencode"
```

Manual install copies:

- all folders under `skills/`
- `core/router-core.js`
- `plugins/nebu-skills-router.js`

Common OpenCode config locations:

| Platform | Path |
| --- | --- |
| macOS / Linux / WSL | `~/.config/opencode/` |
| Windows PowerShell | `$HOME\.config\opencode\` |

### GitHub Copilot Details

Installed paths:

- `~/.copilot/skills/`
- `~/.copilot/instructions/`

Local clone install:

```bash
bash ./scripts/install-copilot.sh
```

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\install-copilot.ps1
```

### Claude Code Details

Installed paths:

- `~/.claude/skills/`
- `~/.claude/rules/`

Local clone install:

```bash
bash ./scripts/install-claude-code.sh
```

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\install-claude-code.ps1
```

</details>

---

## Skills

All managed workflow skills use the `nebu-` prefix for predictable routing and easier debugging.

### By Stage

| Stage | Skills | Purpose |
| --- | --- | --- |
| Start | `nebu-kickoff`, `nebu-brainstorming`, `nebu-planning` | clarify fuzzy work before it gets expensive |
| Execute | `nebu-kaizen`, `nebu-implementation`, `nebu-debugging`, `nebu-refactoring` | move code forward with small coherent loops |
| Validate | `nebu-code-review`, `nebu-verification` | review the diff and prove the claim proportionally |
| Improve | `nebu-skill-improvement`, `nebu-github-issues`, `nebu-skill-finder` | capture reusable workflow fixes and adopt stronger stack-specific help |
| Coordinate | `nebu-agent-workflows`, `nebu-workspace-wrapup`, `nebu-using-nebu-skills`, `nebu-writing-nebu-skills` | route work, finish cleanly, and keep the skill system healthy |
| Product | `nebu-ui-ux` | push interface work beyond bland default SaaS output |

### Full Roster

| Skill | Purpose |
| --- | --- |
| `nebu-kaizen` | Small, safe iterative software work |
| `nebu-brainstorming` | Early-stage idea shaping |
| `nebu-kickoff` | Clarifying ambiguous work |
| `nebu-planning` | Multi-phase execution planning |
| `nebu-implementation` | Structured implementation flow |
| `nebu-debugging` | Root-cause investigation |
| `nebu-code-review` | Engineering review passes |
| `nebu-github-issues` | Structured issue management |
| `nebu-verification` | Validation before claiming completion |
| `nebu-refactoring` | Cleanup and simplification |
| `nebu-ui-ux` | UI and UX implementation support |
| `nebu-agent-workflows` | Multi-agent coordination |
| `nebu-skill-improvement` | Workflow improvement tracking |
| `nebu-skill-finder` | Adopt community skills from `github/awesome-copilot` for the active stack |
| `nebu-workspace-wrapup` | Workspace cleanup and handoff |
| `nebu-using-nebu-skills` | Skill discovery guidance |
| `nebu-writing-nebu-skills` | Skill authoring support |

---

## Workflow Model

Default rhythm across the pack:

1. Inspect the next boundary that matters.
2. Create the smallest coherent change.
3. Prove the touched surface with the fastest trustworthy check.
4. Review the diff before claiming victory.
5. Continue until done or blocked for real.

That is why `nebu-kaizen` carries `default: true` in frontmatter. The router uses it as a baseline nudge without overriding a clearly stronger match.

The pack favors fast trustworthy checks, then proportional review and verification before completion claims.

---

## Router

`plugins/nebu-skills-router.js` reads installed skills, scores them against user intent, and injects lightweight routing hints into the system prompt.

Core behavior:

- reads YAML frontmatter from source skills
- scores against `name`, `description`, and `triggers`
- applies the `default: true` baseline when no stronger skill is clearly ahead
- tracks code edits so `nebu-code-review` can be nudged before a done claim
- keeps `nebu-verification` close to review in completion-oriented turns
- keeps `nebu-skill-improvement` visible when sessions expose reusable workflow friction

Hard boundaries:

- no command rewriting
- no automatic tool execution
- no session takeover
- no hidden automation
- clean coexistence with other plugins, including `nebu-ctx`

---

## Platform Matrix

| Platform | Ships | Generated assets or install target |
| --- | --- | --- |
| OpenCode | router plugin, routing support, bootstrap/install/update tooling | installs managed skills plus `core/router-core.js` and `plugins/nebu-skills-router.js` |
| GitHub Copilot | generated skills, reusable instructions, bootstrap/install/update tooling | `.github/skills/`, `.github/copilot-instructions.md`, `~/.copilot/skills/`, `~/.copilot/instructions/` |
| Claude Code | generated skills, reusable rules, bootstrap/install/update tooling | `.claude/skills/`, `CLAUDE.md`, `~/.claude/skills/`, `~/.claude/rules/` |

OpenCode remains the reference implementation for routing behavior. GitHub Copilot and Claude Code exports are generated from the same canonical workflow source.

---

## Maintenance

Regenerate exported platform assets:

```bash
node ./scripts/export-platform-skills.js
```

Check trigger ownership and routing hygiene:

```bash
node ./scripts/check-trigger-overlap.js
```

Load the router plugin directly:

```bash
node -e "require('./plugins/nebu-skills-router.js')"
```

Refresh the cached community-skills index:

```bash
node ./scripts/fetch-community-skills-index.js
```

Issue helper for duplicate checks before filing follow-up work:

```bash
skills/nebu-github-issues/check-existing-issue.sh "<query>" [owner/repo]
```

<details>
<summary><strong>Update commands</strong></summary>

Bootstrap-managed installs update when you rerun the matching bootstrap command unless `SKIP_PULL=1` or `-SkipPull` is used.

Local clone updates:

```bash
bash ./scripts/update-opencode.sh
bash ./scripts/update-opencode.sh --skip-pull

bash ./scripts/update-copilot.sh
bash ./scripts/update-copilot.sh --skip-pull

bash ./scripts/update-claude-code.sh
bash ./scripts/update-claude-code.sh --skip-pull
```

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\update-opencode.ps1
pwsh -NoLogo -NoProfile -File .\scripts\update-opencode.ps1 -SkipPull

pwsh -NoLogo -NoProfile -File .\scripts\update-copilot.ps1
pwsh -NoLogo -NoProfile -File .\scripts\update-copilot.ps1 -SkipPull

pwsh -NoLogo -NoProfile -File .\scripts\update-claude-code.ps1
pwsh -NoLogo -NoProfile -File .\scripts\update-claude-code.ps1 -SkipPull
```

</details>

---

## Repo Map

```text
skills/                     Canonical workflow skills
.github/skills/             Generated GitHub Copilot export
.claude/skills/             Generated Claude Code export

core/router-core.js         Shared scoring, frontmatter, and session helpers
plugins/nebu-skills-router.js

scripts/bootstrap-opencode.*
scripts/install-opencode.*
scripts/update-opencode.*

scripts/bootstrap-copilot.*
scripts/install-copilot.*
scripts/update-copilot.*

scripts/bootstrap-claude-code.*
scripts/install-claude-code.*
scripts/update-claude-code.*
```

---

## Notes

- OpenCode is the routing reference implementation.
- Visual assets live in `assets/readme-banner.svg` and `assets/social-preview.png`.
- For GitHub repo cards, use `assets/social-preview.png` as the social preview image.
- Restart OpenCode after install or update.
- Bootstrap scripts store a managed checkout in `REPO_DIR` when set. Default path is `XDG_DATA_HOME/nebu-skills` when available, otherwise `LOCALAPPDATA\nebu-skills` on PowerShell, then `~/.local/share/nebu-skills`.
- `nebu-ui-ux` includes Python scripts and CSV data for design guidance and requires Python `3.8+`.
- Installers overwrite only `nebu-skills` managed assets and preserve unrelated user customizations.
- Generated platform artifacts are derived output. Edit `skills/*/SKILL.md`, then re-export.

---

## Changelog

For project history, removals, and workflow shifts, see [CHANGELOG.md](./CHANGELOG.md).
