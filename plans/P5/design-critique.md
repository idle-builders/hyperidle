# P5 FirstTimeHints -- Design Critique

DESIGN-CRITIQUE: variant=approved score=8/10  rounds=1  axes: H:8 S:9 T:8 C:8 Co:8 St:8 A:8 AS:9 PP:8

---

## Scoring Breakdown

### 1. Visual Hierarchy (8/10)

The design establishes a clear reading order: EmptyState says WHAT (permanent), hint says WHAT TO DO (transient, subordinate). The "Got it" button is correctly de-emphasized with `text-lo` and `btn-ghost btn-xs`. The hint copy at `text-mid` weight sits correctly between the EmptyState title (`text-hi`) and the EmptyState description (`text-lo`). The separation between permanent UI and transient guidance is well-considered.

One concern: Hint #2 has both a primary-colored action button ("Open Settings") and a `text-lo` dismiss button side by side. The primary-colored action will pull attention strongly. This is likely intentional (the action IS important for hint #2), but it is worth noting that it creates an inconsistency with the other four hints that have only the quiet dismiss button.

### 2. Spacing & Density (9/10)

All spacing uses density tokens: `--density-card-pad` for padding, `--density-card-gap` for internal gap, `--density-text` for text size. This exactly mirrors the EmptyState density behavior documented in K11, which is the correct reference component. The 4px grid is respected through the token layer. No hardcoded spacing values appear in the design.

### 3. Typography (8/10)

Text uses `--density-text` (14/15/16 across tiers) with `--leading-body` line height and `--text-mid` color. This is body-text treatment, which is appropriate for conversational guidance copy. No off-scale font sizes. The "Got it" button text inherits from `btn-xs`, which is a DaisyUI size class.

Minor concern: The design does not specify the font weight for hint copy. By default it would be `--fw-regular` (400), which is correct for body text. But this should be explicit to prevent a builder from adding `font-medium` or `font-semibold`.

### 4. Color Usage (8/10)

All colors are semantic tokens: `--surface-2` for background, `--text-mid` for body, `--text-lo` for dismiss button, `--primary` for the Hint #2 action link. No hardcoded hex values. No decorative color. The surface step (`surface-2` on the page context) provides a structural signal rather than a color signal, which aligns with Principle 2 (Hierarchy Through Weight, Not Decoration).

The design correctly calls out that `--primary-dim` was considered and rejected because "it looks like selection state." This is good design rationale.

