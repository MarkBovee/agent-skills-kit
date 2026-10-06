<p align="center">
  <img src="assets/social-preview.png" alt="ASK — Agent Skills Kit banner" width="100%" />
</p>

<p align="center">
  <strong>ASK — Agent Skills Kit.</strong><br />
  Workflow skills and routing support for coding agents, built Claude Code first. One canonical skill system that also runs on OpenCode, Codex, GitHub Copilot, and DeepSeek Harness (dsh).
</p>

<p align="center">
  <img alt="OpenCode supported" src="https://img.shields.io/badge/OpenCode-supported-00E6FF?style=for-the-badge&labelColor=10131A" />
  <img alt="Codex supported" src="https://img.shields.io/badge/Codex-supported-74AA9C?style=for-the-badge&labelColor=10131A" />
  <img alt="GitHub Copilot supported" src="https://img.shields.io/badge/GitHub_Copilot-supported-FF4FD8?style=for-the-badge&labelColor=10131A" />
  <img alt="Claude Code supported" src="https://img.shields.io/badge/Claude_Code-supported-FFD166?style=for-the-badge&labelColor=10131A" />
  <img alt="dsh experimental" src="https://img.shields.io/badge/dsh-experimental-4C9AFF?style=for-the-badge&labelColor=10131A" />
</p>

<p align="center">
  <img alt="CI status" src="https://img.shields.io/github/actions/workflow/status/MarkBovee/agent-skills-kit/ci.yml?style=for-the-badge&label=CI&labelColor=10131A" />
  <img alt="License" src="https://img.shields.io/github/license/MarkBovee/agent-skills-kit?style=for-the-badge&labelColor=10131A&color=2EA44F" />
  <img alt="Latest release" src="https://img.shields.io/github/v/release/MarkBovee/agent-skills-kit?style=for-the-badge&labelColor=10131A&color=7C5CFF" />
</p>

<p align="center">
  <code>ASK</code>
  <code>17 skills</code>
  <code>1 router</code>
  <code>5 agent hosts</code>
  <code>review + verification</code>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> •
  <a href="#how-it-works">How it works</a> •
  <a href="#skills">Skills</a> •
  <a href="#supported-hosts">Hosts</a> •
  <a href="#documentation">Docs</a> •
  <a href="./CHANGELOG.md">Changelog</a>
</p>

---

## What it is

ASK is a set of **17 workflow skills** for coding agents: debugging, code review, verification, research, design, and more. Each skill is a short, focused playbook the agent reads right before it does that kind of work.

* **One source, many hosts.** Skills live once under `skills/` and export to Claude Code, OpenCode, Codex, GitHub Copilot, and dsh.
* **Claude Code first.** A native plugin with routing hooks, review reminders, cost-aware subagents, and path-scoped rules.
* **Hints, not control.** The router suggests one skill per task. It never rewrites commands, runs tools, or takes over a session.
* **Proof that matches the claim.** Normal work stays light (`develop` is the default); bigger changes get review, verification, and independent audit in proportion to their risk.

## Quick start

**Claude Code** (two commands, nothing else to install):

```text
/plugin marketplace add MarkBovee/agent-skills-kit
/plugin install agent-skills-kit@agent-skills-kit
```

Start a new session. The first prompt gets a routing hint, the workflow risk, and its gates.

**Every other host** (OpenCode, Codex, Copilot, dsh) and the shared skills root:

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/MarkBovee/agent-skills-kit/main/scripts/bootstrap.sh | bash
```

```powershell
# Windows
irm https://raw.githubusercontent.com/MarkBovee/agent-skills-kit/main/scripts/bootstrap.ps1 | iex
```

The bootstrap script installs the latest stable tag, is safe to rerun, and never replaces your own skills. Paths, environment variables, and update commands are in [docs/hosts.md](./docs/hosts.md).

## How it works

```text
your request
  → hook or router suggests the most specific skill
  → the agent reads that skill's SKILL.md
  → the agent does the work, following the skill
```

* A suggestion stays a hint until the agent actually reads the skill file.
* `develop` is the default when nothing more specific matches.
* After code edits, a review reminder stays until review evidence arrives.
* Risk decides the gates: a small fix needs `EXECUTE → VALIDATE`; release-sensitive work adds `AUDIT` and `RELEASE_GATE`.

A typical session:

```text
You:  "test/page.test.js started failing after my change."
ASK:  suggests debugging → the agent reads ask-debugging → reproduces, finds the root cause,
      fixes it, and re-runs the test before saying it works.

You:  "Review it before I push."
ASK:  suggests code-review → findings ranked by severity, with file and line.
```

Details: the decision tree, risk lifecycle, and cost-aware execution profile are in [docs/workflow.md](./docs/workflow.md).

## Skills

| Stage | Skills | What they do |
| --- | --- | --- |
| Research | `research`, `deep-research` | Answer a bounded question with sources, or run a multi-source investigation with contradictions and a cited handoff. |
| Start | `intake`, `spec` | Clarify fuzzy work and plan it; write a traceable requirements spec. |
| Execute | `develop`, `debugging` | Make normal changes in small validated steps; find root causes. |
| Validate | `code-review`, `verification` | Review a diff; prove a claim before saying it works. |
| Improve | `improve`, `session-review` | Audit and refactor; reflect on a session and file follow-ups. |
| Coordinate | `agent-workflows`, `write-skill` | Coordinate subagents and release chores; write and revise skills. |
| Product | `design`, `design-review` | Build interfaces beyond bland defaults; filter them for AI-default patterns. |
| Write | `text-writing` | Write text that sounds human. |
| Operate | `gh-inbox`, `observability` | Triage a repository's GitHub issues; add logging, metrics, tracing, and alerting. |

Every skill has a slash command: `/develop`, `/debugging`, `/gh-inbox`, and so on. In Claude Code the skill id is `ask-<name>` (for example `/ask-develop`), and `/agent-skills-kit:ask-develop` when two plugins collide.

## Supported hosts

| Host | Status | How ASK plugs in |
| --- | --- | --- |
| Claude Code | Primary | Plugin and marketplace: hooks, read-only subagents, native skills, rules |
| OpenCode | Supported | Router plugin with a TUI sidebar, managed skills, slash commands |
| Codex | Supported | Native discovery of `~/.agents/skills/`; no config changes |
| GitHub Copilot / VS Code | Supported | Agent plugin, generated skills, instructions, prompt files |
| DeepSeek Harness (dsh) | Experimental | Generated skills, routing guidance, optional router preset |

Claude Code is where new workflow behavior is designed and validated first. The routing logic in `core/router-core.js` is shared by the OpenCode and dsh routers.

## Documentation

| Read | For |
| --- | --- |
| [docs/hosts.md](./docs/hosts.md) | Install paths, installer modes, per-host details, troubleshooting, updates |
| [docs/workflow.md](./docs/workflow.md) | Routing, decision tree, risk-based lifecycle, cost-aware execution |
| [docs/maintenance.md](./docs/maintenance.md) | Regenerating exports, validation commands, release flow |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How the pieces fit, generated versus hand-edited files |
| [AGENTS.md](./AGENTS.md) | Binding contributor rules |
| [CHANGELOG.md](./CHANGELOG.md) | Project history |

## Contributing

Edit `skills/*/SKILL.md`, then run `node ./scripts/export-platform-skills.js`; generated exports are never hand-edited. Run the checks listed in [AGENTS.md](./AGENTS.md#required-checks) before opening a PR.

## License

MIT, see [LICENSE](./LICENSE). Copyright (c) 2026 Mark Bovee.
