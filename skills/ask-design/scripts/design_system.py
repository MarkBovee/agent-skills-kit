#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Design System Generator - aggregates search results and applies reasoning."""

import csv
import json
import os
import re
import sys
import io
from datetime import datetime
from pathlib import Path
from core import search, DATA_DIR

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

REASONING_FILE = "ui-reasoning.csv"

SEARCH_CONFIG = {
    "product": {"max_results": 1},
    "style": {"max_results": 3},
    "color": {"max_results": 2},
    "landing": {"max_results": 2},
    "typography": {"max_results": 2}
}

DIAL_TIERS = {
    "variance": [
        (1, 3, {"label": "Centered / Minimal", "style_keywords": ["Minimalism", "Exaggerated Minimalism", "centered", "symmetric", "grid-based"]}),
        (4, 7, {"label": "Balanced / Modern", "style_keywords": ["modern", "structured", "balanced"]}),
        (8, 10, {"label": "Bold / Asymmetric", "style_keywords": ["Brutalism", "Bento Grids", "asymmetric", "experimental"]}),
    ],
    "motion": [
        (1, 3, {"label": "Subtle", "tier": "Subtle"}),
        (4, 7, {"label": "Standard", "tier": "Standard"}),
        (8, 10, {"label": "Complex", "tier": "Complex"}),
    ],
    "density": [
        (1, 3, {"label": "Spacious", "spacing": {"xs": "4px", "sm": "8px", "md": "24px", "lg": "32px", "xl": "48px", "2xl": "64px", "3xl": "96px"}}),
        (4, 7, {"label": "Standard", "spacing": {"xs": "4px", "sm": "8px", "md": "16px", "lg": "24px", "xl": "32px", "2xl": "48px", "3xl": "64px"}}),
        (8, 10, {"label": "Dense / Dashboard", "spacing": {"xs": "2px", "sm": "4px", "md": "8px", "lg": "12px", "xl": "16px", "2xl": "24px", "3xl": "32px"}}),
    ],
}


def _resolve_dial(dial_name, value):
    if value is None:
        return None
    value = max(1, min(10, int(value)))
    for lo, hi, info in DIAL_TIERS[dial_name]:
        if lo <= value <= hi:
            return {**info, "value": value}
    return None


