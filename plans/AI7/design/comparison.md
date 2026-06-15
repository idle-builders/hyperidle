# AI7 — Comparison (routine: one variant + rejected directions)

`routine` class → one ratified variant. No A/B/C board; the decision is *which existing standard wins*, settled below, with the considered-and-rejected directions enumerated so they are not re-litigated.

## The ratified variant — in-session critique (9 dimensions)
Scored against the rendered `ratified/screenshot.png`.

| Dimension | Score | Note |
|---|---|---|
| Hierarchy | 9 | Title is the clear landing point (20px/600); breadcrumb above is secondary; SectionLabels (13px uppercase tertiary) read as openers, not competitors. |
| Spacing | 9 | px-24/py-18 header, 24px body gaps, 9px label-to-content — all on the 6px grid. |
| Typography | 9 | One title treatment, one section treatment; closed scale (20/13); no `font-heading`, no off-scale. |
| Color | 9 | Warm tokens only; tertiary for labels, primary for title, accent for primary action. |
| Coherence | 10 | The whole point — every page now shares this anatomy. |
| States | 8 | Header is stateless; pages keep their own empty/loading/error bodies. PageHeader must still render with title-only (no slots) and with long-title truncation. |
| A11y | 8 | `<header>` + heading levels (h2 title, h3 section). One `<header>` per page. Truncate keeps full text in DOM. |
| Anti-slop | 9 | No hero, no card-grid, no decorative icons, no gradient. Dense + purposeful. |
| Premium polish | 8 | The border-b rule + optional section divider give tactile structure; could add nothing more without scope creep. |

Mean ≈ 8.8/10. No dimension below 5 → no fallback to multi-variant required.

## Why not multi-variant
The CRITICAL constraint and the spec both mandate single-variant ratification: "the decision is the scroll rule and the primitive's slots, not a new look." Generating A/B/C looks would violate "consolidation, not redesign."
