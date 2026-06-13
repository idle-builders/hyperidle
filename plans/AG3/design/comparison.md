# Comparison — AG3

Routine class → one variant. The "comparison" is the single variant scored against the rubric, plus the rejected directions (see synthesis.md) that a multi-variant pass would have produced.

| Dimension | Full-page parity (chosen) |
|---|---|
| Signature (one tell) | Chassis pixel-indistinguishable from `/knowledge/new`; only the aside (team+appetite) and derived-not-typed title differ |
| Component count | 0 new shapes; reuses `BodyEditor`, `Select`, `Input`, pill buttons, page layout copied from `KnowledgeCreate` |
| Density | Matches Knowledge create exactly (24px page padding, 18px card padding — on grid) |
| Primary action surface | Top-right Create pill (accent), same slot as Knowledge |
| State strategy | One canonical layout; states swap copy/disabled (empty/writing/submitting/error/success) |
| Motion budget | `--motion-fast` color transitions on controls only; no layout motion |
| Best at | Faithfulness to the founder's "exact same experience" demand; lowest build risk; fixes back-button journey for free (real route, not modal) |
| Worst at | 240px aside is sparse with two short controls (inherited from Knowledge; accepted for parity) |

## In-session 9-dim critique (chosen variant)

| Dim | Score | Note |
|---|---|---|
| Hierarchy | 9 | Editor dominates; commitments peripheral; Create clearly primary |
| Density | 8 | On-grid; aside slightly sparse but matches Knowledge |
| Anti-slop | 9 | No AI tells; warm Hearth palette; system fonts; no hero/gradient/3-col grid |
| States | 8 | All five covered; abandon handled structurally (no POST = no half-bet) |
| Consistency | 10 | Literally the Knowledge chassis — maximum cross-surface consistency |
| Interaction grammar | 8 | Cancel/Create + native back; Select for pickers (AG5) — one grammar |
| Motion | 8 | Token-bound, restrained |
| Accessibility | 8 | breadcrumb nav landmark, role=alert errors, ≥16px mobile inputs, 44px targets via pill padding |
| Copy | 8 | Terse, honest ("Leave blank for an uncapped bet"); no superlatives |

**Aggregate: 8.4 / 10.** No dimension below 7 → low-confidence fallback NOT triggered → single variant stands.

Screenshot: `full-page-parity/screenshot.png`.
