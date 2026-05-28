# R2 Design Critique: Work-First Landing

DESIGN-CRITIQUE: variant=approved score=8/10 rounds=1 axes: H:9 S:8 T:8 C:8 Co:9 St:7 A:8 AS:9 PP:7

## Variant Comparison

### Variant 1: Minimal Strip — 8/10
Best spec alignment. Two visible required fields, product created silently, pure removal.

### Variant 2: Transparent Defaults — 6/10
Four visible fields contradicts "stripped to two required fields." "Skip for now" link creates a degraded state where agents cannot run, which conflicts with the API-key-required spec. The design exploration is valid — it surfaced useful observations about repo path — but the variant itself does not match the spec.

### Approved: Variant 1 + V2 repo path adjustment — 8/10 (selected for scoring below)
Correctly takes V1's core and incorporates only the repo path as an optional visible field per spec ("repo path is optional"). Product name remains hidden. API key is required. This is the right call.

---

## Dimension Scores (Approved Variant)

### 1. Visual Hierarchy — 9/10

The approved design has an exceptionally clear reading order: page title, two required fields in vertical sequence, one optional field, single primary action button. With only 2-3 fields visible, there is zero competition for attention. The "Start HyperIdle" button as `btn-primary` is the sole accent on the page.

The WorkPortfolio empty-state CTA ("Create bet" as `btn-primary btn-sm` inside an EmptyState above the Canvas) correctly creates a single focal point on an otherwise sparse page. The designer correctly identified that the existing EmptyState `action` slot is the right mechanism.

No findings.

### 2. Spacing & Density — 8/10

The design reuses the existing SetupFlow layout (`max-w-md`, `py-16`, `space-y-6`) without introducing any new spacing values. All spacing is via existing Tailwind utility classes already in the codebase. Removing section headings eliminates one layer of spacing rhythm, which is appropriate for a 2-3 field form.

The EmptyState component already uses density tokens (`--density-card-gap`, `--density-pad-x`, `--density-card-pad`) per K11 sweep, so the WorkPortfolio CTA inherits correct density behavior.

**WARNING:** `py-16` on the SetupFlow outer container is 64px, which exceeds the `p-8`/`p-10`/`p-12`/`p-14`/`p-16` threshold in AQ-103. However, this is a full-page centered form (not a card or content region), and the existing component already uses this value. Since R2 does not introduce this value (it is pre-existing), this is not an R2 finding. Flagged for awareness only.

### 3. Typography — 8/10

No new typography decisions. The design removes section headings (h2 elements) and replaces them with direct field labels, reducing the number of typographic levels from 3 (h1, h2, labels) to 2 (h1, labels). This is appropriate for the reduced content.

The EmptyState component uses `--density-text` for title and literal `12px` for description per K11 spec. The "Create bet" button uses standard `btn-sm` sizing. No new type scale entries.

No findings.

### 4. Color Usage — 8/10

Color usage is minimal and correct: `btn-primary` for the single CTA, monochrome for everything else. The design explicitly avoids adding any decorative color. Error states use the existing `text-error` token. Helper text uses `text-[var(--text-lo)]`.

No findings.

### 5. Component Coherence & Consistency — 9/10

The design's strongest dimension. Every decision reuses existing patterns:
- EmptyState component with its `action` slot (Tier 2, already density-swept)
- Same form layout and button patterns as the current SetupFlow
- Same dialog pattern for BetCreateDialog (no new dialog chrome)
- Same product select pattern, conditionally hidden

The designer correctly identified that this workpackage has a zero-component budget and stuck to it. No inline reimplementation of existing primitives.

The BetCreateDialog graceful degradation (show product picker when `products.length > 1`) is a good forward-compatible pattern that avoids breaking multi-product scenarios.

No findings.

### 6. States & Feedback — 7/10

**WARNING: Missing state specification for repo path validation.** The approved design says "if repo path points to a non-existent folder, tolerate gracefully" but does not specify what "gracefully" looks like in the UI. Does the product name still derive from the folder basename even if the path does not exist? The design says "product name falls back to 'My Product'" but does not specify whether the user sees any feedback about the invalid path. This is acceptable for R2 scope (the spec says "repo path is optional" and validation is not in scope), but the state is underspecified.

