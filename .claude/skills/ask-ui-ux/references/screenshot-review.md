# Screenshot Review

## Review
Use screenshot review as part of the default UI loop, not as a final optional pass.

Default capture: `1440x900` desktop, `390x844` mobile, `device_scale_factor=1`, store in `$TMPDIR/ask-ui-ux-review/<run-id>/` (fall back to any host scratch dir). Use `npx playwright screenshot` or a tiny Playwright script waiting for `networkidle`. Delete temp screenshots after review unless explicitly needed.

Vision review prompt:

> Review this UI screenshot. For each issue found: name it, locate it (component or section), and apply the fix immediately. Flag generic purple accents, uniform card grids, hero gradient banners, oversized centered headlines, frosted glass overuse, or weak visual hierarchy. Do not ask for confirmation unless the visual direction itself needs to change.

Fix the highest-signal issue first and repeat the loop instead of stacking speculative changes.

## Delivery checklist
- test key screens at narrow mobile and common desktop widths
- check empty, loading, error, hover, focus, disabled, and active states when relevant
- verify there is no horizontal scroll unless intentional
- keep icons, radii, shadows, borders, and spacing visually consistent
- respect `prefers-reduced-motion` when animation is meaningful
- for native/mobile app UI, read `references/pro-rules.md` and run through its pre-delivery checklist
