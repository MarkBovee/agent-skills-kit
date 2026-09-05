---
name: "design-review"
description: "Review an existing design, UI, or copy for AI-generated default patterns and quality issues before shipping or handoff. Common triggers: review this design, check for AI slop, does this look AI-generated, design review, audit the design, does this look premium, review the frontend, check this UI."
---
# Design Review — Anti-Default Filter

> **Mantra:** Avoid statistical averages. Do not default to what is typical or "standard"; make deliberate choices tailored to the specific context, users, and constraints.

A trained filter, not a style guide. Language models converge on the same small set of "safe" defaults across every web discipline — not because those defaults are good, but because they are the statistical center of the training data. This skill names that center so you can deliberately step away from it.

**Rule of application:** Review the finished draft. If it matches **2 or more items in any single section below**, it has defaulted, not decided. Report the specific pattern and rebuild the replacement decision — do not patch with surface tweaks.

Apply the filter silently. Do not narrate "I'm checking this against my anti-slop list."

## Review protocol

1. **Anchor before judging.** Name the one concrete thing this output must be true to: the product, its audience, and the single job this page, component, or section has to do. If the brief pinned a direction, review against that exactly — not against a vibe.

2. **Quick scan (10 seconds).** Look at the deliverable before inspecting anything technical. Flag: purple/blue radial gradient, glassmorphism everywhere, particle networks, bento grids of icon cards, inconsistent spacing, weak typographic hierarchy, low contrast (<4.5:1), identical hover effects everywhere, sparkle/emoji as icons.

3. **Section checks.** Load only the sections the deliverable actually touches — a copy-only review does not need the code tells. Two or more matches in any single section means it defaulted.

4. **Self-check.** Run the six questions before reporting:
   1. Specific to this product/team/context — or liftable verbatim into a competitor?
   2. Chosen because right, or because it was the first thing that came to mind?
   3. Driven by a concrete fact — a measurement, a named constraint, a real user need?
   4. Would a 40-year practitioner in this discipline be embarrassed to ship this?
   5. Have I named what this output will NOT do (edge cases, non-goals)?
   6. Is there anything here only because it was expected (third pricing tier, FAQ, About Us, dark mode, particle background)?

5. **Report.** Findings are named, located, and paired with a concrete fix. Never "adjust spacing," "change the color," or "make it more premium" — name the defaulted pattern and the specific replacement decision.

## Section A — Visual design

- **Layout defaults:** centered hero (headline + subhead + two pill CTAs + browser mockup below fold); symmetrical 3- or 6-column feature grids; full-viewport empty hero; uniform section→divider rhythm; sticky nav on every page; 4-5 column footers with links nobody would click; icons where no icon is needed; emoji as icons; the default Shadcn icon set unquestioned.
- **Decorative motifs:** glowing gradient blob / aurora background; particle network / floating-dots-with-lines; wavy or blob SVG section dividers; glowing brand-color halos / outer-glow shadows; tiled dashboard widgets as wallpaper; isometric 3D stock illustrations; low-poly geometric backgrounds; angled floating UI-mockup screenshots as the only product visualization.
- **Component tells:** glassmorphism cards (`backdrop-filter: blur`) as default premium; bento grid of icon-in-rounded-square cards with generic "Fast. Secure. Scalable." copy; excessive border-radius (16px+) on everything; every button a pill; testimonial carousel with circular avatar + first-name-last-initial + vagueless quote; 3-tier pricing with the middle highlighted "Most Popular"; high-contrast glow/accent on the primary CTA.

## Section B — Color & typography

- **Color:** purple/violet or indigo-paired-with-blue/pink as automatic "tech" palette; pure #000/#fff instead of a considered near-black/near-white; dark mode chosen for aesthetics not content; gradient primary CTA with no rationale; 5+ accent colors; hex values with no provenance.
- **Type:** Inter weights 400/600/700 only, no display/serif, no pairing decision; `letter-spacing: 0` on large display headlines (should tighten to -0.02em…-0.05em); reflexive `tracking-*` utilities and uppercase as default emphasis; hierarchy by size/weight only, no tonal steps; same line-height on a 12px caption and a 56px headline; all-caps labels as hierarchy substitute; weight-700 as the only emphasis tool.

## Section C — Copywriting

