---
name: "ui-ux"
description: "Use when the request is to design, redesign, polish, review, or implement UI/UX for web or mobile interfaces, landing pages, dashboards, flows, or visual systems. Common triggers: design a ui, redesign this page, improve ux, polish the frontend, landing page design, dashboard design, mobile app ui, design system, ui review, redesign the frontend, improve this page, landing page, mobile ui, color palette, typography, font pairing, ui style, accessibility, animation design, data visualization, ux patterns, design system generation."
---
# ASK UI/UX

Design intelligence powered by a searchable database of 67 UI styles, 192 color palettes, 56 font pairings, 95 product types with reasoning rules, 98 UX guidelines, and 16 GSAP motion presets across 22 technology stacks.

## Use this when

- designing, building, reviewing, or polishing UI/UX for web, mobile, desktop, or cross-platform
- choosing visual direction: colors, typography, layout, spacing, effects
- reviewing UI for UX quality, accessibility, consistency, or interaction patterns
- implementing navigation, animation, responsive behavior, or data visualization
- the right layout, interaction, or visual direction is not obvious yet

If the repo already has a design system or visual language, preserve it unless the user asks to change it.

## Priority categories

Follow priority 1→10 to decide which category to focus on first. Use `--domain <Domain>` to query full details.

| Pri | Category | Impact | Domain | Must Have | Avoid |
|-----|----------|--------|--------|-----------|-------|
| 1 | Accessibility | CRITICAL | `ux` | Contrast 4.5:1, Alt text, Keyboard nav, Aria-labels | Removing focus rings, Icon-only buttons without labels |
| 2 | Touch & Interaction | CRITICAL | `ux` | Min size 44×44px, 8px+ spacing, Loading feedback | Hover-only interactions, Instant state changes (0ms) |
| 3 | Performance | HIGH | `ux` | WebP/AVIF, Lazy loading, Reserve space (CLS < 0.1) | Layout thrashing, Cumulative Layout Shift |
| 4 | Style Selection | HIGH | `style`, `product` | Match product type, Consistency, SVG icons (no emoji) | Mixing flat & skeuomorphic, Emoji as icons |
| 5 | Layout & Responsive | HIGH | `ux` | Mobile-first breakpoints, Viewport meta, No horizontal scroll | Fixed px container widths, Disable zoom |
| 6 | Typography & Color | MEDIUM | `typography`, `color` | Base 16px, Line-height 1.5, Semantic color tokens | Text < 12px body, Gray-on-gray, Raw hex in components |
| 7 | Animation | MEDIUM | `ux`, `gsap` | Duration 150–300ms, Motion conveys meaning, Spatial continuity | Decorative-only animation, Animating width/height, No reduced-motion |
| 8 | Forms & Feedback | MEDIUM | `ux` | Visible labels, Error near field, Helper text, Progressive disclosure | Placeholder-only label, Errors only at top, Overwhelm upfront |
| 9 | Navigation Patterns | HIGH | `ux` | Predictable back, Bottom nav ≤5, Deep linking | Overloaded nav, Broken back behavior, No deep links |
| 10 | Charts & Data | LOW | `chart` | Legends, Tooltips, Accessible colors | Relying on color alone to convey meaning |

## Working pattern

### Step 1: Analyze requirements

Extract product type, target audience, style keywords, and stack (check `package.json`, `pubspec.yaml`, `*.xcodeproj`, etc.). Never assume a stack — a hardcoded default silently misroutes every recommendation.

### Step 2: Generate design system (REQUIRED for new pages/projects)

Start with `--design-system` to get comprehensive recommendations:

```bash
python3 .github/skills/ask-ui-ux/scripts/search.py "<product_type> <industry> <keywords>" --design-system [-p "Project Name"]
```

This searches product/style/color/landing/typography domains in parallel, applies reasoning rules from `ui-reasoning.csv`, and returns pattern, style, colors, typography, effects, and anti-patterns.

**Design Dials** (optional 1-10 sliders that tune output):

```bash
python3 .github/skills/ask-ui-ux/scripts/search.py "<query>" --design-system --variance <1-10> --motion <1-10> --density <1-10>
```

| Dial | Low (1-3) | Mid (4-7) | High (8-10) |
|------|-----------|-----------|-------------|
| `--variance` | Centered / minimal | Balanced / modern | Bold / asymmetric |
| `--motion` | Subtle micro-interactions | Standard scroll/stagger | Complex choreography (pin, Flip, SplitText) |
| `--density` | Spacious (24-96px) | Standard (16-64px) | Dense/dashboard (8-32px) |

### Step 2b: Persist design system (Master + Overrides pattern)

```bash
python3 .github/skills/ask-ui-ux/scripts/search.py "<query>" --design-system --persist -p "Project Name" --output-dir "<project-root>"
```

Creates `design-system/<slug>/MASTER.md` and optionally `pages/<page>.md`. When building a page, read MASTER.md first, then check for page override.

### Step 3: Supplement with detailed searches

```bash
python3 .github/skills/ask-ui-ux/scripts/search.py "<keyword>" --domain <domain> [-n <max_results>]
```

For domain-specific searches, see `references/search-domains.md`.

### Step 4: Filter before showing

Before presenting the design, run it through the `design-review` skill's anti-default filter. It is the standing anti-slop gate for any UI output — catch defaulted patterns (2+ matches in one section) and rebuild the replacement decision before delivery.

### Step 5: Stack guidelines

```bash
python3 .github/skills/ask-ui-ux/scripts/search.py "<keyword>" --stack <stack>
```

See `references/search-domains.md` for available stack names.

## Never do this

- purple or violet as the default accent, especially generic purple gradients
- `Inter` plus an oversized hero headline as the default type pairing
- uniform card grids, frosted glass everywhere, or gradient hero banners by reflex
- choosing a visual direction before checking what already exists in the repo
- treating desktop UI as if it will simply shrink to mobile

## Quality bar

- clear hierarchy and spacing rhythm
- deliberate typography and consistent components
- obvious interactive states and responsive behavior
- accessible contrast, focus states, labels, and keyboard behavior

## Avoid

- safe but forgettable layouts when the product needs a stronger point of view
- visual churn that ignores the existing system
- using color alone to communicate state
- fabricating search results; broaden the query, then state when defaults were used

## Delivery checklist

- test key screens at narrow mobile and common desktop widths
- check empty, loading, error, hover, focus, disabled, and active states when relevant
- verify no horizontal scroll unless intentional
- respect `prefers-reduced-motion` when animation is meaningful
- for native/mobile UI, use `references/pro-rules.md`

## Review

Use screenshot review in the default UI loop, not only at the end. Store captures in
`$TMPDIR/ask-ui-ux-review/<run-id>/` or another host scratch directory, and fix the
highest-signal issue before repeating the review.

See `references/screenshot-review.md` for the delivery checklist and review prompt.

## Use with

- `develop` for steady inspect-change-review loops during UI work
- `design-review` to filter the finished UI for AI-default patterns before showing it
- `code-review` after meaningful frontend diffs
- `verification` before claiming the UI is done
