---
description: "Show plan status with active plans, done and open items, last gate, and drift against HEAD"
---
Show the status of the plans in this working directory's `plans/` folder.

- When the Agent Skills Kit plugin is loaded (`CLAUDE_PLUGIN_ROOT` is set), run `node "$CLAUDE_PLUGIN_ROOT/scripts/plan-status.js"` once and present its output.
- Otherwise read `plans/*.md` yourself. Per plan report: path, `status` from the frontmatter (unknown when absent), checked and total `- [ ]` / `- [x]` items, the first open item, and the last row of the `## Gate ledger` table.

In Claude Code with mods, `/ask-status` shows the same data as a live pane; this command stays the text overview for every host.

Active plans first, done plans on one line each. Keep it brief and make no other changes.

Apply it to: $ARGUMENTS
