---
name: "ui-ux"
description: "Use when the request is to design, redesign, polish, review, or implement UI/UX for web or mobile interfaces, landing pages, dashboards, flows, or visual systems."
when_to_use: "Common triggers: design a ui, redesign this page, improve ux, polish the frontend, landing page design, dashboard design, mobile app ui, design system, ui review, redesign the frontend, improve this page, landing page, mobile ui, color palette, typography, font pairing, ui style, accessibility, animation design, data visualization, ux patterns, design system generation."
---
# ASK UI/UX

Design intelligence powered by a searchable database of 84 UI styles, 192 color palettes, 74 font pairings, 192 product types with reasoning rules, 98 UX guidelines, and 16 GSAP motion presets across 22 technology stacks.

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
python3 skills/ask-ui-ux/scripts/search.py "<product_type> <industry> <keywords>" --design-system [-p "Project Name"]
```

This searches product/style/color/landing/typography domains in parallel, applies reasoning rules from `ui-reasoning.csv`, and returns pattern, style, colors, typography, effects, and anti-patterns.

**Design Dials** (optional 1-10 sliders that tune output):

```bash
python3 skills/ask-ui-ux/scripts/search.py "<query>" --design-system --variance <1-10> --motion <1-10> --density <1-10>
```

| Dial | Low (1-3) | Mid (4-7) | High (8-10) |
|------|-----------|-----------|-------------|
| `--variance` | Centered / minimal | Balanced / modern | Bold / asymmetric |
| `--motion` | Subtle micro-interactions | Standard scroll/stagger | Complex choreography (pin, Flip, SplitText) |
| `--density` | Spacious (24-96px) | Standard (16-64px) | Dense/dashboard (8-32px) |

### Step 2b: Persist design system (Master + Overrides pattern)

```bash
python3 skills/ask-ui-ux/scripts/search.py "<query>" --design-system --persist -p "Project Name" --output-dir "<project-root>"
```

Creates `design-system/<slug>/MASTER.md` and optionally `pages/<page>.md`. When building a page, read MASTER.md first, then check for page override.

### Step 3: Supplement with detailed searches

```bash
python3 skills/ask-ui-ux/scripts/search.py "<keyword>" --domain <domain> [-n <max_results>]
```

| Need | Domain | Example |
|------|--------|---------|
| Product type patterns | `product` | `--domain product "entertainment social"` |
| More style options | `style` | `--domain style "glassmorphism dark"` |
| Color palettes | `color` | `--domain color "entertainment vibrant"` |
| Font pairings | `typography` | `--domain typography "playful modern"` |
| Individual Google Fonts | `google-fonts` | `--domain google-fonts "sans serif variable"` |
| Chart recommendations | `chart` | `--domain chart "real-time dashboard"` |
| UX best practices | `ux` | `--domain ux "animation accessibility"` |
| Landing page structure | `landing` | `--domain landing "hero social-proof"` |
| Icon recommendations | `icons` | `--domain icons "navigation outline"` |
| GSAP animation presets | `gsap` | `--domain gsap "scroll reveal stagger"` |
| React/Next.js performance | `react` | `--domain react "rerender memo list"` |
| App/native interface | `web` | `--domain web "accessibilityLabel touch safe-areas"` |

### Step 4: Stack guidelines

```bash
python3 skills/ask-ui-ux/scripts/search.py "<keyword>" --stack <stack>
```

Stacks: `react`, `nextjs`, `vue`, `svelte`, `astro`, `nuxtjs`, `nuxt-ui`, `angular`, `laravel`, `swiftui`, `react-native`, `flutter`, `jetpack-compose`, `html-tailwind`, `shadcn`, `threejs`, `javafx`, `wpf`, `winui`, `avalonia`, `uno`, `uwp`.

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
- treating desktop UI as if it will just "shrink" to mobile

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
- fabricating search results — if search returns 0 results, retry with broader keywords, then fall back to built-in defaults and state it explicitly

## Delivery checklist

- test key screens at narrow mobile and common desktop widths
- check empty, loading, error, hover, focus, disabled, and active states when relevant
- verify there is no horizontal scroll unless intentional
- keep icons, radii, shadows, borders, and spacing visually consistent
- respect `prefers-reduced-motion` when animation is meaningful
- for native/mobile app UI, read `references/pro-rules.md` and run through its pre-delivery checklist

## Review

Use screenshot review as part of the default UI loop, not as a final optional pass.

Default capture: `1440x900` desktop, `390x844` mobile, `device_scale_factor=1`, store in `/tmp/opencode/ask-ui-ux-review/<run-id>/`. Use `npx playwright screenshot` or a tiny Playwright script waiting for `networkidle`. Delete temp screenshots after review unless explicitly needed.

Vision review prompt:

> Review this UI screenshot. For each issue found: name it, locate it (component or section), and apply the fix immediately. Flag generic purple accents, uniform card grids, hero gradient banners, oversized centered headlines, frosted glass overuse, or weak visual hierarchy. Do not ask for confirmation unless the visual direction itself needs to change.

Fix the highest-signal issue first and repeat the loop instead of stacking speculative changes.

## Notes

- Prefer a strong design direction when the product allows it.
- Preserve the existing product language when the project already has one.
- Use the search helper to accelerate decisions, then apply local judgment.

## Use with

- `develop` for steady inspect-change-review loops during UI work
- `code-review` after meaningful frontend diffs
- `verification` before claiming the UI is done
