# Design Critique: L17 -- Cost + Tokens wired into Work

DESIGN-CRITIQUE: variant=inline-money-progressive-tokens score=8/10  rounds=1  axes: H:8 S:8 T:9 C:8 Co:9 St:8 A:7 AS:9 PP:8

## Classification Check

The design classifies as "routine" with 1 variant. This is correct: all six affected surfaces already exist with established layouts. The change is a data-type transformation, not a layout transformation. Zero new components. The brief is well-scoped.

---

## Dimension Scores

### 1. Visual Hierarchy (8/10)

The design maintains the existing reading order on all surfaces. Money is the primary axis (always visible), tokens are secondary (progressive disclosure on detail surfaces only). This follows D3 correctly.

The spend-vs-cap format (`$214.30 / $500.00`) on bet detail is clear -- the slash separator is a natural reading pattern for "actual / limit". The per-tier breakdown in `text-[var(--text-lo)]` at 11px correctly recedes below the summary.

The task table cost column uses right-alignment + tabular-nums, which is the correct treatment for numeric columns.

No issues with hierarchy.

### 2. Spacing & Density (8/10)

The design specifies no new spacing values. All surfaces use existing KeyValue primitives with density tokens already wired. The per-tier breakdown row uses `12px gap` between tier spans -- this needs verification against the 4px grid (12px is a valid 4px multiple, so it passes AQ-001).

The design correctly avoids introducing new components that would need density-tier calibration.

### 3. Typography (9/10)

- Per-tier text at `text-[11px]` -- valid, 11px is in the closed type scale.
- `font-mono` for per-tier counts -- correct usage (technical data values).
- `font-variant-numeric: tabular-nums` specified on all numeric values per AQ-006.
- No new font weights introduced.

Strong typography decisions throughout.

### 4. Color Usage (8/10)

- Per-tier text uses `text-[var(--text-lo)]` -- semantic token, correct for secondary metadata.
- No new colors introduced. No decorative color.
- The dash `"--"` for null/absent values is a non-color signal for missing data.

No color issues.

### 5. Component Coherence & Consistency (9/10)

This is the strongest dimension. The design achieves zero new components. Every surface composes existing primitives (KeyValue, BetCard, StatusChip, Tag). The component mapping table at the end explicitly lists what changes on each component.

BetCard stays string-typed for `appetite` because it is a format-agnostic design-system component receiving pre-formatted display values. This is a correct architectural boundary decision -- the caller formats, the component renders.

The design correctly identifies that KeyValue needs no changes (it already renders any string).

### 6. States & Feedback (8/10)

The states table covers all five surfaces across all relevant states (Empty, Loading, Error, Populated, Overflow). Specific choices:

- Null cap: `"--"` (dash-as-absent, consistent with L5/L22 pattern).
- Null spend: `"$0.00"` (zero is a real value, not absent -- correct semantic distinction).
- No token data: `"-- / --"`.
- No tiers used: per-tier line does not render (correct -- no empty row).
- Loading: SkeletonList rows (existing pattern).

One gap: the design does not specify what happens when the Rail's cost data fetch fails. The states table says `"Failed to load cost" ErrorState` but does not specify whether this replaces all four/five KeyValue rows or shows as an inline error. This is minor since the Rail already has an established pattern.

### 7. Accessibility (7/10)

This is the weakest dimension.

- No new interactive elements are introduced (all values are static text in KeyValue), so no new keyboard/focus concerns.
- The per-tier breakdown is a flex row of plain spans -- no interactive elements that need focus rings.
- `tabular-nums` aids visual scanning (a form of cognitive accessibility).

Gaps:
- The design does not specify `aria-label` or `role` for the spend-vs-cap section on bet detail. Since this is a new information section, it should carry `aria-label` for screen readers (e.g., `aria-label="Spend versus cap"`).
- The per-tier breakdown has no explicit screen-reader consideration. A `sr-only` summary could help (e.g., "38,200 workhorse tokens, 800 reasoning tokens") but this is a SUGGESTION, not a failure.
- The tokens row in the Rail (5th KeyValue row) is conditionally rendered. No accessibility concern since KeyValue already handles this correctly.

### 8. Anti-Slop Check (9/10)

No AI-aesthetic patterns detected:
- No purple gradients, no oversized padding, no hero sections.
- No `rounded-2xl`, no glass morphism, no gradient-on-text.
- The per-tier breakdown is a deliberately minimal mono-text row, not a chart or visualization.
- The rejected directions explicitly reject color-coded bars, pie charts, sparklines, and separate panels -- all of which would be AI-aesthetic tells.

The design is intentionally restrained and functional. It reads like a precision instrument, not a dashboard template.

### 9. Premium Polish (8/10)

- Tabular numerals: specified on all numeric values (AQ-006 compliant).
- "Budget" renamed to "Cap": correct vocabulary alignment with the concept doc.
- Per-tier text uses `font-mono text-[11px] text-[var(--text-lo)]` -- three levers (size, family, color) to create clear visual subordination.
- Mobile adaptation addressed: Rail not visible on mobile, BetCard scales with density, per-tier wraps with flex-wrap.

One gap: the design mentions `text-[11px]` for the per-tier row but does not specify whether this should be density-aware via `text-[length:var(--density-text)]`. Since this is secondary metadata (similar to KeyValue labels which use literal 11px), literal sizing is defensible. But the architect should confirm this does not create a density-tier inconsistency.

---

## CRITICAL

None.

## WARNING

- **W1** [design/approved.md:105-111] The per-tier breakdown row specifies `12px gap` between spans but uses literal `gap` rather than a density token (`--density-card-gap` is 4/8/12 px across tiers). Since the per-tier row lives inside a card-context (bet detail), it should either use `--density-card-gap` or be explicitly declared as density-static in the density allowlist. The architect must decide.

- **W2** [design/approved.md:93-99] The "SPEND vs CAP" section on bet detail is a new layout section below the BetCard. The design does not specify the gap between the BetCard and this section. The architect should confirm this uses `--density-gap` or `--density-card-gap` for vertical separation.

## SUGGESTION

- **S1** [design/approved.md:105-111] Consider adding a screen-reader-only summary for the per-tier breakdown (e.g., `<span class="sr-only">Token breakdown: 800 reasoning, 38,200 workhorse, 3,100 fast</span>`). The visual format ("reasoning 800   workhorse 38.2k   fast 3.1k") may not linearize cleanly for screen readers since the tier name and count are separate spans.

- **S2** [design/approved.md:95-99] The "SPEND vs CAP" section heading uses "existing heading style" but the spec does not cite which heading style. The architect should confirm this is a SectionHeader (like Rail sections) or a plain `font-heading text-xs uppercase` span.

- **S3** [design/approved.md:127-130] The task table cost column specifies right-alignment for the cost values. The design does not specify whether other columns in the task table change alignment. The architect should confirm only the cost column is right-aligned (standard for numeric columns).

## What's Working Well

- **Progressive disclosure is correct.** Money always visible, tokens only on detail surfaces. This is a textbook application of D3 that avoids the temptation to show everything everywhere.

- **Zero new components is impressive.** For a workpackage that touches 6+ surfaces, achieving zero component budget impact shows strong design-system reuse. Every surface change composes existing primitives.

---

## Verdict

**PASS.** Score 8/10. The design is clean, restrained, and well-grounded in the concept doc. The warnings are minor spacing/density coordination questions for the architect. No design revision needed.
