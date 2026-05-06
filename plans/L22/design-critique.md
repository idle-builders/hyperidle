# L22 Design Critique — Knowledge Signal Columns + Sort Controls

DESIGN-CRITIQUE: variant=inline-signal-triad score=8/10  rounds=1  axes: H:8 S:7 T:8 C:9 Co:8 St:8 A:8 AS:9 PP:7

## Scoring Breakdown

### 1. Visual Hierarchy: 8/10
The design correctly places the signal triad at tertiary level (11-12px mono, `--text-lo`/`--text-mid`) below title (primary) and tags/status (secondary). The reading order is sound: title catches the eye, then status chips, then signals, then timestamp. The signal labels are all-caps mono at 11px, which is visually distinct from the 12px body-weight caption it replaces.

One tension: the triad sits on the same flex line as the timestamp, so the right side of the row carries both the triad AND the timestamp. At default density, this is fine; at compact with long titles, the triad and timestamp may compete. The design defers mobile breakpoint behavior to the architect (Section 6), which is appropriate.

### 2. Spacing & Density: 7/10
The design specifies `gap-[8px]` between signal items. This is an 8px literal, not a density token. KnowledgeRow is a density-aware component per K10/K11 (it consumes `--density-gap`, `--density-pad-x`, `--density-pad-y`, `--density-text`). The gap between signal items should consume `--density-gap` or a fraction thereof to stay density-coherent. Using a literal `gap-[8px]` inside a density-aware component violates AQ-002 ("Density tokens for component internals").

However, the signal-internal gap (4px between label and value in SignalValue) is at the chip-internal scale where 4px literals are allowed per AQ-001 (reserved for chip/icon internals).

### 3. Typography: 8/10
Font sizes (11px label, 12px value) are within the closed type scale (11px is the StatusChip/Tag tier; 12px is the caption tier). Mono font via `font-[var(--mono)]` is correct for data values. `tabular-nums` for number alignment is specified. `tracking-[var(--tracking-caps)]` on labels matches AQ-007.

The design correctly uses hardcoded 11/12px rather than `--density-text` for caption-tier elements, matching the existing caption and timestamp treatment in KnowledgeRow.

### 4. Color Usage: 9/10
All colors come from semantic tokens: `--text-lo` for labels and absent values, `--text-mid` for present values. No decorative color. The conditional styling (present vs absent) uses only the text-opacity ladder, not chromatic differentiation. This is exactly right per Principle 3 (Restraint) and the monochrome status philosophy.

### 5. Component Coherence & Consistency: 8/10
The design correctly extends an existing Tier 2 component (KnowledgeRow) rather than creating a new one. Component budget: 0 new / 0 retired. Sort controls use DaisyUI `btn btn-xs` directly (no wrapper), matching the existing Triage/Curated tab button pattern exactly. The `signals` prop is optional so backward compatibility is preserved.

`SignalValue` as a local inline component (not a DS export) is appropriate -- it is an internal sub-rendering helper, not a reusable primitive.

### 6. States & Feedback: 8/10
Four signal states are explicitly specified: all present, mixed, all absent, signals not provided. The sort buttons use `btn-neutral` (active) and `btn-ghost` (inactive) matching the existing tab pattern. Sort change is described as instant (no transition) with explicit justification (dense list context). Focus behavior inherits from the existing `btn` focus ring.

Missing from the spec: what happens when the sort key has ties? The design does not specify a secondary sort (e.g., by title alphabetically), but this is an implementation detail the architect should address, not the designer.

### 7. Accessibility: 8/10
Keyboard navigation is addressed: Tab between rows and sort buttons, Enter/Space activates. Focus rings come from the existing `btn` and row patterns. The sort button group does not specify `role="radiogroup"` or `aria-label`, which would improve screen reader experience. The Triage/Curated tabs have `role="tablist"` and `role="tab"` with `aria-selected`, but the sort buttons are a different pattern (not tabs -- they are mutually exclusive sort options). They should carry `role="radiogroup"` with `role="radio"` and `aria-checked` for semantic correctness.

