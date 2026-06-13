DESIGN-CLASS: novel  ref=none  pattern=ThreadRow.html/KnowledgeRow.html (analogous molecules, but no general Row/ItemList base)

# AG6 — Shared item-row / table primitive — Brief

## User task
A founder scans a list — team agents, team routines, portfolio bets, knowledge items, settings — and needs every list to feel like one product: same alignment, separators, hover, focus, touch target. A new list must be composed, never hand-rolled.

## Why this is novel
There are four catalogued row *molecules* (ThreadRow, KnowledgeRow, CommentRow, NotificationRow) that independently re-implement the SAME anatomy, plus three hand-rolled Work-view rows (AgentRow, RoutineRow, BetRow in `WorkTeam.tsx`) and two reimplementations of catalogued rows (`KnowledgeListRow` in `KnowledgeList.tsx`, the notification row inside `NotificationPopover.tsx`). There is **no general base**. The shape itself — a row primitive + its list container — is what's being decided. Per the design skill hard rule, a new design-system primitive is always `novel` → 3 variants.

## Anatomy distilled from the 9 existing rows
Every row, without exception, is:
`flex items-center gap-[9–12px]` →
  [leading indicator: 6–8px status dot OR 24px avatar/icon circle — optional] →
  [main column: `flex-1 min-w-0`, title (truncate) + optional subtitle/preview/signals] →
  [trailing meta cells: fixed-width, mono, 11–12px, tertiary, often tabular-nums — 0..N] →
  [trailing actions slot: buttons — optional]

Variance to reconcile (NOT essence):
- **Padding:** ds rows `px-[24px] py-[12px]`; work rows `px-[6px]` + 44px min-height; notification `9px/12px`.
- **Separator:** ds rows `border-b border-subtle last:border-b-0`; work rows same hairline; KnowledgeRow uses `rounded-subtle` hover (no border). Container: work rows wrapped in `rounded-subtle bg-surface-container p-[12px]`; ds rows have no container.
- **Interaction wrapper:** ThreadRow/KnowledgeRow = `div` via `clickableProps`; RoutineRow/BetRow = `<button>`; AgentRow/NotificationPopover row = `div role=button` (because a nested real `<button>` lives inside → AQ a11y constraint).
- **Touch target:** work rows force `min-h-[44px]`; ds rows rely on `py-[12px]` (≈48px) — both satisfy AQ-015 but inconsistently expressed.

## Reuse inventory (Phase 0b — hard gate)
| Visual element needed | Existing component | Verdict |
|---|---|---|
| Status dot (6–8px colored) | inline in every row | NEW sub-part of primitive — appears in 5+ rows, never extracted |
| Leading avatar/icon circle | `Avatar` (sm/md/lg) | REUSE — passed as a node into a leading slot |
| Status pill | `StatusChip` | REUSE — passed as a cell |
| Category/kind/layer tag | `Tag` | REUSE — passed as a cell |
| Title + subtitle column | inline everywhere | NEW — this is the core of the primitive |
| Trailing meta cell (mono tertiary) | inline everywhere | NEW — `Row.Cell` style slot, appears 8+ times |
| Trailing actions | `actions?: ReactNode` prop on 4 rows | REUSE pattern — keep `actions` slot |
| Empty state | `EmptyState` | REUSE — list companion renders it |
| Loading state | `SkeletonList` | REUSE — list companion renders it |
| Error state | `ErrorState` | REUSE — list companion renders it |
| List container (rounded + surface-container wrapper) | inline in WorkTeam | NEW — the `ItemList` container companion |

The base `Row` + `ItemList` are genuinely NEW: no current component is a *general* row that accepts arbitrary leading/main/trailing content with consistent alignment, separator, hover, focus, and touch-target treatment. Everything *inside* a row reuses existing primitives.

## Interrogation — settled reads
1. **Primary state:** populated (long lists of agents/bets/knowledge). Empty is common for new teams; loading is brief. → primary view = populated; empty/loading/error handled by the list container companion.
2. **Primitive vs extension:** new primitive `Row` + container `ItemList`. The 4 catalogued rows become thin wrappers that compose `Row` (or are justified as distinct). The 3 work rows + KnowledgeListRow collapse onto `Row` config.
3. **What truncates when dense:** title truncates (`min-w-0 truncate`); trailing meta cells are fixed-width and never wrap; the leading indicator and trailing actions never shrink (`shrink-0`).
4. **Nested-button a11y constraint (HARD):** when a row has BOTH a row-level click (navigate) AND inner real `<button>` actions (Customize, mute, dismiss), the row wrapper MUST be `div role="button"` + tabIndex + onKeyDown — never a real `<button>` (invalid nested-button HTML, breaks SR + hydration). The primitive must pick the correct wrapper automatically based on whether `actions` contains interactive children — or expose it as an explicit prop. This is non-negotiable (AB2 S4/W4, AF8 W1 lore).
5. **Touch target:** every interactive row guarantees ≥44px min-height at viewport ≤1024px (AQ-015). The primitive owns this — consumers can't forget it.
6. **Tabular numerals:** trailing numeric meta cells get `font-variant-numeric: tabular-nums` (AQ-006).

## Decision: which existing rows compose the primitive
- **AgentRow, RoutineRow, BetRow** (work view): COLLAPSE onto `Row` + `ItemList`. BetRow is a borderline case (it's a card, not a flat row) — evaluate in variants; likely stays a `BetCard`-style surface, but its *list container* still uses `ItemList`. Spec migrates agents + routines as the two required Work-view lists, plus KnowledgeList as the "one more".
- **KnowledgeListRow** (local reimpl in KnowledgeList): COLLAPSE — delete local row, render through primitive (or the catalogued `KnowledgeRow` rebuilt on the primitive).
- **ThreadRow:** has heavy bespoke anatomy (overlapping avatar group, presence dots, host pill, blocking badge, unread weight). KEEP DISTINCT but rebuild its base layout on `Row` if cheap; otherwise justify staying separate. Decide in synthesis.
- **CommentRow:** message stream, vertical sender-header + body, `<li>` semantics, NOT item-row anatomy → STAYS DISTINCT (justified: it's a comment/message bubble, not a scannable list row).
- **NotificationRow (catalogued) + NotificationPopover row:** notification inbox → COLLAPSE the popover row onto the primitive; reconcile the catalogued `NotificationRow` padding (12px/24px) vs popover (9px/12px) by adopting one anatomy. (Out of scope to fully migrate every surface — popover is the "opportunistic" target; required scope is agents + routines + knowledge.)

## Out of scope
AG5 dropdown, AG7 settings pass, converting every list. Required: agents + routines + one more (knowledge). Bet card stays a card.
