# Variant C — "Two-column instrument"

**Constraint (reference-borrowed):** take KnowledgeDetail's main+sidebar grammar (already in this codebase: `max-w-[960px]` main column + `w-[240px]` sticky sidebar). At wide desktop, put the team's **work** in a primary column and the team's **status** (identity, burn-vs-cap, capacity) in a fixed right rail that stays visible while the work scrolls.
**Thesis:** a proven in-repo interaction grammar (the detail-page sidebar) lets the founder keep the health read pinned while drilling through bets and agents — parallel reading, not sequential.

## User task
Drill through bets / routines / agents while the team's vitals (burn, cap, capacity, status) stay glance-able in the rail — answer "healthy?" at any scroll position.

## Composition
Root: `flex-1 overflow-y-auto` wrapping `flex gap-[24px] max-w-[1100px] mx-auto w-full p-[24px]`.
- **Primary column** (`flex-1 min-w-0 flex flex-col gap-[24px]`): breadcrumb, team name + status, then Active bets → Routines → Agents → Artifacts.
- **Status rail** (`w-[280px] shrink-0 flex flex-col gap-[18px]`): a `--surface-container` card holding the burn-vs-cap KeyValue list + capacity + progress bar, plus phase/lead. KeyValue's `justify-between` now operates inside a 280px rail — label and value are inherently adjacent. The rail's content is what KnowledgeDetail's sidebar does for metadata.

**Responsive collapse:** at `< 1536px` (and on mobile) the rail drops below the primary column and the layout becomes a single capped column (`max-w-[760px]`), identical in shape to Variant A. The two-column form is a *wide-desktop enhancement*, not the only layout — guarded by a `2xl:` (1536px) breakpoint so 1280px gets the safe single column.

## Information hierarchy
1. (Rail) Team name context + burn-vs-cap — pinned vitals.
2. (Primary) Active bets — the work.
3. (Primary) Routines / Agents.
4. (Primary) Artifacts.
The eye can move between "what's the work" (left) and "are we healthy" (right) without scrolling.

## States
- **Empty team:** primary column shows EmptyStates for bets/routines/agents; the rail still shows burn-vs-cap (zeros / no cap) and capacity. The rail anchors the page so an empty team still has a populated, intentional-looking right side. Hints render in the primary column.
- **Loading:** skeleton primary column + skeleton rail card.
- **Error / 404:** centered ErrorState/EmptyState (single column, no rail).
- **Overflow:** rail is fixed-width; its KeyValues never drift. Primary column names truncate as today.

## Behavior
- Rail is display-only (no new affordance). Sticky is optional (`self-start` + `sticky top-[24px]` on the rail) — keeps vitals visible while the primary column scrolls. Sticky uses position only, no animation (AQ-014 safe).
- Rows, dialogs, hints, navigation: unchanged.

## Mobile adaptation
Below 1536px the rail moves below content; below 768px it's the existing single-column mobile stack. The mobile experience is byte-for-byte the current one.

## Signature
A **status rail** pinned to the right while the work scrolls — the team's vitals never leave the viewport.

## Trade-offs
- Highest structural change and the most layout states to test (two-column ≥1536, single-column 768–1536, mobile <768). Adds a breakpoint the other Work pages don't use (`2xl`). At 1280px (the founder's actual width per the report) it renders as single-column — so the headline two-column win only appears above 1536px, which may be wider than the daily window. Most complex to keep regression-free; most review surface.
