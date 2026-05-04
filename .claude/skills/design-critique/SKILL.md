---
name: design-critique
description: "Score design variants against the 9-dimension rubric. Evaluation act — separate from production. Same designer agent, different cognitive mode."
argument-hint: "[workpackage-id]"
user-invocable: true
min_tool_calls: 8
---

# Design Critique

**Why:** The mind that just created variants cannot objectively score them. Switching to evaluation mode — even within the same session — requires a deliberate cognitive break. This skill is that break.

This is the **evaluation** counterpart to `/design` (production). Same designer agent, different cognitive mode. `/design` generates variants; `/design-critique` scores them. They run as sequential skill invocations — never in the same act.

## When This Runs

- **In the pipeline:** immediately after `/design`, before `/architecture`. Same designer session.
- **On explicit `/design-critique <workpackage-id>`:** full audit of variants at `plans/<workpackage-id>/design/<variant-slug>/`.
- **Post-implementation:** score rendered TSX against the approved mockup (pairs with `/visual-polish`).

## Required Reading (Before Scoring)

Read these before critiquing:

1. `packages/design-system/AESTHETICS.md` — source of truth for token values + AI-aesthetic catalog.
2. `packages/design-system/PRINCIPLES.md` — seven universals.
3. `packages/design-system/DESIGN.md` — token reference (surfaces, accents, spacing, radii, motion).
4. `packages/design-system/src/tokens.css` — actual values.
5. `.claude/rules/aesthetic-quality.md` — hard rules (AQ-001..AQ-113).

Deep reference, only when the dimension is in scope: `references/hierarchy.md`, `spacing.md`, `typography.md`, `color.md`, `finishing.md`.

## The Critique Loop

Read the variants produced by `/design` at `plans/<workpackage-id>/design/<variant-slug>/`.

```
1. Screenshot each variant's mockup.html (or read its spec.md if no mockup)
2. Score it (0-10) against the 9 dimensions below
3. List specific findings (CRITICAL / WARNING / SUGGESTION)
4. Fix the highest-priority issue
5. Re-screenshot and re-score
6. Repeat until score >= 7 or 4 iterations reached
```

Variants below 5 fail and get regenerated; variants 5-7 get noted findings; variants ≥7 advance. If all variants score below 5, the brief was wrong — go back to `/design` Phase 0 and re-interrogate. Do not push weak variants into the comparison.

