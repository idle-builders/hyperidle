# AG6 — Synthesis

## Strongest base: **Variant B — Self-contained, column-config** (8.6)
The workpackage is fundamentally about *killing divergence*. Variant A fails the core test by design — its mockup literally re-creates the 13px/15px title split AG6 exists to eliminate. B makes consistency structural: the primitive owns title size, cell mono/tabular treatment, separators, hover, focus, 44px, and the nested-button wrapper decision. AC-4 ("a thin column config, not a hand-rolled row") maps onto B's `RowCell[]` almost word-for-word.

## Pulled in from C
- **`RowDot` as a tiny exported helper** for the 6px status dot. It appears in 5+ rows (agents, routines, threads, notifications) and is always hand-inlined today. Exporting it (rather than forcing every consumer to write the `<span class=dot>` themselves) is C's "typed sub-component carries the detail" insight applied minimally. Keeps the budget at 3 names (Row, ItemList, RowDot) not 5.
- **`tone` enum on cells/dot** (from B already, reinforced by C) so status color is semantic, never a raw hex.

## Pulled in from A
- **Keep the API genuinely small.** Resist C's full compound-component spread. B + `RowDot` is the floor; do not add `Row.Title`/`Row.Subtitle` exports — `title`/`subtitle` props suffice and read fine.

## Rejected (do not re-litigate)
- **Variant A wholesale** — rejected. A thin chrome-only container re-permits the divergence this workpackage exists to remove. Failed Coherence (5) and Consistency-enforcement.
- **Compound sub-components `Row.Title`/`Row.Subtitle`/`Row.Meta` as exports (C)** — rejected. 5 exported names overspends the component budget; plain `title`/`subtitle`/`cells` props get the same hierarchy enforcement with less surface. `RowDot` is the one sub-export that earns its place (used 5+ contexts).
- **A generic data-grid / sortable `<table>`** — rejected, out of scope. These are flat scannable lists, not sortable tabular data. No column headers, no sort, no resize. "Table" in the workpackage name means *consistent rows*, not a spreadsheet.
- **Keyboard-verb shortcuts on the primitive** (j/k/v/x) — rejected per TRACK founder filter. KnowledgeList's existing triage shortcuts stay in the page, not the primitive.
- **Migrating ThreadRow + CommentRow + BetRow in this pass** — rejected as scope. ThreadRow stays distinct (bespoke overlapping-avatar/presence/host-pill/blocking anatomy doesn't map to lead/title/cells without an escape hatch that would bloat the primitive). CommentRow stays distinct (message bubble, vertical sender-header + body, not a scannable row). BetRow stays a card surface (decision object, not a flat row) — only its list *container* could later use ItemList. Required migrations: **agents, routines, knowledge.** Notification popover row is opportunistic.

## Component decision summary (which existing rows compose the primitive)
| Row | Verdict | Reason |
|---|---|---|
| AgentRow (WorkTeam) | COLLAPSE → `Row` config | lead=dot+avatar, cells=[status, context], actions=[Customize]. Nested-button → auto `div role=button`. |
| RoutineRow (WorkTeam) | COLLAPSE → `Row` config | lead=dot, cells=[avatar, schedule, lastRun, cost]. |
| KnowledgeListRow (KnowledgeList local) | COLLAPSE → `Row` config | title+subtitle, cells=[kind tag, time]; triage variant keeps inline action buttons via `actions`. Delete local row. |
| BetRow (WorkTeam) | KEEP as card | Decision object; elevated card surface, not a flat row. Its list could use ItemList container only. |
| ThreadRow (ds) | KEEP distinct | Bespoke anatomy; rebuild base flex on Row only if zero-cost, else justified-distinct. |
| KnowledgeRow (ds) | OPTIONAL rebuild on Row | If cheap, recompose; not required this pass. |
| NotificationRow (ds) + popover row | Popover row COLLAPSE opportunistically | lead=dot, title, cells=[type label, time], actions=[mute, dismiss]. |
| CommentRow (ds) | KEEP distinct | Message bubble, not item row. |
