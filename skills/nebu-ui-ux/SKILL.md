---
name: nebu-ui-ux
description: Use when the request is to design, redesign, polish, review, or implement UI/UX for web or mobile interfaces, landing pages, dashboards, flows, or visual systems.
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

1. Inspect the existing product, screen, or component first.
2. Identify constraints: device sizes, theme, brand, accessibility, and stack.
3. Choose a clear visual direction that fits the product instead of defaulting to bland SaaS UI.
4. Make the smallest coherent set of layout, hierarchy, spacing, color, copy, and interaction changes.
5. Validate responsiveness, states, and accessibility before handoff.
6. Keep iterating without repeated approval prompts unless the visual direction itself is in doubt.

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

## Bundled search helper

Use the bundled search tool when you want concrete style, UX, typography, color, chart, or stack guidance fast.
Use the path to this skill's [search script](./scripts/search.py) when you invoke it from the terminal.

Primary entry point:

```bash
python3 <path-to-this-skill>/scripts/search.py "<product_type> <industry> <keywords>" --design-system [-p "Project Name"]
```

Useful follow-ups:

```bash
python3 <path-to-this-skill>/scripts/search.py "animation accessibility" --domain ux
python3 <path-to-this-skill>/scripts/search.py "elegant luxury serif" --domain typography
python3 <path-to-this-skill>/scripts/search.py "layout responsive form" --stack html-tailwind
```

Use the helper as input to judgment, not as a substitute for it.

## Notes

- Prefer a strong design direction when the product allows it.
- Preserve the existing product language when the project already has one.
- Use the search helper to accelerate decisions, then apply local judgment.