class DesignSystemGenerator:
    """Generates design system recommendations from aggregated searches."""

    def __init__(self):
        self.reasoning_data = self._load_reasoning()

    def _load_reasoning(self):
        filepath = DATA_DIR / REASONING_FILE
        if not filepath.exists():
            return []
        with open(filepath, 'r', encoding='utf-8') as f:
            return list(csv.DictReader(f))

    def _multi_domain_search(self, query, style_priority=None):
        results = {}
        for domain, config in SEARCH_CONFIG.items():
            if domain == "style" and style_priority:
                priority_query = " ".join(style_priority[:2]) if style_priority else query
                combined_query = f"{query} {priority_query}"
                results[domain] = search(combined_query, domain, config["max_results"])
            else:
                results[domain] = search(query, domain, config["max_results"])
        return results

    def _find_reasoning_rule(self, category):
        category_lower = category.lower()
        for rule in self.reasoning_data:
            if rule.get("UI_Category", "").lower() == category_lower:
                return rule
        for rule in self.reasoning_data:
            ui_cat = rule.get("UI_Category", "").lower()
            if ui_cat in category_lower or category_lower in ui_cat:
                return rule
        for rule in self.reasoning_data:
            ui_cat = rule.get("UI_Category", "").lower()
            keywords = ui_cat.replace("/", " ").replace("-", " ").split()
            if any(kw in category_lower for kw in keywords):
                return rule
        return {}

    def _apply_reasoning(self, category, search_results):
        rule = self._find_reasoning_rule(category)
        if not rule:
            return {
                "pattern": "Hero + Features + CTA",
                "style_priority": ["Minimalism", "Flat Design"],
                "color_mood": "Professional",
                "typography_mood": "Clean",
                "key_effects": "Subtle hover transitions",
                "anti_patterns": "",
                "decision_rules": {},
                "severity": "MEDIUM"
            }
        decision_rules = {}
        try:
            decision_rules = json.loads(rule.get("Decision_Rules", "{}"))
        except json.JSONDecodeError:
            pass
        return {
            "pattern": rule.get("Recommended_Pattern", ""),
            "style_priority": [s.strip() for s in rule.get("Style_Priority", "").split("+")],
            "color_mood": rule.get("Color_Mood", ""),
            "typography_mood": rule.get("Typography_Mood", ""),
            "key_effects": rule.get("Key_Effects", ""),
            "anti_patterns": rule.get("Anti_Patterns", ""),
            "decision_rules": decision_rules,
            "severity": rule.get("Severity", "MEDIUM")
        }

    def _select_best_match(self, results, priority_keywords):
        if not results:
            return {}
        if not priority_keywords:
            return results[0]
        for priority in priority_keywords:
            priority_lower = priority.lower().strip()
            for result in results:
                style_name = result.get("Style Category", "").lower()
                if priority_lower in style_name or style_name in priority_lower:
                    return result
        scored = []
        for result in results:
            result_str = str(result).lower()
            score = 0
            for kw in priority_keywords:
                kw_lower = kw.lower().strip()
                if kw_lower in result.get("Style Category", "").lower():
                    score += 10
                elif kw_lower in result.get("Keywords", "").lower():
                    score += 3
                elif kw_lower in result_str:
                    score += 1
            scored.append((score, result))
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[0][1] if scored and scored[0][0] > 0 else results[0]

    def _extract_results(self, search_result):
        return search_result.get("results", [])

    def generate(self, query, project_name=None,
                 variance=None, motion=None, density=None):
        variance_info = _resolve_dial("variance", variance)
        motion_info = _resolve_dial("motion", motion)
        density_info = _resolve_dial("density", density)
        product_result = search(query, "product", 1)
        product_results = product_result.get("results", [])
        category = "General"
        if product_results:
            category = product_results[0].get("Product Type", "General")
        reasoning = self._apply_reasoning(category, {})
        style_priority = reasoning.get("style_priority", [])
        effective_style_priority = style_priority
        if variance_info:
            effective_style_priority = variance_info["style_keywords"] + style_priority
        search_results = self._multi_domain_search(query, effective_style_priority)
        search_results["product"] = product_result
        style_results = self._extract_results(search_results.get("style", {}))
        color_results = self._extract_results(search_results.get("color", {}))
        typography_results = self._extract_results(search_results.get("typography", {}))
        landing_results = self._extract_results(search_results.get("landing", {}))
        best_style = self._select_best_match(style_results, effective_style_priority)
        best_color = color_results[0] if color_results else {}
        best_typography = typography_results[0] if typography_results else {}
        best_landing = landing_results[0] if landing_results else {}
        motion_snippet = {}
        if motion_info:
            motion_result = search(f"{query} {motion_info['tier']}", "gsap", 5)
            motion_matches = motion_result.get("results", [])
            tiered = [m for m in motion_matches if m.get("Intensity Tier") == motion_info["tier"]]
            if tiered:
                motion_snippet = tiered[0]
            elif motion_matches:
                motion_snippet = motion_matches[0]
        style_effects = best_style.get("Effects & Animation", "")
        reasoning_effects = reasoning.get("key_effects", "")
        combined_effects = style_effects if style_effects else reasoning_effects
        return {
            "project_name": project_name or query.upper(),
            "category": category,
            "pattern": {
                "name": best_landing.get("Pattern Name", reasoning.get("pattern", "Hero + Features + CTA")),
                "sections": best_landing.get("Section Order", "Hero > Features > CTA"),
                "cta_placement": best_landing.get("Primary CTA Placement", "Above fold"),
                "color_strategy": best_landing.get("Color Strategy", ""),
                "conversion": best_landing.get("Conversion Optimization", "")
            },
            "style": {
                "name": best_style.get("Style Category", "Minimalism"),
                "type": best_style.get("Type", "General"),
                "effects": style_effects,
                "keywords": best_style.get("Keywords", ""),
                "best_for": best_style.get("Best For", ""),
                "performance": best_style.get("Performance", ""),
                "accessibility": best_style.get("Accessibility", ""),
                "light_mode": best_style.get("Light Mode ✓", ""),
                "dark_mode": best_style.get("Dark Mode ✓", ""),
            },
            "colors": {
                "primary": best_color.get("Primary", "#2563EB"),
                "on_primary": best_color.get("On Primary", ""),
                "secondary": best_color.get("Secondary", "#3B82F6"),
                "accent": best_color.get("Accent", "#F97316"),
                "background": best_color.get("Background", "#F8FAFC"),
                "foreground": best_color.get("Foreground", "#1E293B"),
                "muted": best_color.get("Muted", ""),
                "border": best_color.get("Border", ""),
                "destructive": best_color.get("Destructive", ""),
                "ring": best_color.get("Ring", ""),
                "notes": best_color.get("Notes", ""),
                "cta": best_color.get("Accent", "#F97316"),
                "text": best_color.get("Foreground", "#1E293B"),
            },
            "typography": {
                "heading": best_typography.get("Heading Font", "Inter"),
                "body": best_typography.get("Body Font", "Inter"),
                "mood": best_typography.get("Mood/Style Keywords", reasoning.get("typography_mood", "")),
                "best_for": best_typography.get("Best For", ""),
                "google_fonts_url": best_typography.get("Google Fonts URL", ""),
                "css_import": best_typography.get("CSS Import", "")
            },
            "key_effects": combined_effects,
            "anti_patterns": reasoning.get("anti_patterns", ""),
            "decision_rules": reasoning.get("decision_rules", {}),
            "severity": reasoning.get("severity", "MEDIUM"),
            "dials": {
                "variance": variance_info["value"] if variance_info else None,
                "variance_label": variance_info["label"] if variance_info else None,
                "motion": motion_info["value"] if motion_info else None,
                "motion_label": motion_info["label"] if motion_info else None,
                "density": density_info["value"] if density_info else None,
                "density_label": density_info["label"] if density_info else None,
            },
            "motion_snippet": motion_snippet,
            "spacing_scale": density_info["spacing"] if density_info else None,
        }


