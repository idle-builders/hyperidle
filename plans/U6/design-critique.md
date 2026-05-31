# U6 Design Critique -- App Shell: Sidebar + Main (Layout Restructure)

DESIGN-CRITIQUE: variant=approved score=8/10  rounds=1  axes: H:8 S:8 T:8 C:9 Co:8 St:8 A:7 AS:9 PP:7

---

## Process Quality

The design process is thorough. Three genuinely differentiated variants were explored along orthogonal axes (hierarchy treatment, density philosophy, CoC trigger location, settings pattern, wordmark treatment). The brief correctly classified the workpackage as `novel`. The comparison table is detailed and the synthesis document explains every pull-from and rejection with spec citations. The approved design is not simply "Variant C with tweaks" -- it takes Variant A as the structural base and cherry-picks specific elements from B (merged section header) and C (wordmark, bottom area, active sub-item pill), with clear rejection rationale for each discarded element.

---

## Dimension Scores

### 1. Visual Hierarchy -- 8/10

The approved design establishes a clear three-level reading order: brand wordmark (quiet, present-but-not-dominant) > section headers (mono caps with icon, clickable) > sub-items (indented, smaller text, no icon). The merged section-header-as-nav-item pattern (from Variant B) eliminates the redundant "All Conversations" / "Portfolio" primary NavItem, saving 3 rows of vertical space while preserving scannability.

The active sub-item treatment (elevated bg + shadow-subtle + left border accent) creates a visible "pill" effect that pops from the surrounding flat items, addressing Variant A's weakness of "everything looks the same."

Section headers at 12px mono uppercase with icon provide strong visual grouping without consuming too much vertical space. The dividers between sections (border-subtle + 6px margin) are a correct choice over spacing-only separation at 200px width.

**WARNING**: The bottom strip has two rows (CoC trigger + settings/avatar) that are functionally different from section items but share similar visual weight (both are 32px min-height button rows with icon + text). The settings row (avatar + gear icon) could be confused with a section header at a glance. The approved design differentiates them via the border-top divider above the bottom strip, which is adequate but not strongly hierarchical.

### 2. Spacing & Density -- 8/10

