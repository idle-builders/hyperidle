# Design Principles

Universal principles distilled from Apple HIG, Material Design, Linear, Stripe, Vercel/Geist, IBM Carbon, Shopify Polaris, Ant Design, Atlassian, and Radix/shadcn. These guide every component decision in this design system.

---

## Hearth Design Principles

HyperIdle uses the **Hearth** design language. These four principles are the opinionated application of the universal principles below — they sit above the universals as the product's aesthetic stance, not replacing them.

### 1. Warmth signals trust

Crème lemon surfaces, warm shadows, and earthy tones create an inviting, energetic atmosphere. Software used all day should feel like a place you want to be, not a sterile tool. Every color is tinted warm — no cool grays, no blue-gray neutrals, no slate. The Hearth palette vocabulary: **Paper** (surface-page #fcf8e8), **Linen** (surface-container #f6f0d8), **Card** (surface-elevated #ffffff), **Lemon** (accent-primary #f0c419 — the fill accent), **Cocoa** (accent-deep #6f4d1e — the text accent), **Amber** (accent-secondary #d97706), **Earth** (text-primary #2a2415).

Three variables generate the entire theme: pale lemon base (#fcf8e8), lemon-drop accent (#f0c419, with cocoa #6f4d1e for text roles), warm earth text (#2a2415). Everything derives from these.

### 2. Status through content

Colored dots, pill badges, and text color carry meaning — not thick structural borders. Cards stay structurally uniform. Status is communicated through what is inside the card, not welded to its edges. The exception: toasts use a thin left-border accent (1.5px) as the only structural status signal. Hearth uses chromatic status: green success, amber warning, red error, blue info.

### 3. Generous rounding

16px default radius and pill-shaped buttons create a soft, approachable feel. Containers hold content gently, not boxing it in. Even small elements get 10px radius. The radius scale is deliberately sparse: **none** (0), **subtle** (10px), **default** (16px), **pill** (9999px). There is no 4px or 8px step. **Exception:** Form control chrome (checkboxes, radio buttons) may use off-scale radii because their radius is an intrinsic physical property of a small control, not a compositional design decision.

### 4. Mixed hierarchy

Shadows AND borders AND tints work together. Different elements use different strategies depending on their role — no single dogmatic approach. Cards get `--shadow-default`. Flat cards use border + container background. Toast uses left-border accent. This variety is the signature, not inconsistency.

---

## The Seven Universals

### 1. Clarity Above All

Every element must be immediately understandable. Legible text, unambiguous labels, sharp icons, and strong visual hierarchy. If a user has to stop and parse what they're looking at, the design failed.

**Test:** Can someone scanning for 3 seconds identify what this component does and what state it's in?

### 2. Hierarchy Through Weight, Not Decoration

Use size, font weight, contrast, and spacing to create reading order. Never rely on borders, backgrounds, or decorative elements as the primary hierarchy mechanism.

**The Linear rule:** "When everything appears equally important, nothing stands out." In a dense interface, deliberately make navigation and supporting chrome recede while keeping task-central content at full visual weight.

**Levers (in priority order):**
1. Font size and weight
2. Text color/opacity
3. Spacing and proximity
4. Background contrast / shadow / border (used flexibly per element role — in Hearth, these participate equally rather than as last resort; see Hearth Principle 4: Mixed Hierarchy)

### 3. Restraint Is the Whole Game

Perfection is when there is nothing left to take away (Saint-Exupery, via Ant Design). Every element must earn its place. Decoration without function is noise.

**Practical rules:**
- One accent family for interaction: lemon drop (`--accent-primary`) for fills, cocoa/beige (`--accent-deep`) for text and icons. Amber is a secondary accent for attention-drawing elements (budget badges) — it doubles as status-warning, but its role as accent-secondary is an accent role, not a status decoration.
- Two typeface families maximum. Hierarchy through weight, not family switching.
- Composition spacing comes from the closed `0 / 3 / 6 / 9 / 12 / 18 / 24 / 36 / 48px` vocabulary. Proximity is proportional guidance, not a one-value-per-noun lookup: close relations normally use `3–9px`, related groups `12–18px`, and major vertical sections `24–36px`; `48px` is exceptional. Density, typography, boundaries, surfaces, wrapping, and viewport determine the endpoint within a range.
- Color reserved for meaning. The default state is warm-neutral; color signals "pay attention here."

### 4. Content First, Chrome Last

The UI is a servant, not a star. UI elements (navigation, toolbars, sidebars) should recede so the user's content and tasks take center stage.

**Apple calls it Deference.** Linear calls it "a calmer interface." Vercel achieves it through radical reduction. The mechanism varies; the principle is the same: the thing you're working on should have more visual weight than the thing surrounding it.

### 5. Consistency Serves Users, Not Bureaucracy

Shared patterns, predictable behavior, and coherent visual language reduce cognitive load. But never be consistent for consistency's sake (Atlassian). If a pattern doesn't serve the user's context, break it deliberately.

**Test:** If a user learns how X works in one place, can they predict how it works everywhere?

### 6. Meaningful Feedback Always

Every user action deserves perceptible acknowledgment. Motion communicates state changes and spatial relationships. But animation must be functional -- avoid excessive animations that don't add value (Ant Design).

**Rules:**
- Interactive elements show hover/focus/active states
- State changes animate to show what happened (not just the end state)
- Loading states match the shape of what's loading (skeleton, not spinner)
- Error states explain what went wrong AND what to do about it

### 7. Accessibility Is Structure, Not Retrofit

Build accessibility into primitives, not as a layer on top (Radix). Color is never the only signal for meaning. Keyboard navigation is a first-class interaction model, not an afterthought.

**Non-negotiable:**
- 4.5:1 contrast ratio minimum for all text
- Focus rings visible on all interactive elements
- Status communicated through color + shape + text (never color alone)
- Touch/click targets minimum 44px in the relevant dimension

---

## The Surprise Principles

Insights from 1-2 design systems that produce outsized results.

### S1. Not Every Element Deserves Equal Polish (Linear)

In dense interfaces, deliberately dim the supporting chrome. Navigation labels, timestamps, secondary metadata -- these should be visually quiet. Only the primary content (titles, status, key values) gets full visual weight.

This is counterintuitive: most design systems try to make everything equally well-designed. Linear says: design a visual hierarchy where some things are intentionally muted.

### S2. Three Variables Generate an Entire Theme (Linear)

Define only: base color, accent color, and contrast level. Derive all other tokens algorithmically. This prevents token bloat and ensures internal consistency. When you hand-pick 40+ colors, inconsistencies are inevitable.

### S3. Beauty Has Business Value (Stripe)

"Craft and beauty are not just nice to have, but are material to increasing the utility and usability of a product." Aesthetic quality builds trust, attracts users, and motivates engagement. The MVQP (Minimum Viable Quality Product) principle: ship with refinement, not just functionality.

### S4. Warm Neutrals for Long Sessions — This IS Hearth (Linear)

Cool blue-grays become fatiguing during extended use. Warm grays feel crisp but inviting. Too warm becomes muddy. This temperature calibration is subtle but critical for dark-mode productivity tools where users spend hours. **S4 is not just a surprise principle for HyperIdle — it is the living expression of Hearth.** The entire Hearth palette (crème lemon surfaces, lemon-drop + cocoa accents, warm earth text) is the production expression of this principle. See Hearth Principle 1: Warmth signals trust.

### S5. Opinionated Beats Flexible (Linear, Atlassian)

One excellent default path produces better outcomes than infinite customization. Flexible software lets everyone invent their own workflows, creating chaos as teams scale. Purpose-built means fewer choices, faster comprehension.

### S6. Code Ownership Over Dependency (shadcn/ui)

The most popular modern component approach rejects the library model. You own the code, not a package dependency. This means customization is editing your own code, not fighting library constraints.

---

## What Makes UI Feel Premium

**Premium signals:**
- Intentional whitespace (not emptiness -- structured breathing room)
- Typography as the primary design element
- Consistent spacing rhythm (mathematical grid)
- Restrained color palette (1-2 accent colors against neutrals)
- Smooth, purposeful transitions (appropriately timed, not flashy)
- Performance as design (fast load, instant response, no jank)
- Micro-detail attention (copy quality, icon alignment, hover states, focus rings)

**Cheap signals:**
- Inconsistent spacing
- Too many competing colors
- Unclear hierarchy (everything screams for attention)
- Missing feedback (clicks with no response)
- Decorative elements serving no purpose
- Poor typography (too many fonts, bad sizing, inadequate line height)
- Visible performance issues (layout shifts, spinners, delays)

---

## Data-Dense Application Principles

These apply specifically to dashboards, productivity tools, and developer tools.

### D1. Variable Density by Zone

Navigation is always compact. Content density adapts to context. A task list can be dense; a detail view should breathe. Don't apply one density rule to the entire interface.

### D2. Consistent Vertical Rhythm

Strict row heights make scanning fast. When every row is exactly 32px or 40px, the eye tracks vertically at speed. Subtle alternating backgrounds (2% luminance difference) help track rows without borders.

### D3. Progressive Disclosure Over Upfront Density

Show summary-level data first, detail on demand. The most important information should be accessible within 3 seconds. Drill-down reveals the rest.

### D4. Keyboard-First for Power Users

In productivity tools, keyboard shortcuts are the primary interaction model. Nearly everything should be accessible without a mouse. Command palettes, vim-style navigation, clear focus indicators.

### D5. Semantic Color Tokens Are Non-Negotiable

Name colors for purpose (`surface-primary`, `error-border`), not appearance (`blue-500`). This enables theming, dark mode, and accessibility modes without refactoring components.

### D6. Four Surface Levels Minimum for Dark Mode

Base, primary elevated, secondary elevated, and overlay. Use surface lightness to communicate elevation (closer to user = lighter, simulating overhead light). Shadows don't read on dark backgrounds.

---

## The AI Aesthetic Blacklist

The canonical 15-item catalog lives in **`AESTHETICS.md` § AI-Aesthetic Anti-Patterns**, with screenshot-vs-code detectability split, citations, and lint hints. The hard rules are mirrored in `.claude/rules/aesthetic-quality.md` (AQ-101..AQ-113) and enforced by the `design/no-ai-aesthetic` lint slug shipping in K6. Three or more screenshot-detectable tells in a single frame fails the screenshot rubric. Read the catalog there; do not re-summarize it here.

---

## Typography Is 95% of Design

Typography carries ~95% of web design information. It is the primary interface, not one element among many.

**Rules:**
- Maximum 2 typeface families. More looks sloppy.
- A type scale creates visual rhythm. Size + weight + spacing work together for hierarchy before any other design element.
- Line height matters enormously: 1.4-1.6 for body text. Too tight is claustrophobic; too loose breaks reading rhythm.
- Monospace for technical content (IDs, timestamps, metrics) signals precision and enables alignment.
- Weight range: 400 (body), 500 (emphasis/labels), 600 (headings), 700 (page titles / brand headings). Using more than 3-4 weights in one view is a smell.

---

## Color Beyond Contrast Ratios

- Separate brand colors from functional colors. Brand expresses identity; functional handles usability signals.
- Color should never be the only signal for meaning. Always pair with icon, text, or shape for accessibility.
- In dark mode, avoid pure black (#000) backgrounds. Hearth Dark uses #1a1510 — a warm earth base that avoids halation while maintaining the warm palette.
- Status colors: Hearth uses chromatic status — green (#16764f light / #2eaa7a dark) for success, amber (#d97706) for warning, red (#dc4a3a light / #ee6a5a dark) for error, blue (#2e7dba light / #4498d4 dark) for info. Desaturate slightly in dark mode so they communicate meaning without being garish.

---

## Motion That Helps vs. Motion That Hurts

- Motion's advantage and drawback are the same: it attracts attention. Irrelevant motion is worse than no motion.
- Speed: 100-150ms for micro-interactions (hover, focus). 200-300ms for state changes (expand, collapse). Never exceed 400ms for UI transitions.
- Skeleton loaders matching the layout shape, not generic spinners.
- GPU-accelerated properties only (transform, opacity). Never animate width, height, or position.
- Respect `prefers-reduced-motion`.