Surface direction note: The design claims `surface-2` is "one step up from the main content area (surface-3)." In the dark theme surface ladder, surface-2 (#1e1e22) is actually darker (one step down) from surface-3 (#27272b). However, the existing WorkProduct page already uses `surface-2` for its card-like sections (line 173 of WorkProduct.tsx), so this matches the established page pattern. The rationale text is misleading ("one step up") but the token choice is correct by codebase precedent.

### 5. Component Coherence & Consistency (8/10)

The design correctly refuses to create a new component. The hint is a rendering pattern using existing tokens, not a new Tier 1/2 primitive. This respects the UI Design Credo ("Keep it simple. Every component on this page has to justify its existence") and Rules ("Don't wrap DaisyUI for the sake of wrapping"). Five uses with no shared behavior beyond text+dismiss does not meet the two-usage-site threshold for a component.

The token usage mirrors EmptyState exactly (same padding, gap, text size tokens). This creates visual kinship between the two patterns without coupling them at the component level. The "Rejected list" section explicitly documents why DaisyUI `alert`, tooltip/popover, and a dedicated InlineHint component were rejected. This is strong design rationale.

One concern: The inline rendering pattern will be copy-pasted across 5 view files with only the trigger condition and copy text varying. The architecture plan addresses this with a `useHint` hook, but the visual markup itself (the div with token classes) is repeated. This is acceptable for 5 instances but the design should acknowledge that at 10+ instances a shared rendering function would be warranted.

### 6. States & Feedback (8/10)

Four states are explicitly defined: Visible, Dismissed, Loading, Error. The Loading state correctly hides hints until the API confirms (preventing flash-of-hint). The Error state correctly hides all hints on API failure (graceful degradation). The Dismissed state removes the element from DOM entirely (not `display: none`).

The dismiss interaction is well-specified: optimistic UI, fire-and-forget POST, no re-show on failure. The auto-dismiss mechanism (trigger condition becomes false) is a pure render gate with no database write, which is the simplest correct approach.

Missing: No explicit hover state for the "Got it" button is specified. As a DaisyUI `btn btn-ghost btn-xs`, it inherits ghost button hover behavior (background tint on hover). This is correct by inheritance but should be mentioned for completeness.

Missing: No transition is specified for the hint appearing or disappearing. The design explicitly rejects animation ("no slide-in, no fade. It is simply present"). This is a defensible choice for v1 but the abrupt appearance/disappearance could feel jarring.

### 7. Accessibility (8/10)

Keyboard: The "Got it" button is a standard DaisyUI `btn` element -- focusable, Enter/Space activatable. Tab order follows document flow (no focus trap). This is correct.

Touch targets: The design specifies `min-h-[44px]` on the dismiss button, satisfying AQ-015. Good.

Missing: No `role` or `aria-*` attributes are specified for the hint region itself. The EmptyState uses `role="status"` for screen reader announcement. A hint region could benefit from `role="status"` or at minimum `aria-label` so screen readers announce the guidance. The "Got it" button would also benefit from `aria-label="Dismiss hint"` for screen readers that read the button out of context.

Missing: No `aria-live` region specification. Since hints appear dynamically when conditions are met, a `role="status"` (which implies `aria-live="polite"`) would be appropriate so assistive tech announces the hint without interrupting the user.

### 8. Anti-Slop Check (9/10)

The design actively avoids every AI-aesthetic tell. No icons (AQ-113). No gradient backgrounds (AQ-102). No oversized padding (AQ-103). No hero sections (AQ-104). No marketing copy (AQ-110). No progress indicators (explicitly rejected in spec). No animated transitions. No "Get started!" or "Welcome!" copy.

The copy register is well-defined: one sentence, action-oriented, no jargon, no marketing, imperative or declarative. The specific copy examples read like a professional tool, not an AI onboarding flow.

The rejected-list section is valuable anti-slop documentation, explicitly preventing re-litigation of 9 common AI-generated alternatives.

### 9. Premium Polish (8/10)

Density-tier coherence is fully addressed via token consumption. The hint breathes with EmptyState at all three density tiers. Touch target floor is addressed. The button pattern uses existing DaisyUI vocabulary.

No tabular numerals needed (no numeric content). No uppercase labels in hints (no tracking concern). Motion is N/A (explicitly no animation).

The "whisper, not announce" design philosophy is the premium signal here -- the hints are intentionally understated, which is the correct tone for a professional productivity tool.

---

## CRITICAL

None.

## WARNING

- [approved.md:39] Surface direction rationale is incorrect. The text says `bg-[var(--surface-2)]` is "one step up from the main content area (surface-3)" but in the dark theme, surface-2 is darker (lower luminance) than surface-3. The token choice is correct by codebase precedent (WorkProduct.tsx already uses surface-2 for inline cards) but the rationale should say "one step down" or "recessed from." This could mislead a builder who reads the rationale without checking actual values.

- [approved.md:17] Radius token `--r1` (4px) is used for the hint container. Per DESIGN.md, `--r1` is for "Buttons, chips, badges" and `--r2` (8px) is for "Cards, panels, boxes." The hint region is structurally a card-like container. However, WorkProduct.tsx already uses `--r1` for its inline card sections, so this is a pre-existing inconsistency. The builder should follow the design as-written (matching existing WorkProduct pattern), but this inconsistency between DESIGN.md reference and actual codebase usage should be flagged for a future cleanup.

- [approved.md, States section] No `role` or `aria-live` attributes are specified for the hint region. Since hints appear dynamically, screen reader users would benefit from `role="status"` (implies `aria-live="polite"`) on the hint container. The EmptyState component sets `role="status"` -- the hint should match this pattern.

## SUGGESTION

- [approved.md:28] The dismiss button text should be specified as exactly one of "Got it" or "Dismiss" -- the design currently allows either. Pick one for consistency across all 5 hints. "Got it" is more conversational and matches the hint's "whispering" tone.

- [approved.md, Typography section] Explicitly specify font weight as `font-normal` (400) for hint copy to prevent builder drift toward medium/semibold.

- [approved.md, States section] Consider adding `aria-label="Dismiss hint"` to the "Got it" button so screen readers provide context when the button is focused outside the visual flow.

- [approved.md:17] The inline rendering pattern (the div with 4+ token classes) is repeated across 5 view files. While not worth a component for v1, the design should note that at 10+ instances a shared `renderHintRegion` helper would be warranted to prevent class-string drift.

## What's Working Well

- The "not a component" decision is the right call. Five uses with no shared behavior beyond text+dismiss does not justify a Tier 1/2 primitive. The design earns its simplicity.

- The state model (visible / dismissed / loading / error) is complete and the defaults are correct: hints hidden during loading prevents flash-of-hint, hints hidden on error prevents re-showing dismissed hints. These are the subtle UX decisions that separate good onboarding from irritating onboarding.
