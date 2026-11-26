---
description: "Show plan status with active plans, done and open items, last gate, and drift against HEAD"
---
Show the status of the plans in this working directory: `plans/*.md`, or the globs listed under `plans` in the root `.ask.json`.

- When the Agent Skills Kit plugin is loaded (`CLAUDE_PLUGIN_ROOT` is set), run `node "$CLAUDE_PLUGIN_ROOT/scripts/plan-status.js"` once and present its output.
- Otherwise read those plan files yourself. Per plan report: path, `status` from the frontmatter (unknown when absent), checked and total `- [ ]` / `- [x]` items, the first open item, and the last row of the `## Gate ledger` table.

Active plans first, done plans on one line each. Keep it brief and make no other changes.

Apply it to: $ARGUMENTS
