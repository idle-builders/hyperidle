# Variant A — Parallel Rows (Stay Close to BetRow Pattern)

**Constraint:** Smallest possible component count. Reuse the exact BetRow pattern from WorkTeam.tsx for routines. The routine section mirrors the active bets section: same heading style, same row shape, same click behavior pattern.

**Thesis:** Routines and bets are both "work this team does." Treating them as visually parallel -- same row container, same interaction grammar -- makes the team lead scan one unified work surface. The only difference is in the metadata slots.

## User task

Team lead opens Work/Team page, sees bets and routines in the same visual language, scans status of recurring work alongside one-time work, clicks a routine to see run history.

## Component composition

### WorkTeam page (new R5 section)

- Section heading: `<h2>` with existing uppercase/tertiary/xs style (matches "Active Bets" heading)
- Routine rows: `<button>` elements styled identically to the existing BetRow inline component
- Each row is a single-line horizontal layout:
  - **Slot 1 (flex-1):** Routine name (text-xs, font-medium, text-primary, truncate) -- mirrors BetRow's `bet.descriptionTitle`
  - **Slot 2:** StatusChip (`healthy` / `paused` / `error`) -- mirrors BetRow's StatusChip
  - **Slot 3:** Schedule badge (text-[10px], font-mono, text-tertiary) -- e.g. "Mon 10am" or "Every 15m"
  - **Slot 4:** Last run indicator (6px dot: green for success, red for failure, gray for never-run) + relative time (text-[10px], font-mono, text-tertiary) -- e.g. "2h ago"
  - **Slot 5:** Cost (text-[10px], font-mono, text-tertiary) -- formatted money, same position as BetRow's cost

- Empty state: EmptyState component ("No routines", "This team has no recurring work configured.")

### Routine detail (inline expansion)

On click, the row expands below to show a detail panel:
- Container: `bg-[var(--surface-container)]`, `rounded-[var(--r-subtle)]`, `p-[18px]`
- Top section: KeyValue pairs in a 2-column grid
  - Name | Agent
  - Schedule (full cron description) | Trigger type
  - Next run | Autonomy level
  - Cumulative cost | Last run outcome
- Bottom section: "Recent Runs" heading (same uppercase style) + a compact table
  - Columns: Time | Duration | Outcome (StatusChip) | Cost
  - Max 10 rows, most recent first
  - If no runs: "No runs recorded yet."

### Work portfolio (routine count badge)

In the portfolio header area, alongside the status filter pills and team pills, add a small annotation:
- After each team pill, append a routine count in parentheses if > 0: "Growth (2 routines)"
- Or: add a KeyValue row in the header: "Routines across teams: N"
- Simplest: each BetCard in the portfolio grid gains an optional `routineCount` prop. When supplied, renders a small mono annotation: "3 routines" below the description or in the footer area.

Actually, the portfolio does not show team-level cards anymore (U9 restructured to flat bet grid). The spec says "routine count per team alongside bet count." The cleanest surface: add routine count to the team pill filter labels. "Growth (3 bets, 2 routines)" or just "Growth 3/2" with a tooltip.

Decision: Team pill labels show `{teamName} ({betCount} / {routineCount})` where the second number is routine count. This requires no new visual element -- just richer pill label text.

## Information hierarchy

1. **Primary:** Routine name (the thing you scan for)
2. **Secondary:** Status chip (the state you care about)
3. **Tertiary:** Schedule, last run time, cost (scanning metadata)

## States

### Empty (no routines)
EmptyState component: "No routines" / "This team has no recurring work configured." Left-aligned per AQ-008. data-testid="team-routines-empty".

### Loading
SkeletonCard with aria-label="Loading routines" (same as existing bet skeleton).

### Error
ErrorState component: "Failed to load routines" / error.message.

### Populated (1-4 routines)
Vertical stack of RoutineRow buttons, gap-[6px] (same as BetRow stack).

### Routine never run
Last-run slot shows gray dot + "Never run" text. Next-run slot shows next scheduled time.

### Routine in error state
StatusChip shows `error`. Last-run dot is red. Row background stays neutral (AQ-004: status through content, not structure).

## Behavior

- **Click row:** Toggles inline expansion below the row. Only one routine expanded at a time (accordion).
- **Hover:** `bg-[var(--surface-elevated)]` (same as BetRow hover).
- **Focus:** `focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]` (same as BetRow).
- **Keyboard:** Enter/Space toggles expansion. Tab moves between rows. Arrow keys within expanded detail move focus to KeyValues/links.
- **Transitions:** Expansion uses `motion-default` (240ms) height animation on the detail panel.

## Mobile adaptation

On mobile (three-tab layout), the Work tab shows the same stacked sections. Routine rows are full-width. Detail expansion works the same. No horizontal scrolling needed -- all metadata wraps or truncates on narrow viewports. Schedule badge may wrap to second line if needed.

## Signature

The routine section is a visual twin of the active bets section -- same heading, same row shape, same interaction. The only tell that these are routines (not bets) is the metadata in slots 3-5: schedule + last-run + cost instead of progress + appetite.

## Trade-offs

- **Pro:** Zero new components. Zero visual learning curve. The pattern is already established.
- **Pro:** Inline expansion avoids full-page navigation for simple detail.
- **Con:** Routine rows look very similar to bet rows -- a quick scan might confuse the two sections if the heading is not prominent enough.
- **Con:** The inline expansion for run history could feel cramped for routines with many runs.
- **Con:** Five metadata slots in one row may be too dense at narrow widths.