def hex_to_ansi(hex_color):
    if not hex_color or not hex_color.startswith('#'):
        return ""
    colorterm = os.environ.get('COLORTERM', '')
    if colorterm not in ('truecolor', '24bit'):
        return ""
    hex_color = hex_color.lstrip('#')
    if len(hex_color) != 6:
        return ""
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    return f"\033[38;2;{r};{g};{b}m██\033[0m "


def format_ascii_box(design_system):
    project = design_system.get("project_name", "PROJECT")
    pattern = design_system.get("pattern", {})
    style = design_system.get("style", {})
    colors = design_system.get("colors", {})
    typography = design_system.get("typography", {})
    effects = design_system.get("key_effects", "")
    anti_patterns = design_system.get("anti_patterns", "")
    dials = design_system.get("dials", {})
    motion_snippet = design_system.get("motion_snippet", {})
    sections = [s.strip() for s in pattern.get("sections", "").split(">") if s.strip()]
    w = 89
    lines = []
    lines.append("╔" + "═" * w + "╗")
    lines.append(f"║  TARGET: {project} - RECOMMENDED DESIGN SYSTEM".ljust(w + 1) + "║")
    lines.append("╚" + "═" * w + "╝")
    lines.append("┌" + "─" * w + "┐")

    if any(dials.get(k) is not None for k in ("variance", "motion", "density")):
        lines.append(f"├─── DESIGN DIALS {'─' * (w - 15)}┤")
        if dials.get("variance") is not None:
            lines.append(f"│  Variance: {dials['variance']}/10 — {dials['variance_label']}".ljust(w + 1) + "│")
        if dials.get("motion") is not None:
            lines.append(f"│  Motion:   {dials['motion']}/10 — {dials['motion_label']}".ljust(w + 1) + "│")
        if dials.get("density") is not None:
            lines.append(f"│  Density:  {dials['density']}/10 — {dials['density_label']}".ljust(w + 1) + "│")

    lines.append(f"├─── PATTERN {'─' * (w - 10)}┤")
    lines.append(f"│  Name: {pattern.get('name', '')}".ljust(w + 1) + "│")
    if pattern.get('conversion'):
        lines.append(f"│     Conversion: {pattern.get('conversion', '')}".ljust(w + 1) + "│")
    if pattern.get('cta_placement'):
        lines.append(f"│     CTA: {pattern.get('cta_placement', '')}".ljust(w + 1) + "│")
    lines.append("│     Sections:".ljust(w + 1) + "│")
    for i, s in enumerate(sections, 1):
        lines.append(f"│       {i}. {s}".ljust(w + 1) + "│")

    lines.append(f"├─── STYLE {'─' * (w - 8)}┤")
    lines.append(f"│  {style.get('name', '')}".ljust(w + 1) + "│")
    light = style.get("light_mode", "")
    dark = style.get("dark_mode", "")
    if light or dark:
        lines.append(f"│     Light {light} | Dark {dark}".ljust(w + 1) + "│")
    if style.get("keywords"):
        lines.append(f"│     Keywords: {style.get('keywords', '')[:80]}".ljust(w + 1) + "│")
    if style.get("best_for"):
        lines.append(f"│     Best For: {style.get('best_for', '')[:80]}".ljust(w + 1) + "│")
    if style.get("performance") or style.get("accessibility"):
        lines.append(f"│     Perf: {style.get('performance', '')} | A11y: {style.get('accessibility', '')}".ljust(w + 1) + "│")

    lines.append(f"├─── COLORS {'─' * (w - 9)}┤")
    for label, key, css_var in [
        ("Primary", "primary", "--color-primary"),
        ("Accent/CTA", "accent", "--color-accent"),
        ("Background", "background", "--color-background"),
        ("Foreground", "foreground", "--color-foreground"),
    ]:
        hex_val = colors.get(key, "")
        if not hex_val:
            continue
        swatch = hex_to_ansi(hex_val)
        content = f"│     {swatch}{label + ':':14s} {hex_val:10s} ({css_var})"
        visible = len(re.sub(r'\033\[[0-9;]*m', '', content))
        lines.append(content + (" " * max(0, w + 1 - visible)) + "│")
    if colors.get("notes"):
        lines.append(f"│     Notes: {colors.get('notes', '')[:80]}".ljust(w + 1) + "│")

    lines.append(f"├─── TYPOGRAPHY {'─' * (w - 14)}┤")
    lines.append(f"│  {typography.get('heading', '')} / {typography.get('body', '')}".ljust(w + 1) + "│")
    if typography.get("mood"):
        lines.append(f"│     Mood: {typography.get('mood', '')}".ljust(w + 1) + "│")
    if typography.get("google_fonts_url"):
        lines.append(f"│     {typography.get('google_fonts_url', '')}".ljust(w + 1) + "│")

    if effects:
        lines.append(f"├─── KEY EFFECTS {'─' * (w - 14)}┤")
        lines.append(f"│     {effects[:80]}".ljust(w + 1) + "│")

    if motion_snippet:
        lines.append(f"├─── MOTION {'─' * (w - 9)}┤")
        lines.append(f"│  {motion_snippet.get('Category', '')} ({motion_snippet.get('Intensity Tier', '')})".ljust(w + 1) + "│")
        lines.append(f"│     Trigger: {motion_snippet.get('Trigger', '')} | Easing: {motion_snippet.get('Easing', '')}".ljust(w + 1) + "│")

    if anti_patterns:
        lines.append(f"├─── AVOID {'─' * (w - 8)}┤")
        lines.append(f"│     {anti_patterns[:80]}".ljust(w + 1) + "│")

    lines.append(f"├─── CHECKLIST {'─' * (w - 12)}┤")
    for item in [
        "[ ] No emoji as icons (use SVG)",
        "[ ] cursor-pointer on clickable",
        "[ ] Hover states 150-300ms",
        "[ ] Contrast 4.5:1 minimum",
        "[ ] Focus states visible",
        "[ ] prefers-reduced-motion",
        "[ ] Responsive 375/768/1024/1440px",
    ]:
        lines.append(f"│     {item}".ljust(w + 1) + "│")

    lines.append("└" + "─" * w + "┘")
    return "\n".join(lines)


