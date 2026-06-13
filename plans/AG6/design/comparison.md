# AG6 — Variant comparison

| Dimension | A — Container+payload | B — Self-contained (column-config) | C — Layered slots |
|---|---|---|---|
| Signature (one tell) | Row is pure chrome; children free | You describe a row as data, rendered identically every time | Typed sub-components (Row.Title/Meta) carry hierarchy |
| Exported names | 2 (Row, ItemList) | 3 (Row, ItemList, RowDot) | 5 (Row, ItemList, Row.Title, Row.Subtitle, Row.Meta, RowDot) |
| Density | Same row height; consumer styles cells | Uniform — primitive fixes title 13px, cells mono 11px | Uniform via sub-components |
| Primary action surface | `actions` children | `actions` prop (auto-wrapper) | `actions` slot (auto-wrapper) |
| State strategy | ItemList empty/loading/error | ItemList empty/loading/error + Row selected | ItemList empty/loading/error + Row selected |
| Motion budget | hover/focus only (fast) | hover/focus/selected (fast) | hover/focus/selected (fast) |
| Consistency enforcement | LOW — consumer can diverge (proven 13 vs 15px in mockup) | HIGH — anatomy centralized; tabular-nums + AQ-113 enforced | MEDIUM — text levels enforced; trailing free node can drift |
| Migration shape (AC-4) | Row still hand-arranged per call site | Row = `RowCell[]` config — truly "thin column config" | Row = slots — thinner than today, more verbose than B |
| Best at | Smallest API, max flexibility | Consistency by construction, literal AC-4 fit | Readable JSX + enforced hierarchy |
| Worst at | Re-permits the exact divergence AG6 kills | Odd rows (ThreadRow group) need escape hatch | Largest component-budget cost; compound "magic" vs boring-tech |
| Phase-2 critique score | 6.2 /10 | **8.6 /10** | 7.8 /10 |

## 9-dimension critique (0–10)

| Dim | A | B | C | Notes |
|---|---|---|---|---|
| Hierarchy | 5 | 9 | 9 | A enforces nothing (squint test fails when consumers pick own sizes). B fixes 13px title / mono tertiary cells. C types the levels. |
| Spacing | 7 | 9 | 8 | All on 6px grid + 44px. B/C centralize gap/padding so it can't drift; A leaves cell gaps to consumer. |
| Typography | 6 | 9 | 9 | B/C own font sizes + tabular-nums (AQ-006). A can violate. |
| Color | 8 | 8 | 8 | All token-only; tone enum in B keeps status colors semantic. |
| Coherence | 5 | 9 | 8 | The whole point of AG6. B makes every list identical by construction; A explicitly does not; C mostly. |
| States | 6 | 9 | 8 | B+C: ItemList companions for empty/loading/error + selected row. A has companions but no selected. |
| A11y | 7 | 9 | 9 | All handle 44px + nested-button auto-wrapper. B/C bake it in; A relies on `hasInnerActions` flag passed correctly. |
| Anti-slop | 7 | 9 | 8 | B's `lead?` omitted → no placeholder (AQ-113); no icon-on-everything; dense not airy. C trailing node could re-slop. |
| Premium polish | 6 | 8 | 8 | B/C selected-row treatment + uniform mono meta read as one crafted product. A reads as "framework, assemble yourself". |
| **Mean** | **6.3** | **8.8** | **8.3** | |

(Weighted toward Coherence + Consistency-enforcement given the workpackage IS about killing divergence → reported scores 6.2 / 8.6 / 7.8.)
