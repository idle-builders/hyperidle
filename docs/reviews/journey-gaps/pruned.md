# Pruned Gaps (Wave 4)

Kept here for inspection — not in the actionable registry.

These items were either (a) cosmetic-only and not journey-blocking, (b) covered by a parent cluster in `registry.md`, or (c) caused by stub/seed-only state that resolves automatically once the data layer ships.

| Source gap | Reason for pruning |
|---|---|
| A.DL-02 "MOCK_REVIEWS contains only one thread" | stub-state, will resolve with data layer — once the queue rendering cluster (registry rank 1) consumes real backend data, the count problem resolves. |
| A.DL-05 "MOCK_REVIEWS only has text_diff and data_metrics shapes" | covered by parent cluster (rank 7 artifact-kind renderers) — same root cause. |
| A.DL-16 "Architect / Sprint planning thread instead of Coach" | stub-state, will resolve with data layer — Coach thread cluster (rank 9) covers the surface; the seed-data label is not a UI gap. |
| A.DL-09 "Blocker says 'Waiting for API spec' without duration" | covered by parent cluster (rank 6 Rail interactivity bridge) — duration is one of the per-blocker missing fields listed under that cluster. |
| A.DL-03 "reasoning above the diff hurts 15s flow" | designer call, not a journey blocker — listed in registry rank 2 trade-off note ("instant-with-undo vs pre-fill-confirm"); separate routing decision, not its own gap. |
| A.notes "Cmd+K opens search but `/` does not" | covered by parent cluster (rank 19 ⌘K broken) — the missing `/` shortcut is a discoverability nit on top of the broken search; fixing the 500 is the load-bearing fix. |
| B.J20 "shaped status chip renders as PAUSED" | content/mapping bug, covered as sub-bullet under rank 23 (pitch-selector commit handler stub). |
| B.J19 "Rail blockers are global, not bet-scoped" | covered by parent cluster (rank 11 bet decision affordances) — bet-scoped blockers section is one of its sub-items. |
| B.cross-route "Breadcrumb is one-way" | covered by parent cluster (rank 10 missing route shapes) — once the leaf routes exist, the breadcrumb targets become real. |
| C.RE-02 "Settings → Agents Pause has no confirmation chrome" | covered by parent cluster (rank 5 recovery verbs) — confirm + blast-radius preview is listed as a recovery-verb hallmark across the cluster. |
| C.RE-08 "no API-unavailable indicator" | covered by parent cluster (rank 25 system-stability strip) — API-degraded is one of the strip entries. |
| D.D-mobile-portfolio "red dots float over WOR text in IconRail" | cosmetic-only artifact of the broken responsive layout — fixing rank 3 (mobile breakpoint) eliminates the overflow. |
| C.cross-cutting "no `?` shortcut" | covered by parent cluster (rank 24 help / coach mark) — same surface, same fix. |
| A.notes "More-menu popover layout overlaps items" | tracked as sub-bullet under rank 28 (composer hide-on-empty + small UX bugs); cosmetic on a rank-13 surface, not its own cluster. |
