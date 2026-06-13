# AG4 — Variant comparison

| Dimension | A — In-pane header | B — Shell nav strip |
|---|---|---|
| Signature (one tell) | Nav cluster lives in the screen's own header, beside the breadcrumb | One persistent 40px strip above every screen, fixed top-left |
| Component count | 1 new (`Breadcrumb` DS) + 2 hooks; touches 4 page headers | 1 new (`Breadcrumb` DS) + 1 new (`NavStrip` shell) + 2 hooks; touches AppShell + deletes 4 page breadcrumbs |
| Density | Tighter — nav folds into existing header padding, no extra vertical band | +40px permanent band on every screen |
| Primary action surface | Per-screen header (detail screens only) | Global strip (all screens) |
| State strategy | No nav row on root/list screens; cluster only on detail | Strip always present; Back conditional on history, breadcrumb conditional on detail |
| Motion budget | Hover/focus color (motion-fast) only | Same |
| Best at | Minimal chrome; nav sits with content; roots stay clean; less AppShell surgery | Browser-grade muscle memory; back/forward always in the same pixel; one consolidated nav owner |
| Worst at | Back/Forward invisible on root screens (keyboard-only); cluster repeated per detail page (5th screen must remember it) | Permanent band risks reading as dead chrome on roots (the AG2 complaint); more AppShell structural change; slightly generic "toolbar" read vs Hearth-distinctive |
| Phase-2 critique score | 8.2 /10 | 7.6 /10 |

## Phase-2 critique (9 dimensions, 0-10)

| Dim | A | B | Notes |
|---|---|---|---|
| Hierarchy | 8 | 7 | A: nav recedes under title (correct — chrome below content). B: strip sits *above* title, pulling eye to chrome first, mildly violating Content-First. |
| Spacing | 9 | 8 | Both on 6px grid (9/12/18/24/3). B adds a 40px band; A reuses existing 18px header pad. |
| Typography | 9 | 9 | Both 13px tertiary breadcrumb / 20px-600 title. Identical, matches existing. |
| Color | 9 | 9 | Tertiary chrome, accent-on-hover, status chips. Warm, no violations. |
| Coherence | 8 | 8 | Both consolidate the 4 divergent breadcrumbs into one. A keeps WorkTeam's chip-style outlier convertible; B forces uniformity (good). |
| States | 8 | 7 | A: clean root state = nothing. B: must actively suppress the strip's emptiness on roots or it looks dead. Both handle deep-link (Back disabled, Up always present). |
| A11y | 8 | 8 | Both: `aria-label` on icon buttons, `<nav aria-label="Breadcrumb">`, disabled vs hidden chosen deliberately, focus rings. ⌘[/⌘] + ⌘1/2/3 keyboard-complete. |
| Anti-slop | 9 | 7 | A: zero AI tells. B: a persistent top toolbar with two grey chevrons edges toward generic-app-chrome; needs care to stay Hearth-distinctive. |
| Premium polish | 7 | 8 | B's always-same-spot back is the more "premium" muscle-memory feel *when populated*; A is quieter but slightly less discoverable on roots. |

A wins on hierarchy, anti-slop, and least-surface-change; B wins on discoverability/muscle-memory but pays with permanent chrome and a dead-chrome risk the codebase has already been burned by (AG2).
