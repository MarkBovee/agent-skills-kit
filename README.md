# nebu-skills

Reusable workflow skills for OpenCode, packaged as a standalone repo with a router plugin and install/update scripts.

## Quick Start

Install or update with one command.

### Windows PowerShell

```powershell
irm https://raw.githubusercontent.com/MarkBovee/nebu-skills/main/scripts/bootstrap-opencode.ps1 | iex
```

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/MarkBovee/nebu-skills/main/scripts/bootstrap-opencode.sh | bash
```

Both commands:

1. clone `MarkBovee/nebu-skills` if missing
2. pull the latest changes if the repo already exists
3. install the skills into `~/.config/opencode/skills/`
4. install the router plugin into `~/.config/opencode/plugins/`

Restart OpenCode after running them.

## Update

Run the same command again.

### Windows PowerShell

```powershell
irm https://raw.githubusercontent.com/MarkBovee/nebu-skills/main/scripts/bootstrap-opencode.ps1 | iex
```

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/MarkBovee/nebu-skills/main/scripts/bootstrap-opencode.sh | bash
```

## What You Get

- workflow skills under `~/.config/opencode/skills/`
- a routing plugin under `~/.config/opencode/plugins/nebu-skills-router.js`
- cleanup of older legacy skill installs when present
- a setup that stays compatible with `nebu-ctx`

## What is included

- `skills/`: the installed skill set
- `plugins/nebu-skills-router.js`: a routing-only OpenCode plugin that nudges the model toward the right skill
- `scripts/bootstrap-opencode.*`: one-line install/update entrypoints for GitHub-hosted installs
- `scripts/install-opencode.*`: install skills and plugin into OpenCode's global config directories
- `scripts/update-opencode.*`: pull latest repo changes and reinstall

## Included skills

- `using-nebu-skills`
- `nebu-brainstorming`
- `nebu-kickoff`
- `nebu-planning`
- `nebu-implementation`
- `nebu-debugging`
- `nebu-test-driven-development`
- `nebu-code-review`
- `nebu-verification`
- `nebu-agent-workflows`
- `nebu-refactoring`
- `nebu-ui-ux`
- `writing-nebu-skills`
- `workspace-wrapup`

## OpenCode install approach

This repo follows OpenCode's preferred local-file layout:

- skills install into `~/.config/opencode/skills/`
- plugins install into `~/.config/opencode/plugins/`
- `opencode.json` does not need to be edited for the default install path

That keeps the install simple, works with OpenCode's native discovery model, and avoids clobbering unrelated config.

## Works with `nebu-ctx`

The router plugin in this repo is intentionally narrow:

- it only adds skill-routing hints
- it does not rewrite shell commands
- it does not modify tool output
- it does not remove or replace other plugins

That means it should coexist cleanly with your `nebu-ctx` OpenCode plugin.

## Local Repo Install

If you already cloned the repo locally, use the scripts below.

### Windows PowerShell

```powershell
gh repo clone MarkBovee/nebu-skills
Set-Location .\nebu-skills
pwsh -NoLogo -NoProfile -File .\scripts\install-opencode.ps1
```

### macOS / Linux

```bash
gh repo clone MarkBovee/nebu-skills
cd nebu-skills
bash ./scripts/install-opencode.sh
```

### Custom OpenCode config directory

Use this when testing or when `~/.config/opencode` is not the target location.

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\install-opencode.ps1 -OpencodeDir "C:\path\to\opencode"
```

```bash
bash ./scripts/install-opencode.sh /path/to/opencode
```

After install, restart OpenCode.

## Local Repo Update

### Windows PowerShell

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\update-opencode.ps1
```

### macOS / Linux

```bash
bash ./scripts/update-opencode.sh
```

These scripts:

1. pull the latest repo changes with `git pull --ff-only` when the repo is a git checkout
2. reinstall the skills and router plugin into OpenCode's global config directory

If you want to reinstall without pulling first:

```powershell
pwsh -NoLogo -NoProfile -File .\scripts\update-opencode.ps1 -SkipPull
```

```bash
bash ./scripts/update-opencode.sh --skip-pull
```

## Manual install

If you prefer not to run the installer scripts, copy:

- each folder under `skills/` to `~/.config/opencode/skills/`
- `plugins/nebu-skills-router.js` to `~/.config/opencode/plugins/`

OpenCode auto-loads both locations.

## Notes

- The installer removes older legacy skill installs when present so OpenCode does not load both generations at once.
- `workspace-wrapup` assumes the target repo already includes its own wrap-up helper script.
- The installer only overwrites `nebu-skills`-managed skill folders and the `nebu-skills-router.js` plugin file. It leaves other installed plugins and skills alone.

## nebu-ctx integration

This repo is designed to complement `nebu-ctx`, not replace it.

- `nebu-skills` provides workflow selection and reusable operating patterns.
- `nebu-ctx` provides context tools, memory, compression, and broader agent infrastructure.
- The router plugin here does not touch shell rewriting or tool output, so it should stay out of `nebu-ctx`'s way.
- No separate OpenCode hook file is required for this repo; the plugin and native skill discovery are the integration layer.

If you want visual branding later, the `nebu-ctx` terminal logo is a good source to reuse, but the install scripts intentionally stay plain and low-noise.
