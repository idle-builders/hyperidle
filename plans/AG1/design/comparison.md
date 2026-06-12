# AG1 — Variant comparison

Screenshots: `a-constrained-column/screenshot.png` (2000px), `b-summary-grid/screenshot.png` (2000px), `c-two-column-instrument/screenshot.png` (2000px) + `screenshot-2560.png`.

| Dimension | A — Constrained column | B — Summary header + column | C — Two-column instrument |
|---|---|---|---|
| Signature | One calm centered reading column, same shape as a bet detail | Dashboard summary bar of 4 stat tiles, read in one sweep | Status rail pinned right while work scrolls |
| Component count / new shapes | 0 new shapes — pure wrapper + width cap | 1 new shape (stat-tile strip replacing burn KeyValue list) | 1 new shape (right rail) + a new `2xl` breakpoint |
| Density | Medium (vertical) | High in header, medium below | High (parallel columns) at ≥1536px only |
| Primary action surface | Section action buttons in place | Same | Same |
| State strategy | Same layout all states; empties centered in column | Summary bar always renders (zeros) → empty looks measured | Rail always populated → empty has an anchored right side |
| Label/value pairing | KeyValues drift left/right inside 760px card (loose but readable) | **Structurally tight** — label sits directly above value in a narrow tile | **Structurally tight** — KeyValue in a 280px rail |
| Motion budget | None added | None added | None added (sticky is position-only) |
| Behavior-change risk | **Lowest** — burn block untouched | Low — burn presentation changes, same data | **Highest** — 3 layout regimes (≥1536 / 768–1536 / <768) to test |
| Fit with daily width (1280px) | Full single column (intended) | Full layout, tiles may wrap 2×2 | **Collapses to single column = Variant A** — headline win invisible at 1280 |
| Best at | Lowest review/regression surface; proves the convention fix | The morning health scan; tight pairing by construction; consistent with Work view 960px family | Keeping vitals pinned on very wide windows |
| Worst at | Health read is buried mid-page; lots of empty gutter at 2560 | Bet-vs-routine breakdown awkward in one tile; must avoid reading as AQ-108 grid | Empty right two-thirds at 2560 (max-w 1100); win only above 1536; most complex |
| Phase-2 critique score | 7.3 / 10 | **8.6 / 10** | 7.4 / 10 |

## Per-dimension critique (0–10) of the recommended base (B)
- **Hierarchy 9** — identity → vitals strip → work is the exact morning-scan order; the eye lands on the four numbers second.
- **Spacing 9** — all gaps on the 6px grid (12/18/24); tiles `p-[18px]`, column `p-[24px]`, section `gap-[24px]`.
- **Typography 9** — value `text-[20px]` (on scale), label `text-[11px]` mono caps with `--tracking-caps`; tabular-nums on every number (AQ-006).
- **Color 9** — warm tokens only; forest accent on status/value; no cool grays, no hardcoded color.
- **Coherence 9** — reuses the 960px `mx-auto` column the rest of the Work view already uses; tiles echo WorkBet's stat cards (`bet-stats-row`).
- **States 9** — summary bar renders in empty state with zeros so an empty team still looks measured; skeletons match the tile shape.
- **A11y 8** — tiles display-only (no new interactive targets); existing rows keep 44px targets + focus rings. Status color paired with text label ("Healthy") not color alone.
- **Anti-slop 8** — risk: a 4-card top strip can read as the AI-dashboard tell (AQ-108). Mitigated: 4 tiles of *different* content (not an identical `.map`), not a hero, in a productivity context; lint AQ-108 only fires on `grid-cols-3` + identical-children map, which this is not.
- **Premium polish 8** — the stat strip is the one distinctive, instrument-like gesture; warm shadows on bet cards keep tactile weight.

A scores lower on hierarchy (health buried) and pairing (loose). C scores lower on coherence/complexity (new breakpoint, empty wide windows, win invisible at the canonical 1280px width).
