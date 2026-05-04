# L15 — Comparison of three variants

Side-by-side. Critique scores from `*/critique.md`.

---

## Comparison table

| Dimension | A — Inline action row | B — Thread-first overflow | C — Right-rail drawer |
|---|---|---|---|
| **Signature (one tell)** | Two equal-weight links in a 28px-tall card footer separated by a 1px subtle divider; popover anchored to the trigger; popover carries the optional note. | A loud thread chip (with unread dot when applicable) + a quiet `…` overflow trigger; the asymmetry is the thesis. | Card click promotes the task to a 360px dock on the right; selected card carries a `--primary` left border; thread + action footer live in the dock. |
| **Component count added** | **0** new components. Slot extension on `TaskCard` + DaisyUI `dropdown` markup + existing `Tag`. | **0** new components. Slot extension + DaisyUI `dropdown` + a one-prop extension on `Tag` (optional dot). | **+1 Tier 3** (`TaskDrawer`) wrapping ThreadShell + sub-components. |
| **Component count deleted** | DnD scaffolding from `Kanban.tsx` (sensors, droppables, draggables, DragOverlay). | Same (DnD scaffolding from Kanban). | Same (DnD scaffolding from Kanban). |
| **Card silhouette change** | +28px (footer + divider). | +16px (one row, no divider). | 0px (card unchanged). |
| **Hierarchy on the card** | Equal weight: `Request ▾` and `Thread (N)` side by side. | Asymmetric: chip dominant, `…` recedes (40% opacity at rest). | Card has no on-card request affordance; click body opens drawer. |
| **Where the verbs render** | 240px popover anchored to the card. Includes optional note + Cancel/Send. | 200px overflow menu anchored to `…`. Verbs auto-send on click; no confirm. | Verb buttons inline in the dock's bottom action footer; verb-confirm popover above the clicked button with optional note. |
| **Where the thread opens** | Route to `/work/teams/:teamId/tasks/:taskId/thread`. Page transition, browser back returns. | Same route. | Inside the dock. No route change. URL is a query string. |
| **Volume strategy (multi-task workflow)** | One card at a time; popover dismisses on outside click; no batched UX. | Open thread once, do everything from the thread; chip + `…` are quick per-card paths. | One drawer; click another card → contents swap in-place; URL-shareable. |
| **Discovery cost for the request affordance** | Lowest — labelled `Request ▾` always visible. | Medium-high — `…` at 40% opacity at rest, hover-revealed; relies on familiarity with overflow grammar. | Highest — no on-card hint; click-to-discover. |
| **Layout cost when activated** | Popover overlays the card. No layout reflow. | Overflow menu overlays. No layout reflow. | Kanban reflows from 4 → 3 (or 2) columns; Rail auto-collapses to icon-only. |
| **Mobile adaptation** | Bottom sheet for the popover. Card layout unchanged. | Bottom sheet for the overflow menu. | Full-screen sheet replacing the Kanban; back-chevron returns. |
| **Anti-slop check** | No tells in the screenshot. | `…` at 40% opacity reads as design indecision; `▢`/`●` glyphs have a fallback risk. | Two-stacked-footers (composer + action footer) reads as under-edited. |
| **Best at** | Lowest component-budget cost. Most discoverable. Mirrors L1 verdict popover grammar. Card silhouette change is a one-time cost the founder pays once. | Smallest card growth. Asymmetric attention is opinionated and defensible. Unread signal is high-value polish. | Best spatial linkage between Kanban and detail. Reuses ThreadShell at maximum value. URL-shareable. The thread + actions are co-located. |
| **Worst at** | Equal-weight footer means two competing affordances that don't differentiate by frequency of use. No batched/multi-card workflow. | `Kill` posts on click with no confirmation — high regret cost. Touch targets fail AQ-015 at 32×32. `…` discoverability gap. | Adds a Tier 3 component to the budget. Two-footer ambiguity. Kanban shrinks on every drawer-open. Composer fails AQ-005 mobile font-size. |
| **Critique score (H/S/T/C/Co/St/A/AS/PP)** | 8/8/8/9/9/7/7/8/6 = **70/90** (7.7 avg) | 8/9/7/8/9/6/5/6/4 = **62/90** (6.9 avg) | 9/7/8/8/5/8/7/7/6 = **65/90** (7.0 avg) |

---

## Screenshots

- A — Inline action row: `inline-action-row/screenshot.png`
- B — Thread-first overflow: `thread-first-overflow/screenshot.png`
- C — Right-rail drawer: `right-rail-drawer/screenshot.png`

---

## Where the spread paid off

The four axes that produced the most informative differentiation:

1. **Where does the verb list render?** Anchored popover (A) vs overflow menu (B) vs inline footer in a dock (C). Each is a defensible answer to "how does the user pick a verb." A is most discoverable; C is most contextual; B is fastest.

2. **Should the request affordance be on the card or in a peek surface?** A and B put it on the card (the popover/menu emerges from the card). C puts it in a separate dock that the card opens. This is the load-bearing UX disagreement.

3. **Equal weight or asymmetric?** A treats request and thread-open as equal-weight. B says they aren't — the thread is the loud act, the request is the quiet act. C says neither belongs on the card; both go in the dock at equal weight.

4. **Optional note on the request: where does it live?** A: in the popover (offered, can be blank). B: nowhere on the card path — context goes in the thread's natural composer. C: in a verb-confirm popover (optional, can be blank).

These four axes are where any synthesis must take a position.

---

## Where they converge (and that's fine)

- **All three delete drag from `Kanban.tsx`.** The DnD scaffolding (DndContext, sensors, droppables, draggables, DragOverlay) goes away in every variant.
- **All three preserve drag on the Canvas (Shaped → Committed).** Spec mandate; no variant violates it.
- **All three post a `plain` message to the task's L1 thread.** No new `MESSAGE_TYPES` enum entry. No new dispatch path.
- **All three derive the verb list from `task.state`** via a pure function over the brief's Probe 2 table.
- **All three reuse the existing `ThreadShell` (L1) for the thread surface** — no new thread component.
- **All three honour the founder filter** (no keyboard verb shortcuts, no emoji reactions, no optimistic-UI bragging, no drag).

Convergence here is correct — the brief made these non-negotiable. The variants explore *how* the affordance surfaces, not *whether* the request mechanic exists.

---

## Score & gate result

| Variant | Score | Pass ≥7 gate? | Notes |
|---|---|---|---|
| A | 7.7 | Yes | Highest score. Lowest component cost. Most discoverable. |
| B | 6.9 | No (close) | One critical (Kill no-confirm) + two warnings push below the gate. Recoverable. |
| C | 7.0 | Yes (just) | Component-budget pressure + two-footer ambiguity. Strong hierarchy. |

Per the design skill, scores 5-7 advance with noted findings (B clears that bar). All three variants enter Phase 4 synthesis.