The following states are correctly handled:
- Submit error: inline error message (`submitError`)
- Button disabled state: gated on name + API key non-empty
- Submitting/loading state: existing loading spinner pattern preserved
- Empty portfolio state: EmptyState with CTA
- Single vs. multi product: conditional product picker

**SUGGESTION:** The design does not specify what happens to the "Start HyperIdle" button text/state after a successful submission but before navigation occurs. The current implementation navigates immediately on success, so this is a non-issue in practice, but the state transition is not documented.

### 7. Accessibility — 8/10

The design preserves all existing accessibility patterns:
- `autoFocus` moves from the backend mode select to the name input (correct — the first required field)
- All inputs have proper `<label>` elements
- The `role="alert"` and `aria-live="polite"` on error messages are preserved
- EmptyState uses `role="status"` per its existing implementation
- Button touch targets: `btn-sm` with `min-h-[44px]` per AQ-015 (correctly specified in the WorkPortfolio CTA)

**SUGGESTION:** The design specifies `autoFocus` on the name input. This is correct for the setup flow (single-purpose page), but the design could document that this is intentional per the existing lore comment.

No critical accessibility gaps.

### 8. Anti-Slop Check — 9/10

This is a removal workpackage. The design adds no decorative elements, no new chrome, no hero sections, no card grids, no gradients. The anti-slop score is high because the design actively removes AI-generated complexity (backend mode section, multiple form sections with h2 headings, skip button creating dual action paths).

The EmptyState CTA copy ("Ready to shape your first bet" / "A bet is a time-boxed commitment. Pitch what you want built.") is specific, noun-forward, and agent-forward per the existing EmptyState lore. No marketing superlatives (AQ-110).

No findings.

### 9. Premium Polish — 7/10

The design inherits the existing codebase's polish level. It does not introduce new polish but also does not degrade it.

**WARNING:** The approved design specifies `btn-sm` for the "Create bet" CTA but the architecture plan adds `min-h-[44px]` to meet AQ-015. This is correct but the design document itself does not mention the min-height. The architecture plan caught what the design missed. Minor gap.

**SUGGESTION:** The "Your agents need this to work." helper text below the API key field is functional copy that serves the user. The design could specify the exact helper text token treatment (e.g., `text-sm text-[var(--text-lo)]`) to match the existing pattern at line 340 of SetupFlow.tsx. The architecture plan does specify this.

---

## Cross-Component Checks

### Consistency & Reuse
- EmptyState is reused, not reimplemented. Pass.
- BetCreateDialog conditionally hides fields rather than creating a new "simple" dialog variant. Pass.
- SetupFlow retains the same outer layout, button patterns, and error handling. Pass.

### Density-Tier Consistency
- EmptyState is density-aware per K11. The CTA button inside the action slot does not need density tokens (buttons are density-static). Pass.
- SetupFlow is a full-page form, not a density-aware component. No density concerns.

### Completeness
- All three surfaces (SetupFlow, WorkPortfolio CTA, BetCreateDialog) have their states documented.
- The "did we consider" checklist in approved.md covers 8 edge cases, including existing users, missing API key, multiple products, and email schema changes.

---

## Findings Summary

### CRITICAL
None.

### WARNING
- [approved.md] Repo path validation feedback is underspecified. The design says "tolerate gracefully" but does not define the UI feedback for an invalid path. Acceptable for R2 scope but should be documented as a known gap.
- [approved.md] The `min-h-[44px]` touch target requirement for the "Create bet" CTA appears in the architecture plan but not in the design document. Design should own this decision.

### SUGGESTION
- [approved.md] Document the autoFocus migration (from backend mode select to name input) as an intentional design decision, not just an implementation detail.
- [approved.md] Specify helper text token treatment (`text-sm text-[var(--text-lo)]`) for the API key hint to match the existing pattern.

## What's Working Well
- The variant exploration was correctly classified as "routine" and produced exactly two variants with a clear selection rationale. No over-exploration.
- The "did we consider" checklist is thorough and covers edge cases that would otherwise surface during implementation (email schema, existing users, multi-product fallback).

## Verdict

Score 8/10 — passes the 7/10 threshold. The approved design is ready for architecture planning. The warnings are minor documentation gaps that do not affect implementation correctness.
