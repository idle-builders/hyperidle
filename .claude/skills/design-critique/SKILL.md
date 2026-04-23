---
name: design-critique
description: "Design quality expert. ALWAYS invoke this skill when creating, editing, or reviewing UI components, styles, or layouts. Do not write UI code without checking design quality. Evaluates visual hierarchy, spacing, color, typography, density, and aesthetic coherence against the design system principles."
argument-hint: "[component-name|file-path|all]"
user-invocable: true
---

# Design Critique

Continuous design quality gate. Runs whenever UI code is created or modified. Produces a quality score (0-10), specific findings, and concrete fixes.

## When This Runs

- **Before writing UI code:** Read the principles, check existing component patterns, then write.
- **After writing UI code:** Screenshot the result, critique it, fix issues, re-screenshot.
- **On explicit `/design-critique`:** Full audit of specified components or all changed files.

## Required Reading (Before Any UI Work)

1. `packages/design-system/PRINCIPLES.md` — The seven universals + surprise principles
2. `packages/design-system/DESIGN.md` — Token reference (surfaces, accents, text, spacing, radii, motion)
3. `packages/design-system/src/tokens.css` — Actual token values

For deeper reference on specific topics, read from `references/`:
- `references/hierarchy.md` — Visual hierarchy tactics
- `references/spacing.md` — Spacing systems and density
- `references/typography.md` — Type scale and font usage
- `references/color.md` — Color usage and dark mode
- `references/finishing.md` — Polish, shadows, borders, and micro-details

## The Critique Loop

```
1. Read the component code
2. Screenshot it (Playwright or dev server)
3. Score it (0-10) against the 8 dimensions below
4. List specific findings (CRITICAL / WARNING / SUGGESTION)
5. Fix the highest-priority issue
6. Re-screenshot and re-score
7. Repeat until score >= 7 or 4 iterations reached
```

## Scoring Dimensions (0-10 each, averaged)

### 1. Visual Hierarchy
- Is there a clear reading order? Can you identify primary, secondary, tertiary content at a glance?
- Are titles/values visually heavier than labels/metadata?
- Does the eye flow naturally from most important to least important?
- **Smell:** Everything at the same visual weight. Multiple elements competing for attention.

### 2. Spacing & Density
- Does spacing follow the 4px grid and density tokens?
- Is density appropriate for the context? (Lists = dense, detail views = spacious)
- Are related items grouped tightly and unrelated items separated?
- **Smell:** Arbitrary padding values. Uniform spacing everywhere. Too much or too little breathing room.

### 3. Typography
- Are font sizes from the type scale? (11/12/13/14/18/24px)
- Are font weights limited to 400/500/600?
- Is line height appropriate? (1.4-1.6 body, 1.2-1.3 headings)
- Is monospace used correctly? (Data values, IDs, timestamps — not body text)
- **Smell:** More than 2 font families. More than 3 weights visible. Cramped or floaty line height.

### 4. Color Usage
- Is color used for meaning, not decoration?
- Are all colors from the token palette?
- Does every colored element have a non-color signal too? (Shape, text, icon)
- Is the contrast ratio >= 4.5:1 for all text?
- **Smell:** Colors not in the palette. Color as the sole differentiator. Decorative color.

### 5. Component Coherence & Consistency
- Does the component use design system tokens consistently?
- Are hardcoded values (hex colors, px spacing, raw font sizes) present? They shouldn't be.
- Does the component compose from existing primitives where possible?
- **Cross-component consistency:** Does this component apply borders, spacing, radii, and typography the same way as other components in the same context? (e.g., all list pages should use the same section header style, all cards should use the same border treatment)
- **Smell:** Hardcoded #hex values. `p-8` instead of density tokens. Re-implementing what a Tier 1 primitive already does. Borders used differently than sibling components. Mixed radii in the same view.

### 6. States & Feedback
- Does the component handle all states? (Default, hover, focus, active, disabled, loading, empty, error)
- Are transitions using motion tokens? (fast/medium/slow)
- Do interactive elements have visible hover/focus states?
- **Smell:** Missing hover state. No focus ring. Instant state change with no transition. Missing empty/error states.

### 7. Accessibility
- Are focus rings visible?
- Is keyboard navigation supported?
- Do images/icons have alt text or aria-labels?
- Are roles and aria attributes correct?
- **Smell:** `outline: none` without replacement. Missing aria-labels. Non-semantic elements used as buttons.

### 8. Anti-Slop Check
- Does this look like every other AI-generated dashboard? If yes, it fails.
- Are any blacklisted patterns present? (See PRINCIPLES.md AI Aesthetic Blacklist)
- Does the component have a distinctive, intentional design — or is it the "safe default"?
- **Smell:** Purple gradients. Centered hero layout. Emoji icons. Generic card grid. Oversized padding.

## Scoring Guide

| Score | Meaning | Action |
|-------|---------|--------|
| 9-10 | Exceptional | Ship it. This would impress a design-conscious user. |
| 7-8 | Good | Minor polish items. Acceptable for production. |
| 5-6 | Mediocre | Needs work on 2-3 dimensions before shipping. |
| 3-4 | Poor | Structural issues. Rethink the approach. |
| 0-2 | AI Slop | Start over. This looks like generic AI output. |

## Output Format

```
## Design Critique: [ComponentName]

**Score: X/10** (H:_ S:_ T:_ C:_ Co:_ St:_ A:_ AS:_)

### CRITICAL
- [file:line] Description of issue → specific fix

### WARNING  
- [file:line] Description of issue → specific fix

### SUGGESTION
- [file:line] Description of issue → specific fix

### What's Working Well
- List 1-2 things the component does right (reinforces good patterns)
```

## Screenshot Workflow

When the dev server is running (`bun dev` on :5173):

```bash
# Screenshot a specific story
cd packages/web && npx playwright screenshot \
  "http://localhost:5173/designsystem#ComponentName" \
  /tmp/critique-ComponentName.png \
  --wait-for-timeout=2000

# Screenshot an HTML component
cd packages/web && npx playwright screenshot \
  "http://localhost:8098/ComponentName.html" \
  /tmp/critique-ComponentName-html.png \
  --wait-for-timeout=1000
```

Read the screenshot. Evaluate it visually. Do not evaluate design from code alone.

## Tailwind Anti-Patterns

Flag raw Tailwind color classes (`text-gray-400`, `bg-slate-800`), non-4px-grid spacing (`p-7`, `gap-5`), wrong radii (`rounded-2xl`), off-scale font sizes, inline `style={}` attributes, and arbitrary border colors (`border-white/10`). All must use design system tokens.

## Consistency & Component Reuse

When reviewing multiple components or `all`, evaluate cross-cutting consistency:

- **Same role, same treatment.** Section headers, card borders, list items, dividers, hover states — if two components serve the same visual role, they must look identical. Divergence is a finding.
- **Component reuse over inline reimplementation.** The design system has primitives (Tier 1), blocks (Tier 2), regions (Tier 3), and utilities (EmptyState, ErrorState, Skeleton). Read `packages/design-system/src/` to know what exists. Reimplementing any of these inline is **CRITICAL**.
- **Token compliance.** Every color, spacing value, radius, and font size must trace back to a design token. Read `packages/design-system/DESIGN.md` for the canonical values.

## Style Variant Awareness

The design system may have multiple style variants (themes) defined in `packages/design-system/html/themes/`. When critiquing:
- Evaluate against the currently active theme's tokens
- Note if a design choice would break under a different theme
- Check that the component uses semantic tokens (not hardcoded values) so it's theme-portable
