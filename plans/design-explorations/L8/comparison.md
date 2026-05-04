# L8 — Variant comparison

| Dimension | A — Host-grouped | B — Recency + status | C — Blocking / Active / Resolved |
|---|---|---|---|
| **Signature (one tell)** | A directory of *what is being discussed* | A chronological stream split by closure | A verdict-gate dashboard with red shouting top |
| **Number of sections** | 5 (CoS, Bets, Tasks, Knowledge, Other) | 2 (Active, Resolved) | 3 (Blocking, Active, Resolved) |
| **Pinned coach treatment** | Own section "Chief of Staff" | Pin glyph + top-of-Active | Pin glyph + top-of-Active |
| **Blocking treatment** | Row indicator (red border + chip) | Row indicator + sort-rank-1 inside Active | Dedicated section + row indicator |
| **Density (rows visible @ 720h)** | ~7 rows + 5 headers = 12 chrome lines | ~10 rows + 2 headers = 12 chrome lines | ~9 rows + 3 headers = 12 chrome lines |
| **Primary action surface** | Selection (lifted id) | Selection | Selection |
| **State strategy** | One canonical layout; CoS has special empty | One canonical layout; Active has audible empty | Asymmetric empties (Blocking silent, Active audible, Resolved silent) |
| **Sticky headers** | None | Active sticky | Blocking sticky (when present) |
| **Motion budget** | Hover 80ms; selection 80ms | Same + sticky CSS | Same + sticky CSS + 80ms section appear when first blocking lands |
| **Best at** | Host-kind discoverability; long-term scale | Chronological reading; mobile feed feel | Foregrounding "is anything blocking?" |
| **Worst at** | Burying the blocking-now signal | Blocking visibility depends on data layout | Host-kind needs row-level host tag |
| **Critique score** | 7.9/10 | 8.2/10 | **9.0/10** |

## Screenshots

- A — `variant-a-host-grouped/screenshot.png`
- B — `variant-b-recency-status/screenshot.png`
- C — `variant-c-blocking-active-resolved/screenshot.png`

## Differs on (anti-convergence check)

| Pair | Hierarchy | # sections | Pinned coach | Blocking | Density | Sticky |
|---|---|---|---|---|---|---|
| A vs B | host vs time | 5 vs 2 | section vs row glyph | row vs row+sort | thinner vs denser | none vs Active |
| A vs C | host vs blocking | 5 vs 3 | section vs row glyph | row vs section | thinner vs medium | none vs Blocking |
| B vs C | time vs blocking | 2 vs 3 | identical | row+sort vs section | denser vs medium | Active vs Blocking |

A vs B differ on 6/7 axes. A vs C differ on 6/7 axes. B vs C differ on 4/7 axes — B and C are the closer pair (both treat the pinned coach as a row glyph; both feel "stream-like"). The convergence is acceptable because B and C still differ sharply on the *primary axis* (time vs blocking) and the section count (2 vs 3). Variants are sufficiently spread.