def format_markdown(design_system):
    project = design_system.get("project_name", "PROJECT")
    pattern = design_system.get("pattern", {})
    style = design_system.get("style", {})
    colors = design_system.get("colors", {})
    typography = design_system.get("typography", {})
    effects = design_system.get("key_effects", "")
    anti_patterns = design_system.get("anti_patterns", "")
    dials = design_system.get("dials", {})
    motion_snippet = design_system.get("motion_snippet", {})
    lines = [f"## Design System: {project}", ""]
    if any(dials.get(k) is not None for k in ("variance", "motion", "density")):
        lines.append("### Design Dials")
        if dials.get("variance") is not None:
            lines.append(f"- **Variance:** {dials['variance']}/10 — {dials['variance_label']}")
        if dials.get("motion") is not None:
            lines.append(f"- **Motion:** {dials['motion']}/10 — {dials['motion_label']}")
        if dials.get("density") is not None:
            lines.append(f"- **Density:** {dials['density']}/10 — {dials['density_label']}")
        lines.append("")
    lines.append("### Pattern")
    lines.append(f"- **Name:** {pattern.get('name', '')}")
    if pattern.get('conversion'):
        lines.append(f"- **Conversion:** {pattern.get('conversion', '')}")
    if pattern.get('cta_placement'):
        lines.append(f"- **CTA:** {pattern.get('cta_placement', '')}")
    lines.append(f"- **Sections:** {pattern.get('sections', '')}")
    lines.append("")
    lines.append("### Style")
    lines.append(f"- **Name:** {style.get('name', '')}")
    if style.get('keywords'):
        lines.append(f"- **Keywords:** {style.get('keywords', '')}")
    if style.get('best_for'):
        lines.append(f"- **Best For:** {style.get('best_for', '')}")
    lines.append("")
    lines.append("### Colors")
    lines.append("| Role | Hex | CSS Var |")
    lines.append("|------|-----|---------|")
    for label, key, css_var in [
        ("Primary", "primary", "--color-primary"),
        ("Accent/CTA", "accent", "--color-accent"),
        ("Background", "background", "--color-background"),
        ("Foreground", "foreground", "--color-foreground"),
    ]:
        hv = colors.get(key, "")
        if hv:
            lines.append(f"| {label} | `{hv}` | `{css_var}` |")
    lines.append("")
    lines.append("### Typography")
    lines.append(f"- **Heading:** {typography.get('heading', '')}")
    lines.append(f"- **Body:** {typography.get('body', '')}")
    if typography.get("google_fonts_url"):
        lines.append(f"- **Fonts:** {typography.get('google_fonts_url', '')}")
    lines.append("")
    if effects:
        lines.append("### Effects")
        lines.append(f"{effects}")
        lines.append("")
    if anti_patterns:
        lines.append("### Avoid")
        lines.append(f"- {anti_patterns.replace(' + ', '\n- ')}")
        lines.append("")
    lines.append("### Checklist")
    lines.append("- [ ] No emoji as icons (use SVG)")
    lines.append("- [ ] cursor-pointer on clickable")
    lines.append("- [ ] Hover states 150-300ms")
    lines.append("- [ ] Contrast 4.5:1 minimum")
    lines.append("- [ ] Focus states visible")
    lines.append("- [ ] prefers-reduced-motion")
    lines.append("- [ ] Responsive 375/768/1024/1440px")
    lines.append("")
    return "\n".join(lines)


