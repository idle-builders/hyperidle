# Variant B — Integrated List (Challenge the Existing Pattern)

**Constraint:** Optimize for the single most common power-user task: scanning "is everything running?" The routine section is deliberately visually distinct from bets -- it reads as a compact status table, not a list of clickable cards. Push detail to a secondary surface (side drawer).

**Thesis:** Routines are fundamentally different from bets. Bets are decisions (shape, commit, track, ship). Routines are infrastructure (configure once, monitor health). Conflating them visually wastes the team lead's scanning time -- they need to process routines faster than bets, not with the same cognitive weight. A compact status table with inline indicators lets you answer "are all routines healthy?" in under 2 seconds.

## User task

Team lead glances at the routines section, sees 3 green dots and 1 red dot, immediately knows there is one problem routine. Clicks the red one to see what failed. The bets section above demands more attention; the routines section is a health check, not a work list.

## Component composition

### WorkTeam page (new R5 section)

- Section heading: `<h2>` with the standard uppercase/tertiary/xs style: "ROUTINES"
- Compact table layout (not individual card-like rows):
  - No card shadows, no card backgrounds per row
  - Flat list with `border-b border-[var(--border-subtle)]` separators between rows (like ThreadRow hairline dividers -- AQ-010)
  - Each row: 36px height (consistent vertical rhythm per PRINCIPLES D2)

- Row layout (horizontal, single line):
  - **Col 1 (fixed 6px):** Status dot (6px circle) -- green (`--status-success`) for active+last-run-ok, red (`--status-error`) for error state, blue (`--status-info`) for paused, gray (`--text-tertiary`) for never-run
  - **Col 2 (flex-1, min-w-0):** Name (text-[13px], font-medium, text-primary, truncate)
  - **Col 3 (shrink-0):** Agent initials in a 24px avatar circle (existing Avatar pattern -- green-tinted bg for agents per AQ-012)
  - **Col 4 (shrink-0, w-[80px]):** Schedule (text-[11px], font-mono, text-tertiary, truncate) -- "Mon 10am", "15m", "on event"
  - **Col 5 (shrink-0, w-[60px]):** Last run (text-[11px], font-mono, text-tertiary, right-aligned, tabular-nums) -- "2h ago", "never"
  - **Col 6 (shrink-0, w-[60px]):** Cost (text-[11px], font-mono, text-tertiary, right-aligned, tabular-nums) -- "$4.20"

- The entire section sits inside a `bg-[var(--surface-container)]` `rounded-[var(--r-subtle)]` `p-[12px]` container (flat card style per Hearth Principle 4: mixed hierarchy -- some elements use border+container bg, not shadow).

- Empty state: EmptyState inside the container. "No routines" / "This team has no recurring work."

### Routine detail (side drawer)

On click, a drawer slides in from the right edge of the main pane (not a modal -- no scrim):
- Width: 360px (same as expanded Rail width from the component budget)
- `bg-[var(--surface-elevated)]`, `shadow-[var(--shadow-elevated)]`, `rounded-l-[var(--r-default)]`
- Close button (X) top-right

Drawer content:
- Routine name as heading (text-[17px], font-semibold)
- StatusChip for current state
- KeyValue grid (2 columns):
  - Agent | Schedule (full description)
  - Trigger type | Autonomy level
  - Next run | Last run
  - Cumulative cost | Created at
- Divider (`border-[var(--border-subtle)]`)
- "Run History" heading (uppercase xs)
- Compact run list (last 10):
  - Each run: timestamp (mono xs) | duration (mono xs) | outcome dot (6px, green/red) | cost (mono xs)
  - Flat rows, `border-b border-[var(--border-subtle)]` separators
- "Pause" / "Resume" / "Trigger Now" action buttons at bottom (pill buttons per AQ-005)

### Work portfolio (routine count in header)

The portfolio page already has a header with "All bets" heading + status filter pills + team pills + "New bet" button.

Add a small summary line below the heading:
- `<span>` with text-[13px], text-secondary: "12 bets across 3 teams -- 8 routines active"
- The routine count is a single aggregate number. Per-team counts appear in team pills: each pill shows "Growth (2)" where 2 is routine count, distinguished from bet count by using a small icon or by being appended after a middot.

Simplest: team pill labels become "{teamName} {betCount}b {routineCount}r" -- terse, scannable, no new UI element.

## Information hierarchy

1. **Primary:** Status dot (the 2-second health scan)
2. **Secondary:** Routine name (identify which routine)
3. **Tertiary:** Agent, schedule, last run, cost (detail metadata)

This inverts Variant A's hierarchy -- status comes before name. The thesis is that for routines, "is it healthy?" matters more than "which one is it?" because you only investigate unhealthy ones.

## States

### Empty (no routines)
EmptyState component: "No routines" / "This team has no recurring work." Inside the container card.

### Loading
Two skeleton rows (36px height each) inside the container card.

### Error (fetch error)
ErrorState: "Failed to load routines" / error.message.

### Populated (1-4 routines)
Flat table rows inside the container. No card per row.

### All healthy
All dots green. The section reads as "everything fine" in 1 second.

### One or more errors
Red dots immediately draw the eye. The team lead clicks the red row to investigate.

### Routine never run
Gray dot. Last-run column shows "never" in text-tertiary.

## Behavior

- **Click row:** Opens side drawer with full routine detail. Does NOT expand inline.
- **Hover:** Background tint `rgba(44, 36, 26, 0.02)` on the row (flat list hover per AQ-010).
- **Focus:** `focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]`.
- **Keyboard:** Enter/Space opens drawer. Escape closes drawer. Tab moves between rows. Focus traps inside drawer when open.
- **Drawer transition:** Slide-in from right, `motion-default` (240ms), `transform: translateX`.

## Mobile adaptation

On mobile, the compact table becomes a stacked list (each row wraps to two lines: name + status on line 1, schedule + last-run + cost on line 2). Clicking opens a full-screen detail panel (pushes onto the navigation stack) instead of a side drawer.

## Signature

The routine section looks like a health-check dashboard, not a work list. Status dots dominate. The flat table inside a container card is visually distinct from the elevated card-per-item pattern used for bets. You know immediately "this is infrastructure status" vs "this is work items."

## Trade-offs

- **Pro:** Fastest scanning for "is everything healthy?" -- the 2-second health check.
- **Pro:** Visually distinct from bets, reducing confusion about what kind of work you are looking at.
- **Pro:** Side drawer provides ample space for run history without cramping the main layout.
- **Con:** The side drawer is a new interaction pattern not currently used in WorkTeam (bets navigate to a full page). Adds interaction complexity.
- **Con:** The flat table style diverges from the elevated-card aesthetic that dominates WorkTeam. Could feel like a foreign element.
- **Con:** Fixed column widths may not adapt gracefully to all content lengths (long schedule descriptions, high cost figures).
