# nebu-skills

Reusable workflow skills for OpenCode with a router plugin and one-command install.

## Install

### Bootstrap (recommended)

Clones the repo, pulls latest, and installs everything in one command. Run the same command to update.

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/MarkBovee/nebu-skills/main/scripts/bootstrap-opencode.sh | bash
```

**Windows PowerShell:**

```powershell
irm https://raw.githubusercontent.com/MarkBovee/nebu-skills/main/scripts/bootstrap-opencode.ps1 | iex
```

### Local clone

```bash
gh repo clone MarkBovee/nebu-skills
cd nebu-skills
bash ./scripts/install-opencode.sh          # macOS / Linux
pwsh -NoLogo -NoProfile -File .\scripts\install-opencode.ps1  # Windows
```

### Custom config directory

```bash
bash ./scripts/install-opencode.sh /path/to/opencode
pwsh -NoLogo -NoProfile -File .\scripts\install-opencode.ps1 -OpencodeDir "C:\path\to\opencode"
```

### Manual

Copy each folder under `skills/` to `~/.config/opencode/skills/` and `plugins/nebu-skills-router.js` to `~/.config/opencode/plugins/`. OpenCode auto-discovers both locations.

## Update

Run the bootstrap command again, or from a local clone:

```bash
bash ./scripts/update-opencode.sh           # pulls + reinstalls
bash ./scripts/update-opencode.sh --skip-pull  # reinstall only
```

## Skills

All repo-managed workflow skills use the `nebu-` prefix so router hints and loaded skills are easy to recognize while testing.

| Skill | When to use |
| --- | --- |
| `nebu-kaizen` | Default for normal software work — small safe iterations, no unnecessary pauses |
| `nebu-brainstorming` | Shaping a feature or system where the solution is still fuzzy |
| `nebu-kickoff` | Starting ambiguous work and the goal or constraints are not yet crisp |
| `nebu-planning` | Multi-file or multi-phase work that benefits from a short execution plan |
| `nebu-implementation` | Choosing between direct work, batching, and delegation |
| `nebu-debugging` | Bug, failing test, or broken build not explained by a clear local mistake |
| `nebu-test-driven-development` | Changing behavior that should stay fixed — bugfixes, stable seams |
| `nebu-code-review` | Meaningful diff ready and fresh eyes would help catch regressions |
| `nebu-verification` | About to claim something works, is fixed, or is ready to hand off |
| `nebu-refactoring` | Cleanup, simplification, restructuring without turning it into a rewrite |
| `nebu-ui-ux` | Designing or implementing UI/UX for web or mobile interfaces |
| `nebu-agent-workflows` | Coordinating multi-agent work, parallel execution, or task handoff |
| `nebu-workspace-wrapup` | Finishing work that touched one or more repos in a workspace |
| `nebu-using-nebu-skills` | Deciding which skill fits the current task |
| `nebu-writing-nebu-skills` | Creating or revising workflow skills |

## Architecture

- **Skills** — markdown files (`SKILL.md`) with YAML frontmatter. Each skill is self-contained.
- **Router plugin** — reads frontmatter, scores skills against messages, injects routing hints into the system prompt. Does not rewrite commands or modify tool output.
- **Install scripts** — copy skills and plugin to `~/.config/opencode/`. Cleans up legacy installs. Idempotent.

## nebu-ctx compatibility

The router plugin only adds skill-routing hints. It does not touch shell rewriting, tool output, or other plugins, so it coexists with `nebu-ctx` without conflicts.

## Notes

- Restart OpenCode after install or update.
- `nebu-ui-ux` includes Python scripts and CSV data for design guidance. Requires Python 3.8+.
- The installer removes legacy `lean-*` and `*leanctx*` skill installs when present.
- The installer only overwrites `nebu-skills`-managed folders and the router plugin. Other plugins and skills are left alone.