def generate_design_system(query, project_name=None, output_format="ascii",
                           persist=False, page=None, output_dir=None,
                           variance=None, motion=None, density=None, force=False):
    generator = DesignSystemGenerator()
    design_system = generator.generate(query, project_name, variance=variance, motion=motion, density=density)
    persistence_result = None
    if persist:
        persistence_result = persist_design_system(design_system, page, output_dir, query, force=force)
    text = format_markdown(design_system) if output_format == "markdown" else format_ascii_box(design_system)
    return {"text": text, "design_system": design_system, "persistence": persistence_result}


def safe_slug(name, fallback="default"):
    slug = re.sub(r'[^a-z0-9_-]+', '-', str(name).lower()).strip('-')
    return slug or fallback


def persist_design_system(design_system, page=None, output_dir=None,
                           page_query=None, force=False):
    base_dir = Path(output_dir) if output_dir else Path.cwd()
    project_name = design_system.get("project_name") or "default"
    project_slug = safe_slug(project_name)
    design_system_dir = base_dir / "design-system" / project_slug
    pages_dir = design_system_dir / "pages"
    master_file = design_system_dir / "MASTER.md"
    if master_file.exists() and not force:
        return {
            "status": "skipped_exists",
            "design_system_dir": str(design_system_dir),
            "master_file": str(master_file),
            "created_files": [],
            "message": f"{master_file} already exists; use force=True to overwrite.",
        }
    created_files = []
    design_system_dir.mkdir(parents=True, exist_ok=True)
    pages_dir.mkdir(parents=True, exist_ok=True)
    master_content = format_master_md(design_system)
    with open(master_file, 'w', encoding='utf-8') as f:
        f.write(master_content)
    created_files.append(str(master_file))
    if page:
        page_file = pages_dir / f"{safe_slug(page, 'page')}.md"
        page_content = format_page_override_md(design_system, page, page_query)
        with open(page_file, 'w', encoding='utf-8') as f:
            f.write(page_content)
        created_files.append(str(page_file))
    return {"status": "success", "design_system_dir": str(design_system_dir),
            "master_file": str(master_file), "created_files": created_files}


