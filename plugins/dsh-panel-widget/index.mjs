// ask-kit-panel — HOST half (node face of the dual-face package).
// Deliberately inert: the panel is a browser-only surface. Canonical skill/
// review tracking lives in the ask-kit router row (plugins/agent-skills-
// router.dsh.mjs), which also appends the whole-value `ask-kit/state` session
// events and registers the `askKit` projection unit this package's client half
// reads. This file exists only so the package loads cleanly as a node plugin
// row (dual-face requirement); it must stay dependency-free and side-effect
// free.

/** Cordis plugin name; matches the package name so loader ids agree. */
export const name = "ask-kit-panel"

/** No hard service dependencies: the host face contributes nothing. */
export const inject = []

/**
 * No-op apply: registering nothing keeps the node face valid in any
 * composition without duplicating the router row's canonical state.
 * @param {unknown} _ctx - the mounting scope context (unused).
 */
export function apply(_ctx) {}

export default { name, inject, apply }
