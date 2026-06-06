# AB2 Design Comparison

## Side-by-side

| Dimension | Variant A (Enhanced Card) | Variant B (Dense Row) |
|---|---|---|
| **Signature** | Two-row card with context line (task/role/error) | Flat table rows with health dot column |
| **Component count** | 0 new (reuses Avatar, StatusChip pattern, Tag, Button) | 0 new (reuses Avatar, Button, RoutineRow pattern) |
| **Density** | ~75px per agent (card padding + two rows + gap) | ~44px per agent (row height + hairline) |
| **Primary action surface** | Card click -> profile; Customize button -> edit dialog | Row click -> profile; no inline edit |
| **State strategy** | Card Row 2 changes content per status | Status column + task column change per status |
| **Motion budget** | Card hover: bg elevation transition (--motion-fast) | Row hover: rgba tint (--motion-fast) |
| **Best at** | Readability. Each agent has room to breathe. Error details are fully visible. Touch-friendly. | Scan speed. 6 agents in ~264px. Health dot column enables peripheral anomaly detection. |
| **Worst at** | Vertical space. 6 agents = ~450px. Section dominates the page at scale. | Detail sacrifice. Task names truncate aggressively. Lead label is cramped. |

## Critique scoring (9 dimensions)

| Dimension | Variant A | Variant B |
|---|---|---|
| 1. Hierarchy | 7 — Name is primary, status/health secondary. Clear but not novel. | 8 — Health dot leftmost for peripheral scan. Name/status/task in reading order. |
| 2. Spacing | 8 — Hearth grid compliant. 12px card padding, 6px gaps. | 8 — Hearth grid compliant. 9px row gaps, 6px padding. |
| 3. Typography | 7 — 13/12/10px scale. All on-scale. | 8 — 13/11/9px scale. Mono status labels match RoutineRow. |
| 4. Color | 8 — Semantic tokens throughout. Status colors used correctly. | 8 — Semantic tokens throughout. |
| 5. Coherence | 7 — Cards match BetRow pattern but not RoutineRow. Mixed metaphors on the page. | 9 — Rows match RoutineRow exactly. Consistent "flat list" grammar for non-bet sections. |
| 6. States | 7 — Empty, populated, error agent all handled. No loading (parent handles). | 7 — Same state coverage. |
| 7. A11y | 7 — role="button" + tabIndex + keyboard. Nested link + button is complex. | 8 — Semantic button element. Simpler focus model. |
| 8. Anti-slop | 8 — No AI aesthetics. Warm palette. Dense. | 9 — Maximum anti-slop. Dense, purposeful, no decoration. |
| 9. Premium polish | 7 — Solid but expected. Card-with-status is the default pattern. | 7 — Clean but utilitarian. The table feel could be too austere. |

| **Total** | **66/90** | **72/90** |