- **Sentence clichés:** "in today's fast-paced world"; "Unlock/Unleash/Elevate/Supercharge your [noun]"; "whether you're a X or a Y"; "say goodbye to [pain]"; "built for teams of every size"; rule-of-three adjective stacks; "it's not X, it's Y" reframes; em-dash restatements; sentence-initial "Additionally/Moreover"; gerund-stacked bullets; formulaic Problem-Agitation-Solution arcs.
- **Structural defaults:** generic titles ("Home | Product"); brochure meta descriptions; "Our Story" LinkedIn-style summaries; rhetorical-question openers; vague section headers ("Features," "Why Us"); generic CTA copy ("Get Started") that states no result; filler FAQ; unattributed social proof ("Trusted by N+ teams").
- **Tone & rhythm:** register that strips personality; persona abstraction ("teams like yours"); empty buzzwords (seamless, intuitive, robust); dangling participle openers; puffery; tailing present-participle clauses; weasel attribution ("some critics say"); overused adjectives/verbs/nouns (vibrant, elevate, landscape, delve); flawless-but-flat rhythm; letter-template politeness in casual copy.

**Vocabulary-level bans have a single source: `text-writing`'s `references/banned-words.md`** — when in doubt on a word/phrase ban, check there, not this section. Section C handles the structure/phrase-tells; banned-words.md is the only comprehensive word/phrase prohibition list.

## Section D — UX, IA & accessibility

- **Defaults:** every landing page in the identical Hero→Logo→Features(3-6)→How It Works(3)→Testimonial→Pricing(3)→FAQ→CTA→Footer sequence; "How It Works" forced to 3 numbered steps; wizard onboarding with no skip; empty states that just say "No items found"; "Something went wrong" with no next step; form errors only after submit; a modal for every confirmation; nav mirroring the org chart.
- **Interaction:** every hover an opacity reduction or color lightening; focus styles suppressed; scroll-triggered animation on every section; hamburger on tablet where space exists; click targets <44×44px; no loading/skeleton states; critical info only in tooltips.
- **Accessibility (the ignored discipline):** contrast not verified to WCAG AA; missing alt text or `alt`="image"; icon-only buttons without `aria-label`; inputs without `<label>` (placeholder as label); `<div>`/`<span>` as interactive elements without role/tabindex; skipped heading levels; no "skip to main content"; no `prefers-reduced-motion`.

## Section E — Visible code & structural tells

- **Code tells:** god components / functions; no error boundaries; no env-var validation on startup; `git commit -m "fix"`; deps pinned to `^x.y.z`; no `.nvmrc` or `engines`; happy-path-only tests; copy-pasted code in three files; over-engineered abstractions for a small project; scratch files left in the repo; overly descriptive comments; generic variable names (`dataList`, `resultObj`); unused imports/properties from boilerplate.
- **Source / "View Source" tells (auditing a site you didn't build):** AI-authored comments left in; over-engineered structure for trivial functionality; inconsistent auth/patterns across modules; bloated dependency list; builder/tool fingerprints in the JS bundle; the default AI stack (Next.js + Tailwind + Shadcn + Lucide + Radix); generic meta-tag oddities.
- **Technical/performance tells:** slower-than-expected load (heavy code); accessibility gaps; missing SEO/AEO basics; forms that don't submit anywhere / sign-up that goes nowhere.

## Section F — Strategic / business-context tells

The deepest, hardest-to-fake layer:
- No clear job the site is doing — it "is a website" but books no calls, generates no leads, qualifies nobody.
- No conversion thinking — structure and CTAs feel like an afterthought, not a designed path.
- Positioning vacuum — never states who it's for or why to pick it over alternatives.

## How to respond when pushed back

If the user says "this still looks AI-generated," "this is generic slop," "this looks like every other SaaS site":

**Do not:** Adjust spacing. Change the color. Swap one icon. Add more sections. Make the font bigger.

**Do:** Name the specific item above that you defaulted to. State it explicitly: "I defaulted to [pattern]. The replacement decision is [specific, justified alternative]." Rebuild from that replacement decision, not from the previous draft with surface changes applied.

The difference between a 40-year practitioner and a model generating defaults is not technique — it is the willingness to throw away a draft that has no specific reason to exist.

## Use with

- `ui-ux` to produce the design, then run this filter before showing it
- `code-review` after meaningful frontend diffs
- `verification` before claiming the design is done

## Avoid

- fixing slop with surface patches — a new icon, bigger headline, or different shade of purple is the same default wearing a costume
- reviewing as if this were a style guide — it is a filter, not a prescription
- fabricating findings — only report patterns actually present
- running the DevOps/IaC sections (6-8 of the original checklist) here; those belong to `code-review` and `improve`; this filter covers visual design, copy, UX, and interaction only.