# ask-kit-panel (dsh dual-face widget)

Compact Agent Skills Kit status panel under the DSH web composer. It shows only
the router-owned active skill, the current workflow route, and any pending
review obligations. It performs no routing or lifecycle inference.

This is the persistent successor of the `askkit-1` runtime demo
(`../dsh-panel-prototype/`): a real dual-face package instead of a
`cordis_define` session artifact.

## Faces

- **Browser face** (`client.js`) — lazy-CJS factory bundle registered in slot
  `conversation.composer.dock` (`id: ask-kit-status`, order 50). Reads the
  `askKit` session projection reactively (`sessions.binding(id).session.
  projections.faceOf("askKit")`), no polling RPC. The bundle uses the fixed
  registration id `ask-kit-panel`, which must match the package name and node
  face's exported `name`; client-modules bundles do not expose a stable
  `currentScript` URL.
- **Node face** (`index.mjs`) — inert Cordis plugin so the package loads
  cleanly as a node-plugin row too (dual-face requirement).

## State bridge

`core/router-core.js` owns the canonical active skill, workflow route, and
pending review obligations. The **ask-kit router row**
(`plugins/agent-skills-router.dsh.mjs`) appends it with its existing tracking
state as a whole-value `ask-kit/state` event to the agent's session log
(`agent.session.append`) — the whole-value rule keeps replay trivially cheap. It
also registers the `askKit` projection unit via
`ctx.inject(["sessionProjections"], …)`: a pure fold (last-write-wins over those
events) with a dependency-free hand-rolled schema, so preset-local rows stay
free of bare npm specifiers.

The client reads only the finished view from the projection store; sessions
without an askKit value (no router row mounted) render nothing.

Route markers retain `completed`, `active`, and `pending` state; solid markers
mean a reached gate, while hollow markers are pending. Pending obligations are
the review/capture skills ASK still needs (`code-review`, `design-review`,
`session-review`); each clears from the panel as soon as its skill loads. A
session with no routing decision yet shows a neutral panel, never a predicted
default workflow.

## Install

Managed by `scripts/install.sh` / `scripts/install.ps1`:

- Package copied to `~/.dsh/client-plugins/ask-kit-panel/` and symlinked into
  `~/.dsh/profiles/node_modules/ask-kit-panel` so its bare package name resolves
  for both the node loader and the client-module registry.
- Roster row appended idempotently to `~/.dsh/profiles/web/cordis.patch.yml`
  under marker comments referencing the bare package name `ask-kit-panel`;
  existing patch content is never touched.

A dsh web restart is required after installing or updating the package.