The signal triad has a `data-testid` but no `aria-label` explaining what the group represents. A screen reader encounters "recency 2d freq 3 impact dash" with no context that these are relevance signals.

### 8. Anti-Slop Check: 9/10
No AI-aesthetic tells detected. No purple gradients, no oversized padding, no rounded-2xl, no glass morphism, no hero layout, no emoji icons. The design is dense, purposeful, and uses the existing component vocabulary. The rejected directions (sparklines, data table, dropdown) are well-reasoned and anti-decorative.

### 9. Premium Polish: 7/10
Tabular numerals specified (AQ-006). Uppercase label tracking specified (AQ-007). Motion tokens inherited from existing btn pattern.

Issues:
- The literal `gap-[8px]` inside the signal triad does not scale with density tiers. At comfortable density, the surrounding row expands (pad and gap grow), but the signal triad's internal spacing stays at 8px, creating a density discontinuity.
- The design does not specify `font-[var(--mono)]` for the sort "Sort by" label vs the buttons. It uses `font-[var(--mono)]` for the label -- fine -- but the buttons use DaisyUI `btn` which defaults to `--ui` font. This is correct (buttons are UI elements, not data), but worth noting for the builder.
- Touch targets: the sort buttons at `btn-xs` size are the same as the existing tab buttons. At compact density these could be below the 44px AQ-015 floor on touch devices. But this is an inherited pattern from J6, not an L22 regression.

---

## CRITICAL
(none)

## WARNING
- [approved.md:46] `gap-[8px]` between signal items is a literal pixel value inside a density-aware component. Per AQ-002, component internals should consume `var(--density-gap)` or a sub-token. The existing `--density-gap` (8px compact / 12px default / 16px comfortable) would work directly. The builder should use `gap-[var(--density-gap)]` instead of `gap-[8px]`. If the full gap is too wide at comfortable, a half-step like `gap-[calc(var(--density-gap)/2)]` or the `--density-card-gap` token (4/8/12px) would be density-coherent alternatives.

- [approved.md: missing] The sort button group lacks `role="radiogroup"` / `aria-label`. Sort buttons are mutually exclusive single-selection controls, not tabs. The builder should add `role="radiogroup" aria-label="Sort order"` on the container and `role="radio" aria-checked={sort === opt}` on each button for screen reader semantic correctness.

## SUGGESTION
- [approved.md:48] The signal triad container should carry an `aria-label="Relevance signals"` or similar so screen readers can announce the group purpose before reading individual signal values.

- [approved.md:58] The recency formatter ("2d", "3h") produces very terse values. Consider whether a screen reader should receive a more verbose alternative (e.g., `aria-label="Recency: 2 days ago"` on the recency slot). The visual brevity is good; the audible equivalent should be understandable.

- [approved.md §6] Mobile adaptation correctly defers breakpoint behavior to the architect, but note that the signal triad at three label-value pairs is roughly 200px wide. On a 320px-wide viewport this competes with the title. The architect should define a hard breakpoint rule (hide or stack).

## What's Working Well
- The single-variant decision (routine classification) is correct -- this is a data-display extension of an existing component, not a novel interaction pattern. One variant avoids wasted exploration.
- The rejected-directions section is unusually thorough and well-reasoned. Each rejection cites the specific reason it does not fit the system's constraints (density, component budget, honesty-over-decoration). This is the kind of design discipline that prevents feature creep.

## Verdict

Score 8/10. Above the 7 threshold. Advances to architecture. The two WARNINGs (density-coherent gap token, radiogroup a11y) are implementation-level fixes the builder can address -- they do not require redesign. The design is sound: it extends an existing component minimally, uses the right tokens, avoids decoration, and handles absent-data states explicitly per the L5 anti-pattern rule.
