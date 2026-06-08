# AE4 Design Critique: Mobile & Responsive Access

DESIGN-CRITIQUE: variant=drawer-sidebar score=7/10  rounds=1  axes: H:7 S:7 T:8 C:8 Co:8 St:7 A:6 AS:8 PP:7

## Context

AE4 is a form-factor adaptation, not a new component. The design surfaces are shell-level (AppShell, MobileHeader, drawer wrapper) -- Tier 3. No design-system primitives introduced. The approved direction is Variant A (drawer sidebar) with a notification dot pull-in from Variant B.

Evaluated from spec documents. No HTML mockups exist because this is layout/responsive work, not component design. This is appropriate -- shell layout specs do not need pixel mockups.

---

## Dimension Scores

### 1. Visual Hierarchy: 7/10

The mobile layout creates a clear three-tier hierarchy: (1) content area full-width, (2) mobile header as persistent orientation, (3) sidebar in drawer on demand. The decision to maximize content area for the primary triage task is correct.

**Finding (WARNING):** The `pageTitle` derivation in the mobile header is underspecified for the Work view. At `/work/portfolio`, the title should be "Work" but at `/work/team/:id` the title ideally shows the team name. The spec says "For detail routes, ideally shows the entity name" but leaves "ideally" as ambiguous. The builder will need to either fetch entity names (adding API coupling to the shell) or settle for generic titles. This should be decided now, not during implementation.

**Finding (SUGGESTION):** The notification dot (6px, `--accent-primary`) on the hamburger is the only ambient awareness signal. At the 48px scale of the hamburger button, 6px is adequate but small. Consider whether the dot needs to be 8px for thumb-at-a-glance visibility on low-DPI Android devices. Not blocking.

### 2. Spacing & Density: 7/10

