# Design Critique — Variant C: `always-on-rail`

**Score: 7.7 / 10**

| # | Dimension | Score | Notes |
|---|---|---|---|
| 1 | Visual hierarchy | 8 | Body title clearly dominates. Mono-numeral badges read as wayfinding glyphs, not chrome. Connector concept is sound. The lost-anchors row (open-by-default in mockup) competes for attention with the active-discussion zones — should default closed. |
| 2 | Spacing & density | 8 | Density tokens used for body padding, gaps, borders. 4-px-grid respected; the documented 2-px chip internal is whitelisted by AQ-001. The 56→360 px expansion is a layout (not transform) animation — flagged in AQ-014 risk below. |
| 3 | Typography | 8 | H1 / H2 weights and tracking match scale. `tabular-nums` on badges. Mono caption above expanded panel feels right. Code font 12.5 px is a bit-too-precise specific number — the closed allowlist is 11/12/13/14, so 12.5 is technically off-scale (AQ-004). |
| 4 | Color | 9 | Semantic tokens throughout; `--primary-dim` for unread, `surface-3` for resolved, `--warn` only on the lost-anchor tag. No purple/indigo bleed (AQ-102 clean). Color is paired with count text + position — never sole signal (AQ-008 OK). |
| 5 | Component coherence | 7 | The three-component split is clean and maps to the budget. BUT: the rail introduces `--rail-w-rest` / `--rail-w-expanded` as bespoke custom properties — those are layout primitives without a tokens-file home; should land in `tokens.css` or be derived from existing density tokens. The `MessageRow` / `CommentRow` boundary is honest (slot, not invented). |
| 6 | States & feedback | 8 | All required states covered: empty, loading, error, populated, hover (clean block), unread badge, resolved badge, expanded, lost-anchor accordion, long-code overflow. Hover-only `+` discoverability is acknowledged in trade-offs — that honesty is itself good. Loading does not shimmer rail counts, which is correct. |
| 7 | Accessibility | 6 | `aria-label` on the rail is good. `title` tooltips on badges are not screen-reader-substitutes — need `aria-label` instead. Tab order spec'd but no focus-visible spec on the close `×` or reply button. The `(0)` mobile handle requires a labelled control. Body re-layout under expansion violates AQ-014 (animating `grid-template-columns` is a layout property; `prefers-reduced-motion` collapses to instant — spec acknowledges, but the *default* path still animates layout). |
| 8 | Anti-slop | 9 | No purple, no chat bubble glyph, no emoji, no `rounded-2xl`, no glass, no marketing copy. Numeric badges read as a discussion *heatmap*, not engagement metrics. Genuinely distinctive from a Notion / Linear default. |
| 9 | Premium polish | 8 | Tabular numerals, mono captions on metadata, hairline connector line, `--motion-fast/medium` consistently applied, easing curve correct. Connector at 1 px / `--surface-5` is the kind of detail premium UIs ship. Drops a point for layout animation (AQ-014) and the off-scale 12.5 px code size. |

## Top 3 Wins

1. **Sparse-by-design density map.** "No badge for zero" is the load-bearing decision — turns the rail from chrome into signal. The eye reads anchor density without reading prose.
2. **In-place re-layout over overlay.** Choosing to shift the body left rather than overlay the prose the discussion *refers to* shows the variant understood the read-task; the trade-off section acknowledges the displacement honestly.
3. **Three-component composition with a clean concern split.** Body knows nothing about discussion, rail knows nothing about prose, badges are vertical-position-synced atoms. This is the cheapest path to L26 reuse.

## Top 3 Issues

1. **CRITICAL — Layout-property animation (AQ-014).** `transition: grid-template-columns var(--motion-medium)` animates a layout property. Rule allows only `transform / opacity / filter / backdrop-filter`. Fix: drive expansion via `transform: translateX` on a panel that overlays the right edge of the body, or accept instant width-snap and animate only the `opacity / translateX(4px)` reveal already in `rail-fade-in`.
2. **WARNING — Off-scale code font-size.** `font-size: 12.5px` on `.mb-code pre` is outside the closed type scale (AQ-004 allows 11/12/13/14/18/24). Pick 12 or 13.
3. **WARNING — Bespoke layout customs without a token home.** `--rail-w-rest: 56px` and `--rail-w-expanded: 360px` are declared in the mockup `:root` only. Promote to `tokens.css` (or derive: e.g. `--rail-w-rest = calc(var(--density-row-h) * 1.5)`) so consumers don't drift, and document them in DESIGN.md alongside the other widths.

## Verdict

**Ship-ready after the three fixes.** Strongest variant on wayfinding signal density and the only one that lets a reader scan a 200-line knowledge body for unresolved discussion at a glance. Pay the cost of an always-there column on quiet docs in exchange for the read-the-room property on hot docs — a fair trade for an agentic OS where most knowledge bodies will accumulate discussion over weeks. Anti-slop and color discipline are exemplary; layout-animation rule violation and the 12.5 px outlier are the only blocking line items.

File: `/Users/tobiasgrundmann/Development/hyperidle/docs/design-explorations/L2/always-on-rail/critique.md`
