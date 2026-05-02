# L10 — Variants Comparison

Story: TRACK-L L10. Brief: `brief.md`. Sectioning fixed by L8 `approved.md` (not relitigated).

## Side-by-side screenshots

| | Frame 1 — filter active | Frame 2 — filter empty |
|---|---|---|
| **A** Pure axis | `Blocking` chip dark; list = Blocking section only (2 rows) | `Async` chip dark; EmptyState w/ description + `Clear filter` |
| **B** User-vocab | `Needs review` chip dark; list = Blocking section narrowed to review-needed rows | `Resolved` chip dark; EmptyState w/ description + `Clear filter` |
| **C** Segmented toggle | `[Blocking · Async]` segmented w/ Blocking active + persistent `× Showing blocking only — clear` pill; list = Blocking section only | Async segment active; pill remains; terse `No async threads.` |

(See `variant-*/screenshot.png` for the rendered artifacts.)

## Dimensional comparison

| Dimension | A — Pure axis (3 chips) | B — User-vocab (4 chips) | C — Segmented toggle |
|---|---|---|---|
| **Signature (one tell)** | Chip labels match the axis verbatim | J2 vocabulary preserved, wired honestly | Segmented shape encodes single axis |
| **Chip vocabulary** | `All / Blocking / Async` | `All / Needs review / Chats / Resolved` | `Blocking ⇄ Async` (no All) |
| **Component count delta vs L8** | 0 (existing chip pattern) | 0 (existing chip pattern) | 0 (DaisyUI `join` + `badge` — both already in stack) |
| **Density (chrome row)** | 1 row (3 chips) | 1 row (4 chips, may wrap) | 2 rows when filter active (control + pill); 1 row default |
| **Action surface for clear** | `All` chip OR `Clear filter` button (filter-empty only) | `All` chip OR `Clear filter` button (filter-empty only) | Active segment OR persistent `× clear` pill (any time) |
| **Default-state legibility** | `All` chip is explicit | `All` chip is explicit | Both segments inactive — implicit |
| **Axis fidelity** | Bijective (1:1 with `blocking ↔ ¬blocking`) | Asymmetric subset mapping (`Needs review ∪ Chats ⊊ All`) | Bijective (binary toggle) |
| **Empty-filter shape** | EmptyState w/ description + `Clear filter` text-button | EmptyState w/ description + `Clear filter` text-button | Pill (above list) + terse EmptyState (title only) |
| **Best at** | Smallest delta, axis match, one-day shippable | Vocabulary continuity for J2-trained founders | Axis encoded by shape, persistent recovery, density per filter row |
| **Worst at** | `Async` reads as engineering jargon | Asymmetric mapping silently violates "one axis, exhaustive" | First-time discoverability of default state; doubled clear surface |
| **`/design-critique` score** | **8.6 / 10** | **7.8 / 10** | **8.4 / 10** |
| **Component-budget cost** | 0 | 0 | 0 |
| **Founder-filter risk** | None | `Resolved` chip duplicates a section semantic | "Click active segment to clear" is non-standard |

## Score-driven recommendation

A and C both clear ≥8. A wins on minimum delta and bijective fidelity; C wins on shape semantics and recovery permanence. B is correct in spirit but the asymmetric mapping disqualifies it as the base.

**Recommend Variant A as the base, with one element pulled from C.** See `synthesis.md`.