Spacing values are all on the Hearth 6px grid: 48px header, 12px padding, 280px drawer width, 18px title spacing. The drawer width choice (280px vs desktop's 200px) is correct -- wider gives better touch target spacing for sub-items.

**Finding (WARNING):** The approved design says the mobile header height is `48px` but also says `paddingTop: env(safe-area-inset-top)`. If the 48px is the content height and the safe-area is additive, the total header height varies per device. The spec should clarify: is the header `48px + safe-area-inset-top` total, or is 48px the touch-area height with safe-area as additional padding above? The architecture plan answers this ("48px + safe-area-inset-top padding") but the design spec is ambiguous.

**Finding (SUGGESTION):** The `px-[12px]` on mobile thread detail headers (reduced from 24px on desktop) is correct for density, but 12px horizontal padding at 375px gives 351px of content width. Verdict buttons in RichMessageCard with `flex-wrap` will wrap at this width with 4 buttons. The design correctly calls out flex-wrap behavior but does not specify whether wrapped buttons should be full-width or stay at their natural size. This matters for the visual result.

### 3. Typography: 8/10

Type scale adherence is strong: 15px title (on-scale), 13px sub-items, 12px hints. The 16px minimum for mobile inputs (AQ-005) is called out explicitly. Font weight 600 for the title is correct.

No findings.

### 4. Color Usage: 8/10

All colors reference Hearth tokens: `--surface-elevated`, `--border-subtle`, `--text-primary`, `--text-secondary`, `--accent-primary`. The scrim color uses `rgba(26,21,16,0.55)` which matches the DESIGN.md Scrim definition but NOT the `--surface-overlay` token in tokens.css (which is `#ffffff` light / `#352e23` dark -- solid, not translucent).

**Finding (WARNING):** The design brief says "Scrim uses `--surface-overlay` token" but the architecture plan correctly identifies that `--surface-overlay` in tokens.css is a solid color, not a scrim color. DESIGN.md says `--surface-overlay` is `rgba(26,21,16,0.55)` but tokens.css disagrees. The architecture plan resolves this by using inline `rgba(26,21,16,0.55)`. This is the right call, but it means the design brief's constraint is technically violated. The tokens.css definition should be reconciled with DESIGN.md at some point (not in this workpackage, but it should be logged as lore).

### 5. Component Coherence & Consistency: 8/10

The key design decision -- "Sidebar component is NOT modified for mobile; drawer is a wrapper concern" -- is excellent. One component, two presentation contexts. The width migration from `w-[200px]` on Sidebar to `w-full` with parent-controlled width is a clean pattern that matches how other components in the system work.

The MobileHeader is correctly classified as a shell element, not a design-system component, avoiding budget inflation.

**Finding (SUGGESTION):** The design says both CocOverlay and GlobalSearchPanel render "above" the mobile layout. The z-index stacking is not specified in the design. The architecture plan puts the drawer at z-40 (scrim) and z-50 (sidebar). Existing overlays (CocOverlay at z-30 per the AppShell comment) need to stack correctly with the drawer. This is a coherence detail that should be verified.

### 6. States & Feedback: 7/10

States covered: drawer open, drawer closed, back arrow on detail routes, hamburger on list routes, notification dot when attention items exist. The spec mentions all view-specific adaptations.

**Finding (WARNING):** The design mentions "Drawer slides from translateX(-100%) to translateX(0)" with `--motion-default` (240ms) but the architecture plan says "For simplicity in v1, skip the slide animation (just appear/disappear)." This is a regression from the design spec. The drawer should animate in v1 -- a drawer that appears/disappears without animation feels broken on mobile. CSS transitions on transform are trivial to implement and GPU-accelerated. The architecture plan should not override the design spec on this.

**Finding (WARNING):** Escape key behavior for the drawer is specified but there is no mention of the Android hardware/software back button. On Android, tapping the back button when a drawer is open should close the drawer, not navigate away. This requires handling the `popstate` event or using the History API. This is a common mobile gotcha that is not addressed.

**Finding (SUGGESTION):** The spec does not define what happens when the drawer is open and a push notification or deep link arrives. Presumably the drawer should close, but this edge case is unspecified.

### 7. Accessibility: 6/10

Focus trap is mentioned. Escape closes drawer. aria-label on hamburger and back button. Scrim is click-to-close.

**Finding (CRITICAL):** The design says "Focus is trapped inside drawer when open" and mentions `focus-trap-react` is available. However, the architecture plan hedges: "Use focus-trap-react (already in dependencies) or manual focus management." This ambiguity will lead the builder to skip the focus trap for expediency. The design must be unambiguous: use `focus-trap-react`. Manual focus management is not equivalent to a proper focus trap (it misses edge cases like tabbing out of the drawer via browser chrome).

**Finding (WARNING):** The scrim `<div>` is click-to-close but has no ARIA role or label. A screen reader user encountering the scrim has no indication of what it is. The scrim should have `role="presentation"` or `aria-hidden="true"`, and the drawer itself should have `role="dialog"` and `aria-modal="true"` to properly communicate the modal nature to assistive technology.

**Finding (WARNING):** The mobile header's back arrow navigates to "explicit parent path, not navigate(-1)." This is correct for deep links but the aria-label should reflect the destination ("Back to Conversations") not just "Back." The spec does not specify this.

### 8. Anti-Slop Check: 8/10

Strong on anti-slop. The design explicitly rejects FAB for CoC trigger (AQ pattern), avoids bottom sheet patterns, avoids swipe-only navigation. The hamburger+drawer pattern is the most conventional mobile pattern but applied appropriately here (no new paradigm, maximum content space). No purple gradients, no hero sections, no glass morphism.

The rejected-directions list (Section 9 of approved.md) is thorough and shows genuine design thinking rather than AI-generated safe defaults.

No findings.

### 9. Premium Polish: 7/10

Touch targets are carefully specified: 48px header buttons, 44px minimum for sidebar sub-items and filter chips. The notification dot is a subtle, purposeful detail. Safe-area inset handling shows platform awareness.

**Finding (WARNING):** The design specifies that sidebar sub-items get `min-h-[44px]` on mobile but does not address whether this changes the vertical rhythm of the sidebar's scrollable body. Five threads at 44px each = 220px, plus three section headers at ~38px = 114px, plus bottom strip ~60px = 394px minimum. In a 280px-wide, ~700px-tall drawer (812px minus header, safe area), this fits comfortably. But if the user has many teams (5+), the scrollable area could feel dense. The design should note that the sidebar's `overflow-y-auto` handles this.

---

## Summary

### CRITICAL (1)
- Focus trap ambiguity: the architecture plan hedges between `focus-trap-react` and manual focus management. Decision must be: use `focus-trap-react`. It is already a dependency.

### WARNING (6)
- pageTitle derivation for Work team routes is underspecified (hierarchy)
- Mobile header height with safe-area-inset-top needs explicit clarification (spacing)
- Scrim color: tokens.css `--surface-overlay` is solid, not translucent. Inline rgba is correct but should be documented as lore (color)
- Drawer animation skipped in architecture plan contradicts design spec (states)
- Android back button not addressed for drawer close (states)
- ARIA roles missing on scrim/drawer: need `role="dialog"`, `aria-modal="true"`, and proper scrim labeling (accessibility)
- Back arrow aria-label should include destination, not just "Back" (accessibility)

### SUGGESTION (4)
- Notification dot size (6px vs 8px for low-DPI visibility)
- Verdict button wrapping behavior at 375px with flex-wrap (full-width or natural)
- z-index stacking order verification for drawer vs existing overlays
- Deep link / notification behavior when drawer is open

### What's Working Well
- The Variant A selection is well-reasoned: maximizes content space, maintains conceptual parity with desktop, avoids introducing a second navigation paradigm.
- The "Sidebar unchanged, drawer is wrapper concern" decision is architecturally clean and prevents desktop regression structurally.
- The notification dot pull-in from Variant B adds ambient awareness without structural cost.
- Rejected-directions list shows genuine exploration rather than rubber-stamping the first idea.

---

## Verdict

Score 7/10. Passes the advancement threshold. The one CRITICAL finding (focus trap ambiguity) must be resolved in the architecture plan -- the builder needs an unambiguous directive. The WARNING findings are real but none individually blocks implementation; they should be addressed during the build. The design is solid, well-reasoned, and appropriate for the v1 mobile pass.
