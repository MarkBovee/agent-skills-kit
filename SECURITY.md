# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue for a vulnerability. If the button is not there, open an issue titled "Security contact request" with no details in it, and I will reply with a private way to send them.

This is a one-person project. I will acknowledge a report as soon as I can and tell you what I plan to do about it.

## What is in scope

ASK installs files into your home directory and runs hooks inside your agent sessions, so these are the surfaces that matter:

- the installers and updaters: `scripts/bootstrap.sh`, `scripts/bootstrap.ps1`, `scripts/install.sh`, `scripts/install.ps1`, `scripts/update.sh`, `scripts/update.ps1`
- the Claude Code hooks: `scripts/agent-skills-hook.js` and `hooks/hooks.json`
- the OpenCode and dsh routers under `plugins/`

The git guard (`core/git-guard.js`) is a safety net against agent mistakes, not a security boundary. It does not look inside `bash -c` strings or scripts, and that limit is documented in [docs/hosts.md](docs/hosts.md#git-guard), so a bypass through those is not a vulnerability.

## Fixes

Fixes ship in the latest release. See [CHANGELOG.md](CHANGELOG.md) for what changed.