**Read screenshots, not code, when scoring.** Reading code to score visual hierarchy is theatre.

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
- **Cross-component consistency:** Does this component apply borders, spacing, radii, and typography the same way as other components in the same context?
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
- Are any blacklisted patterns present? (See AESTHETICS.md § AI-Aesthetic Anti-Patterns — the canonical 15-item catalog; AQ-101..AQ-113 in `aesthetic-quality.md`)
- Does the component have a distinctive, intentional design — or is it the "safe default"?
- **Screenshot rubric:** three or more screenshot-detectable tells (#1, #2, #4, #5, #7, #10, #13, #14, #15) in a single frame fails the screenshot.
- **Smell:** Purple gradients. Centered hero layout. Emoji icons. Generic card grid. Oversized padding. `rounded-2xl`. Glass morphism. Gradient-on-text. Full-bleed accent nav.

### 9. Premium Polish
Tied to the AESTHETICS.md "Premium" checklist and the recommendations tables.

- **Tabular numerals** on numeric KeyValue / table cells (`font-variant-numeric: tabular-nums`) — AQ-006.
- **Letter-spacing** `+0.02em` on uppercase StatusChip/Tag labels — AQ-007.
- **Density-tier coherence:** compact = default × 0.75, comfortable = default × 1.25, both rounded to 4px — AQ-003.
- **Motion timing** uses `--motion-fast/medium/slow` with cubic-bezier(0.2, 0, 0, 1) easing — AQ-013; `prefers-reduced-motion` respected — AQ-014.
- **Hover/focus/pressed** states defined for every interactive primitive: hover = +1 surface step, focus = 2px outset ring on `--primary` at 60%, pressed = -1 step.
- **Touch target ≥ 44 CSS px** at viewport ≤ 1024 px on every interactive element — AQ-015.
- **Mobile inputs ≥ 16px** font-size at viewport ≤ 768 px — AQ-005.
- **Halation guard:** no pure `#000` background; `--text-hi` is off-white not `#fff` — AQ-009.
- **Smell:** numeric columns visibly jitter, status chips at default tracking, hover with no transition, focus rings invisible, mobile input zooms iOS, motion ignores reduced-motion preference.

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
## Design Critique: [ComponentName/WorkpackageId]

DESIGN-CRITIQUE: variant=<slug> score=<int>/10  rounds=<n>  axes: H:_ S:_ T:_ C:_ Co:_ St:_ A:_ AS:_ PP:_

### CRITICAL
- [file:line] Description of issue → specific fix

### WARNING
- [file:line] Description of issue → specific fix

### SUGGESTION
- [file:line] Description of issue → specific fix

### What's Working Well
- List 1-2 things the component does right (reinforces good patterns)
```

The retro reads `rounds=<n>` to track design-quality drift over time.

## Screenshot Workflow

When the dev server is running (`bun dev` on :5173):

```bash
# Screenshot a specific component
cd packages/web && npx playwright screenshot \
  "http://localhost:5173/designsystem#ComponentName" \
  /tmp/critique-ComponentName.png \
  --wait-for-timeout=2000

# Screenshot an HTML mockup
npx playwright screenshot \
  "file://<absolute-path>/mockup.html" \
  /tmp/critique-mockup.png \
  --wait-for-timeout=1000
```

Read the screenshot. Evaluate it visually. Do not evaluate design from code alone.

## Tailwind Anti-Patterns

Flag — each maps to an AQ rule in `.claude/rules/aesthetic-quality.md` and an upcoming K6 ESLint slug.

**Tokens / scale violations:**
- Raw Tailwind color classes (`text-gray-400`, `bg-slate-800`, `text-indigo-500`, `border-white/10`) → AQ-008, `design/no-raw-tailwind-color`.
- Hardcoded hex / `rgb()` / `hsl()` values in `*.tsx` outside `tokens.css` → AQ-008, `design/no-hardcoded-color`.
- Non-4px-grid spacing (`p-7`, `gap-5`, `m-[7px]`) → AQ-001, `design/no-off-grid-spacing`.
- Off-scale radius (`rounded-2xl`, `rounded-3xl`, `rounded-[10px]`) — allow `rounded-full` for pills only → AQ-011 / AQ-101, `design/no-off-scale-radius` + `design/no-ai-aesthetic`.
- Off-scale font-size (`text-[15px]` outside the closed allowlist) → AQ-004, `design/no-off-scale-font-size`.
- Off-scale motion (`duration-[120ms]`, bare `ease`) → AQ-013, `design/no-off-scale-motion`.
- Inline `style={}` attributes for color / spacing / radius / font.

**AI-aesthetic tells** (see AESTHETICS.md § AI-Aesthetic Anti-Patterns; canonical 15-item catalog):
- `bg-gradient-(to|from|via)-(indigo|purple|violet|fuchsia|pink)-\d{3}` → AQ-102.
- `p-8` / `p-10` / `p-12` / `p-14` / `p-16` outside hero/expressive contexts → AQ-103.
- Hero section pattern in `packages/web/src/pages/work/**` → AQ-104.
- Leading emoji in `Button` / `NavItem` / `StatusChip` text → AQ-105.
- Page-level `text-center` or `mx-auto` on body content (allow inside `EmptyState` / `Modal` / `Dialog` / `Toast`) → AQ-106.
- `backdrop-blur` / `backdrop-filter` and `bg-(white|black)/\d+` translucent card chrome → AQ-107.
- `grid-cols-3` with `.map(` over identical card children outside dashboard contexts → AQ-108.
- `shadow-lg` / `shadow-xl` / `shadow-2xl` outside files matching `Modal|Dialog|Popover|Tooltip` → AQ-012 / AQ-110-overlay.
- `Lorem ipsum` / `consectetur adipiscing` / `Click here` placeholder copy → AQ-109.
- Marketing superlatives in product chrome (`Effortless`, `Seamless`, `Powerful`, `Beautiful`, `Stunning`, `Game-changing`) → AQ-110.
- `bg-clip-text text-transparent` over a gradient on product headings → AQ-111.
- NavRail / Sidebar root using `bg-(indigo|purple|teal|emerald|sky|violet)-\d{3}` → AQ-112.
- Every list row carries a leading icon when content does not require one → AQ-113.

**Premium-polish absences** (Dimension 9):
- Numeric tables / KeyValue lacking `tabular-nums` → AQ-006.
- Uppercase labels (StatusChip / Tag) lacking `tracking-wide` or `tracking-[0.02em]` → AQ-007.
- `<input>` / `<textarea>` / `<select>` lacking `text-base` / `text-[16px]` at the mobile breakpoint → AQ-005.
- Interactive elements with `min-h` / `h` < 44px at viewport ≤ 1024 px → AQ-015.
- `transition:` / `animation:` not derived from `var(--motion-*)` → AQ-013 / AQ-014.

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

## Target

$ARGUMENTS
