---
name: nebu-ui-ux
description: Use when the request is to design, redesign, polish, review, or implement UI/UX for web or mobile interfaces, landing pages, dashboards, flows, or visual systems.
execution_tier: heavy
delegation_default: prefer-subagent
triggers:
  - design a ui
  - redesign this page
  - improve ux
  - polish the frontend
  - landing page design
  - dashboard design
  - mobile app ui
  - design system
  - ui review
  - redesign the frontend
  - improve this page
---
# Nebu UI/UX

Design for clarity, hierarchy, and usability first. Make the interface feel intentional, not generic.

## Use this when

- the user wants a new UI, redesign, polish pass, UX fix, or visual review
- the right layout, interaction, or visual direction is not obvious yet
- the work includes screens, flows, dashboards, landing pages, forms, navigation, or design systems

If the repo already has a design system or visual language, preserve it unless the user asks to change it.

## Working pattern

1. Inspect the existing product, screen, or component first. If no existing system is present, explicitly choose a reference anchor before generating anything.
2. Identify constraints: device sizes, theme, brand, accessibility, and stack.
3. Choose a clear visual direction that fits the product instead of defaulting to bland SaaS UI.
4. Make the smallest coherent set of layout, hierarchy, spacing, color, copy, and interaction changes.
5. Run a headless screenshot review on standard desktop and mobile viewports after each meaningful UI pass.
6. Fix the highest-signal issues from the review, then repeat.
7. Keep iterating without repeated approval prompts unless the visual direction itself is in doubt.

## Never do this

- purple or violet as the default accent, especially `#7c3aed`, `#8b5cf6`, or generic purple gradients
- `Inter` plus an oversized hero headline as the default type pairing
- uniform card grids with the same `border-radius`, shadow, spacing, and visual weight everywhere
- frosted glass on everything as a substitute for actual design direction
- gradient hero banners with centered text and one obvious CTA button
- icon + title + body copy repeated in a 3-column feature grid by reflex
- dark mode that is only a flat near-black background with white text and no hierarchy
- choosing a visual direction before checking what already exists in the repo
- defaulting to Tailwind's stock palette without a reason tied to the product
- reusing the same radius, shadow, and spacing tokens for every component regardless of role

Reference anchors for intentional direction when no existing system exists:

- Linear: tight spacing, monochrome, purposeful motion
- Vercel: brutal simplicity, strong typographic hierarchy
- Resend: developer-product clarity, minimal chrome
- Basement Studio: bold type, dark, textured, non-generic

## Quality bar

- clear information hierarchy
- strong spacing rhythm and alignment
- deliberate typography choices
- components that feel consistent with each other
- obvious interactive states
- responsive behavior on mobile and desktop
- accessible contrast, focus states, labels, and keyboard behavior

## Avoid

- safe but forgettable layouts when the product needs a stronger point of view
- visual churn that ignores the existing system
- overcrowded screens and weak hierarchy
- using color alone to communicate state
- hover effects that shift layout or feel noisy
- low-contrast text, especially in light mode
- treating desktop UI as if it will just "shrink" to mobile

## Delivery checklist

- test key screens at narrow mobile and common desktop widths
- check empty, loading, error, hover, focus, disabled, and active states when relevant
- verify there is no horizontal scroll unless intentional
- keep icons, radii, shadows, borders, and spacing visually consistent
- respect `prefers-reduced-motion` when animation is meaningful

## Review

Use screenshot review as part of the default UI loop, not as a final optional pass.

Default capture: `1440x900` desktop, `390x844` mobile, `device_scale_factor=1`, store in `/tmp/opencode/nebu-ui-ux-review/<run-id>/`. Use `npx playwright screenshot` or a tiny Playwright script waiting for `networkidle`. Delete temp screenshots after review unless explicitly needed.

Vision review prompt:

> Review this UI screenshot. For each issue found: name it, locate it (component or section), and apply the fix immediately. Flag generic purple accents, uniform card grids, hero gradient banners, oversized centered headlines, frosted glass overuse, or weak visual hierarchy. Do not ask for confirmation unless the visual direction itself needs to change.

Fix the highest-signal issue first and repeat the loop instead of stacking speculative changes.

## Bundled search helper

Use the bundled search tool for concrete style, UX, typography, color, or stack guidance:
```bash
python3 <path-to-this-skill>/scripts/search.py "<product_type> <industry> <keywords>" --design-system [-p "Project Name"]
```

Use the helper as input to judgment, not as a substitute for it.

## Notes

- Prefer a strong design direction when the product allows it.
- Preserve the existing product language when the project already has one.
- Use the search helper to accelerate decisions, then apply local judgment.

## Use with

- `nebu-kaizen` for steady inspect-change-review loops during UI work
- `nebu-code-review` after meaningful frontend diffs
- `nebu-verification` before claiming the UI is done
