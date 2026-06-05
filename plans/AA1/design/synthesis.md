# AA1 Design Synthesis

## Strongest base: Variant B (Integrated Status Table)

Variant B wins on the dimension that matters most for routines: **scanning speed for health status.** A team lead looks at routines to answer "is everything running?" -- not to read individual routine names. The status-dot-first hierarchy, flat table in a container card, and side drawer for detail all serve this task better than Variant A's uniform bet-row pattern.

## Elements pulled in from Variant A

1. **Inline expansion as the detail surface instead of a side drawer.** The side drawer is a new interaction pattern that adds complexity (focus trap, drawer state management, mobile adaptation). Variant A's inline accordion expansion is simpler and consistent with progressive disclosure within the same scroll context. However, the expansion content should be more compact than Variant A proposed -- a summary of key KVs + a "View full history" link that navigates to a dedicated routine detail page if run history is long.

   **Decision: Neither.** Instead of drawer or accordion, clicking a routine row navigates to a dedicated route `/work/routine/:id` -- consistent with how bet rows navigate to `/work/bet/:id`. This is the simplest pattern, requires no new interaction grammar, and gives the detail page full room for run history. The detail page uses the same layout as a bet detail page: breadcrumb + heading + KV grid + run history table.

2. **Portfolio routine count from Variant A's approach.** Team pill labels in WorkPortfolio become `{teamName}` with a small routine count annotation. The simplest surface: the TeamListItem type gains a `routineCount` field. The portfolio header summary line includes routine count.

## Explicitly rejected

1. **Side drawer for routine detail.** Adds interaction complexity (focus trap, escape handler, drawer state, mobile pushes to full-screen) for no meaningful benefit over a full page. Bets use full pages; routines should too for consistency.

2. **BetRow-identical row shape for routines.** Making routines look identical to bets creates confusion. The container-card flat-table shape from Variant B is correct.

3. **Inline accordion expansion for detail.** Run history can have many rows. Accordion expansion within the team page scroll area would push the roster and artifacts off-screen. A full page is the right surface.

4. **Routine count in pill labels with slash notation.** "Growth 3/2" is cryptic. "Growth (3b, 2r)" is ugly. Better: add routine count as a subtle annotation elsewhere.

## Final direction: Variant B with full-page detail

### WorkTeam page (R5 section)

- Container card (`bg-[var(--surface-container)]`, `rounded-[var(--r-subtle)]`, `p-[12px]`)
- Flat rows with hairline separators, 36px height
- Status dot (6px, leftmost) + name (13px medium) + agent avatar (24px, green-tinted) + schedule (11px mono) + last run (11px mono, right-aligned) + cost (11px mono, right-aligned)
- Click navigates to `/work/routine/:id`
- Empty state inside container

### Routine detail page (`/work/routine/:id`)

- Breadcrumb: "Portfolio > Growth > Post-bet retrospective"
- Heading: routine name (17px semibold) + StatusChip
- KV grid (2 columns): agent, schedule, trigger type, autonomy, next run, cumulative cost, last run outcome
- Run history table: time, duration, outcome (status dot), cost
- Action buttons: Pause/Resume, Trigger Now

### WorkPortfolio

- TeamListItem gains `routineCount: number`
- Portfolio summary in header: "12 bets across 3 teams -- 8 routines active" below the "All bets" heading
- BetCard does NOT gain routine props -- routines are not displayed as cards in the portfolio

### Portfolio team pills

- No change to pill labels. The summary line carries the aggregate routine count.
