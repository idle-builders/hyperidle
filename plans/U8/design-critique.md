# U8 Design Critique: Tier 2 Composites Restyle

**Reviewer:** Phase 2 critique
**Artifact reviewed:** `plans/U8/design/variant-1.md`
**Classification:** Routine restyle (single variant, bar >= 7)
**Date:** 2026-05-31

---

## Rubric Scores

### 1. Hierarchy — 8/10

The design correctly maps the three-level content hierarchy (cards with lift + shadow, rows with tinted hover, inline blocks with transparent tint) to Hearth's visual vocabulary. Cards get `shadow-default` at rest and `shadow-elevated` on hover-lift, rows get green-tinted hover without shadow, and blocks get a subtle 4% text-secondary tint. This stratification is clear and consistently applied. The new NotificationRow left border adds a fourth visual signal layer (border color by severity), which is well-motivated by the AC but adds cognitive weight to a component that already has StatusChip dots and icon circles. The three signals (border, icon circle, dot) on one row risk over-communication, but all three are specified in the AC so this is not a design flaw -- it is spec adherence.

### 2. Spacing — 9/10

All density tokens are explicitly preserved. The design calls out that color/radius/shadow tokens change but spacing/density tokens do not. This is correct. No new spacing decisions are introduced. The "Did We Consider" checklist item #2 confirms this.

### 3. Typography — 8/10

The `font-heading` removal is clean -- Hearth uses `--font-sans` with `font-semibold` for headings. The heading size scale for HeadingPayload (h1: `--density-text-h1`, h2: `--density-text-h2`, h3-h6: fixed 18px/16px/15px/13px) is specified but the h3-h6 values are hardcoded pixel sizes rather than tokens. The tokens.css file has `--text-lg: 17px`, `--text-base: 15px`, `--text-sm: 13px`, `--text-xs: 12px` -- the design could map h3 to `--text-lg` (17px, not 18px) for token consistency. This is minor since headings h3+ are rare in content blocks. The `font-heading` class removal plus `font-bold` in KnowledgeRow factory mode is correctly specified.

### 4. Color — 9/10

Complete token migration with no gaps. Every Lucid token has a Hearth equivalent specified. The ghost-surface replacement (`color-mix(in oklab, var(--text-secondary) 8%, transparent)`) is well-reasoned and works in both light and dark modes. Status color derivation for BetCard progress bar (active -> green, at_risk -> amber) is correct. The "Did We Consider" checklist covers contrast compliance, dark mode compatibility, and the `--surface-ghost` edge case. One note: the design says "Hearth card shadow vs old surface ladder" is documented in "U0 concept" but U0 concept files were not found in this worktree (U0 plans may live only in the main repo). This is not a design flaw -- just a reference that the builder may not be able to verify locally.

### 5. Coherence — 9/10

Excellent pattern extraction. The four cross-cutting patterns (card hover lift, row hover tint, ghost surface replacement, focus ring) are defined once and referenced everywhere. Every card uses the same lift treatment. Every row uses the same green-tinted hover. Every interactive element uses the same `accent-primary` focus ring. The `--bw-strong` decision for border width is consistent across ThreadRow, NotificationRow, and RichMessageCard.

### 6. States — 8/10

All existing states are preserved (default, hover, focus, selected, blocking/blocked, unread, error, saving). New states are additive: unread dot on ThreadRow, colored left border on NotificationRow, icon circles on NotificationRow, green tint on RichMessageCard action toolbar. The design covers hover, focus-visible, selected, and blocking states for all relevant components. Missing: explicit specification of the `disabled` state for the Composer send button. The design mentions `hover:bg-[var(--accent-primary-hover)]` but does not specify the disabled appearance (e.g., reduced opacity or dimmed background). This is minor -- the Composer likely already has disabled styling, and U8 is a restyle not a behavioral change.

### 7. Accessibility — 8/10

Contrast ratios are validated by reference to U3 work. The design correctly notes that `--text-tertiary` is decorative/hint-only and WCAG-exempt. Focus rings are consistently `outline-[var(--accent-primary)]` on all interactive elements. The unread dot provides a non-color-only signal (presence/absence of the dot, plus the title being semibold per the AC). One concern: the NotificationRow icon circles with "14% opacity tinted backgrounds" may have very low contrast in light mode. At 14% of `--status-error` (#dc4a3a) on white, the resulting tint would be barely visible. This is an aesthetic choice rather than an accessibility violation since the icon circle is decorative (the StatusChip dot carries the actual status information).

### 8. Anti-Slop — 9/10

No gradients, no glows, no blur effects, no overdesigned animations. The card lift is a simple translateY(-2px) with shadow change. The hover tints are subtle 4% green mixes. The design avoids AI aesthetic tells. The `color-mix()` approach is CSS-native, not a framework hack. No unnecessary visual complexity.

### 9. Premium Polish — 8/10

The card lift pattern (translateY + shadow escalation) creates a tactile, responsive feel. The warm shadows with `rgba(44, 36, 26, ...)` tinting match the Hearth earth-tone palette. The green-tinted row hovers add subtle brand presence without being heavy-handed. The pill-shaped send button on Composer is a strong visual anchor. The agent avatar border in RichMessageCard (2px forest green ring) distinguishes agent from human messages without being garish.

---

## Aggregate Score: 8.4 / 10

**Verdict: APPROVED.** The design exceeds the 7.0 bar for a routine restyle.

## Advisory Findings (non-blocking)

1. **HeadingPayload h3-h6 sizes.** The design specifies hardcoded pixel values (18px/16px/15px/13px) for h3-h6 instead of mapping to existing type-scale tokens (`--text-lg`, `--text-base`, `--text-sm`, `--text-xs`). The values are close but not identical (h3 is 18px vs `--text-lg` at 17px). The builder should consider whether to use tokens for consistency or keep the specified values as deliberate Hearth heading sizes.

2. **Composer disabled state.** The design does not explicitly specify the Hearth treatment for the send button's disabled state. If the current component has a disabled state, the builder should apply a Hearth-consistent treatment (e.g., reduced opacity with `--text-tertiary` text on `--surface-container` background).

3. **NotificationRow visual density.** Three simultaneous status signals (colored left border, tinted icon circle, StatusChip dot) may create visual noise. This is AC-specified so the builder should implement all three, but if the visual result feels heavy, a follow-up refinement could simplify to two signals.