def format_master_md(design_system):
    project = design_system.get("project_name", "PROJECT")
    pattern = design_system.get("pattern", {})
    style = design_system.get("style", {})
    colors = design_system.get("colors", {})
    typography = design_system.get("typography", {})
    effects = design_system.get("key_effects", "")
    anti_patterns = design_system.get("anti_patterns", "")
    dials = design_system.get("dials", {})
    motion_snippet = design_system.get("motion_snippet", {})
    spacing_scale = design_system.get("spacing_scale")
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = []
    lines.append("# Design System Master File")
    lines.append("")
    lines.append("> When building a page, check `design-system/pages/[page].md` first.")
    lines.append("> If that file exists, its rules override this Master. Otherwise use Master exclusively.")
    lines.append("")
    lines.append("---")
    lines.append(f"**Project:** {project}  ")
    lines.append(f"**Generated:** {timestamp}  ")
    lines.append(f"**Category:** {design_system.get('category', 'General')}  ")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Color Palette")
    lines.append("")
    lines.append("| Role | Hex | CSS Variable |")
    lines.append("|------|-----|--------------|")
    for label, key, css_var in [
        ("Primary", "primary", "--color-primary"),
        ("On Primary", "on_primary", "--color-on-primary"),
        ("Secondary", "secondary", "--color-secondary"),
        ("Accent/CTA", "accent", "--color-accent"),
        ("Background", "background", "--color-background"),
        ("Foreground", "foreground", "--color-foreground"),
        ("Muted", "muted", "--color-muted"),
        ("Border", "border", "--color-border"),
        ("Destructive", "destructive", "--color-destructive"),
        ("Ring", "ring", "--color-ring"),
    ]:
        hv = colors.get(key, "")
        if hv:
            lines.append(f"| {label} | `{hv}` | `{css_var}` |")
    lines.append("")
    lines.append("## Typography")
    lines.append(f"- **Heading:** {typography.get('heading', 'Inter')}")
    lines.append(f"- **Body:** {typography.get('body', 'Inter')}")
    if typography.get("google_fonts_url"):
        lines.append(f"- **Google Fonts:** {typography.get('google_fonts_url', '')}")
    lines.append("")
    default_spacing = DIAL_TIERS["density"][1][2]["spacing"]
    scale = spacing_scale or default_spacing
    lines.append("## Spacing")
    lines.append("| Token | Value |")
    lines.append("|-------|-------|")
    for token in ("xs", "sm", "md", "lg", "xl", "2xl", "3xl"):
        lines.append(f"| `--space-{token}` | `{scale[token]}` |")
    lines.append("")
    lines.append("## Component Specs")
    lines.append("")
    lines.append("### Buttons")
    lines.append("```css")
    lines.append(".btn-primary {")
    lines.append(f"  background: {colors.get('cta', '#F97316')};")
    lines.append("  color: white; padding: 12px 24px; border-radius: 8px;")
    lines.append("  font-weight: 600; transition: all 200ms; cursor: pointer;")
    lines.append("}")
    lines.append(".btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }")
    lines.append("```")
    lines.append("")
    lines.append("### Cards")
    lines.append("```css")
    lines.append(".card {")
    lines.append(f"  background: {colors.get('background', '#FFF')};")
    lines.append("  border-radius: 12px; padding: 24px;")
    lines.append("  box-shadow: 0 4px 6px rgba(0,0,0,0.1);")
    lines.append("  transition: all 200ms;")
    lines.append("}")
    lines.append(".card:hover { box-shadow: 0 10px 15px rgba(0,0,0,0.1); }")
    lines.append("```")
    lines.append("")
    lines.append("## Style")
    lines.append(f"**{style.get('name', 'Minimalism')}**")
    if effects:
        lines.append(f"  Effects: {effects}")
    lines.append("")
    lines.append("## Anti-Patterns")
    if anti_patterns:
        for a in anti_patterns.split("+"):
            a = a.strip()
            if a:
                lines.append(f"- {a}")
    lines.append("")
    lines.append("## Pre-Delivery Checklist")
    lines.append("- [ ] No emojis as icons")
    lines.append("- [ ] cursor-pointer on clickable")
    lines.append("- [ ] Hover states 150-300ms")
    lines.append("- [ ] Contrast 4.5:1 minimum")
    lines.append("- [ ] Focus states visible")
    lines.append("- [ ] prefers-reduced-motion")
    lines.append("- [ ] Responsive 375/768/1024/1440px")
    lines.append("")
    return "\n".join(lines)


def format_page_override_md(design_system, page_name, page_query=None):
    project = design_system.get("project_name", "PROJECT")
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    page_title = page_name.replace("-", " ").replace("_", " ").title()
    lines = [
        f"# {page_title} Page Overrides",
        "",
        f"**Project:** {project} | **Generated:** {timestamp}",
        "",
        "> Rules here override MASTER.md for this page only.",
        "> For all other rules, refer to design-system/MASTER.md.",
        "",
        "## Page-Specific Rules",
        "",
        "- (Add page-specific deviations from Master here)",
        "",
        "### Layout",
        "- Use Master layout defaults",
        "",
        "### Colors",
        "- Use Master color palette",
        "",
        "### Typography",
        "- Use Master typography",
        "",
        "### Checklist",
        "- [ ] Verify page at 375px, 768px, 1440px",
        "- [ ] No horizontal scroll",
        "- [ ] All interactive states visible",
        "- [ ] Contrast passes WCAG AA",
        "",
    ]
    return "\n".join(lines)