All spacing values trace to the token system. Section headers at 6px/16px padding, sub-items at 40px left indent, dividers at 6px margin/padding, brand wordmark at 12px/16px padding. The 200px fixed width is spec-mandated and does not use density tokens (correctly, per the architecture plan's density resolution).

Sub-items correctly use NavItem which consumes density tokens automatically. The sidebar is correctly classified as mixed density: width is static, content rows are density-aware.

**SUGGESTION**: The brand wordmark padding (12px/16px) uses literal values, not density tokens. This is acceptable for brand chrome (density-static per AESTHETICS.md precedent with IconRail), but the design doc should explicitly state this is density-static to prevent future density-token creep into the wordmark area.

### 3. Typography -- 8/10

The type scale uses all approved sizes: brand wordmark at 14px/--fw-medium (sans), section headers at 12px mono uppercase with --tracking-caps, sub-items at 13px, count badge at 11px mono. All weights are within the 400/500/600 scale. The font-family assignments are correct: sans for the wordmark (explicitly rejecting Variant A's mono-caps "HYPERIDLE" treatment), mono for section headers and count badges.

The synthesis document's rationale for sans wordmark over mono is well-argued: mono-caps "HYPERIDLE" looks too austere (documented weakness of Variant A's screenshot), while sans medium is "present without shouting."

**WARNING**: The design specifies the count badge font as "font-mono 11px" with `background color-mix(text-secondary 8%, transparent)`. The `color-mix` pattern is already used in NavItem's count chip -- good reuse. However, the count badge on section headers should explicitly state that it uses `--r-pill` for border-radius to match the NavItem chip pattern.

### 4. Color Usage -- 9/10

All colors are from the Hearth token palette. No hardcoded hex values. Color serves meaning throughout:
- `--accent-primary` for active section icon and selected sub-item left border
- `--text-primary` / `--text-secondary` / `--text-tertiary` for the three-level text hierarchy
- `--border-subtle` for dividers
- `--accent-primary-dim` for hover states
- Status dots use semantic `--status-*` tokens via NavItem's existing `statusDot` prop

The design explicitly avoids decorative color: the sidebar background is `--surface-container` (warm cream/earth, not a colored accent), which aligns with AQ-112 (no full-bleed accent nav). The CoC trigger icon changes to `--accent-primary` when overlay is open -- color-as-state, not decoration.

### 5. Component Coherence & Consistency -- 8/10

The design correctly reuses NavItem for all sub-items (zero new components added to the 19-component budget). Section headers use DaisyUI primitives (`btn`, `badge`) and semantic tokens. The sidebar is classified as Tier 3 shell composition (same tier as the deleted Submenu/Rail), living in `packages/web/src/shell/`.

The bottom strip pattern (CoC trigger row + settings row) is consistent with the section header treatment: both are button elements with icon + text at 32px min-height. The divider-above-bottom-strip mirrors the dividers between sections.

**WARNING**: The design specifies sub-item NavItems with styling overrides: `padding-left: 40px`, `font-size: 13px`, `min-height: 28px`. NavItem does not currently accept className overrides -- its `baseClasses` are hardcoded. The design should note that either (a) NavItem needs a `className` prop added, or (b) the sub-item wrapper div applies the indentation and the NavItem renders at default sizing within a constrained container. This is an implementation detail the architect must resolve, but the design should flag it.

### 6. States & Feedback -- 8/10

All four states per section are defined: empty (descriptive text in `--text-tertiary` 12px), loading (skeleton lines at sub-item indentation), error ("Failed to load" in `--status-error` + "Retry" link), populated (NavItem sub-items). The state table in the approved design is comprehensive.

Global states are well-defined: settings open (body replaced by settings nav, brand + bottom strip persist), CoC overlay open (trigger gets aria-expanded + accent-primary icon color), desktop (always visible), mobile (drawer overlay, out of scope but planned).

Hover states use `--accent-primary-dim` on all interactive elements. Active section header differentiates from inactive via icon color (tertiary->accent-primary), label color (secondary->primary), and font weight (medium->semibold). Active sub-item uses elevated bg + shadow + left border.

**SUGGESTION**: The design does not explicitly specify a transition duration for section header active-state changes (icon color, text color, font weight). Font-weight transitions can cause layout jank at 200px width (text reflow). The design should note that font-weight change is instant (no transition) to avoid jank, while background/color transitions use `--motion-fast`.

### 7. Accessibility -- 7/10

The design specifies a complete tab order: Brand > section headers > sub-items > CoC trigger > Settings > Main. Arrow Up/Down for flat list traversal, Home/End for first/last. Escape closes settings or CoC overlay. All interactive elements are `<button>` with proper labels.

CoC trigger has `aria-label="Chief of Staff"` and `aria-expanded` tracking overlay state. Settings button has `aria-label="Settings"`.

**CRITICAL**: The design specifies sub-item min-height at 28px. At viewport <= 1024px (the AQ-015 touch-target boundary), this is below the 44px minimum. The design states mobile is out of scope for U6, but the sub-items will be interactive on all desktop viewports including tablets at 768-1024px. The density-aware NavItem would normally scale via `--density-row-h`, but the explicit 28px override locks the height below the touch-target floor. The architect must ensure that at comfortable density (auto-triggered at <=1024px), the sub-item min-height reaches 44px.

**WARNING**: Section headers at 32px min-height also fall below 44px at tablet viewports. Same resolution needed: density-aware row height must clear 44px at comfortable.

**SUGGESTION**: The design does not specify `aria-current="page"` on the active section header or active sub-item. NavItem does not currently support `aria-current`, but for navigation landmarks this is important for screen readers. The architect should add this.

### 8. Anti-Slop Check -- 9/10

Zero AI-aesthetic tells detected. The design is deliberately restrained:
- No `rounded-2xl` -- sidebar uses no large radii; sub-items use NavItem's `--r-subtle`
- No decorative gradients -- flat surface tokens throughout
- No oversized padding -- all values 6-16px
- No hero sections -- sidebar is a compact navigation
- No emoji -- all icons are 16px SVGs from VIEW_ICONS
- Sidebar background is `--surface-container`, not a colored accent
- Sub-items have NO icon (indentation handles hierarchy) -- anti-over-iconification

The wordmark treatment ("HyperIdle" in sans 14px medium) is distinctively restrained. The rejection list explicitly documents why the "H" lettermark (Variant B) was rejected (too ambiguous) and why disclosure chevrons (Variant C) were rejected (spec contradiction). These are not "safe defaults" -- they are deliberate choices with documented rationale.

### 9. Premium Polish -- 7/10

Count badges use `font-mono 11px` with `color-mix` background -- matches the existing NavItem chip pattern. Section headers use `--tracking-caps` for uppercase labels (AQ-007 compliance). Status dots use semantic tokens with NavItem's existing pattern.

Active sub-item "pill" treatment (elevated bg + shadow-subtle + left border) is a genuine premium touch that the screenshots of Variant A lacked. The wordmark in sans medium is confident without being loud.

**WARNING**: The design does not specify `font-variant-numeric: tabular-nums` for count badges on section headers. When conversation counts change (e.g., 9 -> 12), the badge width shifts. This is minor at sidebar scale but should be noted for AQ-006 compliance.

**WARNING**: The design does not mention `prefers-reduced-motion` handling. Sidebar hover transitions should inherit from `--motion-fast` which is already gated by the reduced-motion block in tokens.css, but this should be explicitly stated.

**SUGGESTION**: The pill tab bar in the main pane (filter relocation) uses `var(--motion-fast)` for background transitions but does not specify the easing function. Per AQ-013, it should be the Hearth curve `cubic-bezier(0.25, 0.1, 0.25, 1)` (or `var(--motion-ease)`).

---

## Findings Summary

### CRITICAL

1. **[approved.md:147-148] Sub-item min-height 28px violates AQ-015 touch-target floor at tablet viewports.** Sub-items override NavItem min-height to 28px, which is below 44px. At viewports 768-1024px (where comfortable density auto-triggers), the min-height must reach 44px via density tokens. The explicit 28px should be a compact/default-tier value only, with comfortable reaching the AQ-015 floor. The architect must resolve this by making the sub-item min-height density-aware rather than a fixed 28px override.

### WARNING

1. **[approved.md:145-148] NavItem does not currently accept className/style overrides for sub-item customization.** The design specifies `padding-left: 40px`, `font-size: 13px`, `min-height: 28px` on sub-items via "wrapper or className prop." NavItem's interface (`NavItemProps`) has no `className` prop. The architect must decide whether to add one or use a wrapper approach.

2. **[approved.md:99-108] Section header active-state includes font-weight change (medium->semibold).** At 200px width, font-weight transitions can cause label text to reflow. The design should specify instant weight change (no transition) to prevent layout jank.

3. **[approved.md:96-112] Section headers at 32px min-height are below AQ-015 at tablet viewports.** Same resolution as the sub-item touch-target issue.

4. **[approved.md:109] Count badge does not specify tabular-nums.** For AQ-006 compliance, count badges should use `font-variant-numeric: tabular-nums`.

5. **[approved.md:302-306] Keyboard section does not mention aria-current.** Active section header and active sub-item should carry `aria-current="page"` for screen reader navigation.

### SUGGESTION

1. **[approved.md:83-89] Brand wordmark should be explicitly classified as density-static.** Prevents future density-token creep.

2. **[approved.md:248] Pill tab bar easing function not specified.** Should reference `var(--motion-ease)`.

3. **[approved.md:148] Sub-item font-size 13px override mechanism not specified.** If NavItem renders at density-text (15px default), how is 13px achieved? Via a wrapper CSS override, a new NavItem prop, or a different density context?

---

## What's Working Well

1. **Genuine multi-variant exploration with principled synthesis.** The design does not simply pick "the best variant" -- it takes Variant A as base and cherry-picks specific improvements from B and C, with every choice documented and every rejection explained. This is how design exploration should work.

2. **Merged section-header-as-nav-item (from Variant B) is the strongest structural decision.** It eliminates 3 redundant rows (108px saved), makes the section label the primary interaction target, and keeps the sidebar compact at 200px. This is the kind of insight that comes from exploring multiple variants.

---

## Overall Assessment

**Score: 8/10 -- APPROVED with noted findings.**

The approved design is a well-synthesized, spec-faithful sidebar that makes no unnecessary additions to the component budget, correctly reuses NavItem for all sub-items, and establishes clear visual hierarchy through the three-level treatment (wordmark > section headers > sub-items). The design exploration process was thorough and the synthesis document provides strong justification for every decision.

The primary concern is the touch-target issue (sub-items at 28px, section headers at 32px) which violates AQ-015 at tablet viewports. This is a CRITICAL finding that the architect must resolve, but it does not block the design from advancing -- it is an implementation-level density concern that the density-aware NavItem system already handles if the explicit height overrides are made conditional on the density tier.
