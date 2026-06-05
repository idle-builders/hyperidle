# AA1 Approved Design — Routine Visibility & Team Scoping

## Direction

Variant B (Integrated Status Table) with full-page detail navigation instead of side drawer. Routines are visually distinct from bets: flat rows in a container card (infrastructure status) vs elevated card-per-item (decision items). Clicking a routine navigates to `/work/routine/:id`, consistent with how bets navigate to `/work/bet/:id`.

---

## Surface 1: WorkTeam page — Routines section (R5)

### Position in page layout

R1 (team header) > R4 (burn vs cap) > R2 (active bets) > **R5 (routines)** > R3 (roster) > artifacts

Routines sit after bets and before roster. The team lead reads: "here are the one-time bets, here are the recurring routines, and here is who is on the team."

### Container

- `bg-[var(--surface-container)]` background (Linen -- flat card style, not elevated)
- `rounded-[var(--r-subtle)]` (10px)
- `p-[12px]` padding
- Section heading above container: `<h2>` with `text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)]` + `mb-2` (same as "Active Bets" and "Roster" headings)

### Row shape

Each routine is a `<button>` element inside the container:

```
[6px dot] [routine name ........... flex-1] [24px agent avatar] [schedule 80px] [last run 60px] [cost 54px]
```

- Height: 36px (6*6, on grid)
- Horizontal gap: 9px between elements
- Row separator: `border-b border-[var(--border-subtle)]` (1px hairline). Last row has no border.
- Background: transparent (inherits container)
- Hover: `rgba(44, 36, 26, 0.02)` background tint (flat-list hover per AQ-010)
- Focus: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]`
- Click: `navigate('/work/routine/${routineId}')`
- Transition: `background-color var(--motion-fast) var(--motion-ease)`

### Row content slots

| Slot | Width | Font | Color | Content |
|------|-------|------|-------|---------|
| Status dot | 6px fixed | -- | `--status-success` (active), `--status-error` (error), `--status-info` (paused) | 6px circle, `rounded-full` |
| Name | flex-1, min-w-0 | 13px, weight 500 | `--text-primary` | Routine name, `truncate` |
| Agent avatar | 24px fixed | 9px, weight 600 | `--accent-primary` text, `accent-primary-dim` bg | 2-letter initials, `rounded-full`, green-tinted (AQ-012 agent distinction) |
| Schedule | 80px shrink-0 | 11px mono | `--text-tertiary` | Human-readable: "Mon 10am", "Every 15m", "On event". `truncate` |
| Last run | 60px shrink-0 | 11px mono | `--text-tertiary` | Relative time: "12m ago", "3d ago", "Never". `text-right`, `tabular-nums` |
| Cost | 54px shrink-0 | 11px mono | `--text-tertiary` | Formatted money: "$4.20", "$18.50". `text-right`, `tabular-nums` |

### States

**Empty (no routines):**
EmptyState component inside the container card:
- title: "No routines"
- description: "This team has no recurring work configured."
- dataTestId: "team-routines-empty"
- Left-aligned per AQ-008

**Loading:**
Inside the container card: 2 skeleton rows (36px height each), `animate-[skeleton-pulse_2s_ease-in-out_infinite]`, `rounded-[var(--r-subtle)]`, `bg-[var(--surface-elevated)]`.

**Error (fetch failure):**
ErrorState component: "Failed to load routines" / error.message.

**Populated (1+ routines):**
Flat rows as described above.

**Routine never run:**
Last-run slot shows "Never" in `--text-tertiary`. Status dot uses `--text-tertiary` (gray) if the routine is active but has never run, `--status-info` if paused.

---

## Surface 2: Routine detail page (`/work/routine/:id`)

### Route

`/work/routine/:routineId` -- new route in the Work view.

### Layout

Same stacked layout as WorkTeam (single column, vertical sections):

**Breadcrumb:**
```
<- Portfolio / {team.name} / {routine.name}
```
`btn btn-ghost btn-xs` style, same as WorkTeam's breadcrumb.

**Header section:**
- Routine name: `text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-primary)]` (same style as team name in WorkTeam)
- StatusChip beside the name (healthy/paused/error)
- Sub-line: `text-xs text-[var(--text-tertiary)]` with agent name and trigger type

**Configuration section:**
`bg-[var(--surface-container)]` `rounded-[var(--r-subtle)]` `p-[18px]` container.
KV grid (2 columns, `gap-[9px_18px]`):

| Label | Value |
|-------|-------|
| Agent | Agent name |
| Schedule | Full human-readable description ("Every Monday at 10:00 AM", "Every 15 minutes", "When bet_state_changed fires") |
| Trigger type | Calendar / Heartbeat / Event |
| Autonomy level | "L1 -- Every run reviewed" / "L2 -- Human reviews" / "L3 -- Autonomous, human on error" / "L4 -- Fully autonomous" |
| Next run | Absolute datetime or "On next event" |
| Cumulative cost | Formatted money with `tabular-nums` |
| Last run | Relative time + outcome ("2h ago -- success" or "1h ago -- failed: timeout after 120s") |
| Created | Date |

**Run history section:**
Section heading: "RECENT RUNS" (uppercase xs, tertiary)

Table with columns:
| Column | Width | Font | Alignment |
|--------|-------|------|-----------|
| Time | flex-1 | 11px mono | left |
| Duration | 60px | 11px mono | right, tabular-nums |
| Outcome | 60px | -- | center (6px status dot) |
| Cost | 60px | 11px mono | right, tabular-nums |

Row separator: `border-b border-[var(--border-subtle)]`.
Max 20 rows shown. If no runs: "No runs recorded yet." in text-secondary.

**Action buttons:**
Horizontal row at bottom of configuration section:
- "Pause" / "Resume" (ghost pill button -- `btn btn-ghost btn-sm`)
- "Trigger Now" (primary pill button -- `btn btn-primary btn-sm`)

### States

**Loading:** SkeletonCard for each section (header, configuration, run history).

**Not found (404):** EmptyState: "Routine not found" / "The routine you are looking for does not exist or has been removed."

**Error:** ErrorState: "Failed to load routine" / error.message.

**Populated:** All sections rendered with data.

---

## Surface 3: WorkPortfolio -- Routine count

### Data change

TeamListItem gains `routineCount: number` (count of routines belonging to this team, all states).

### Visual change

Below the "All bets" heading, add a summary line:
```
<p class="text-[13px] text-[var(--text-secondary)]">
  {totalBets} bets across {teamCount} teams -- {totalActiveRoutines} routines active
</p>
```

This appears only when `totalActiveRoutines > 0`. The summary gives the team lead a global pulse of recurring work alongside the bet portfolio.

No change to BetCard. No change to team pill labels. Routines do not appear as cards in the portfolio grid -- they are visible at the team level (WorkTeam), not the portfolio level.

### States

**No routines across any team:** Summary line omits the routine clause: "{totalBets} bets across {teamCount} teams".

**All routines healthy:** Summary shows the count. No special treatment.

**Any routine in error:** The summary line could optionally tint the routine count in `--status-error`, but this is a follow-up consideration, not in AA1 scope.

---

## Routine state mapping to StatusChip

| Routine state | StatusChip status | Dot color | Label |
|---------------|-------------------|-----------|-------|
| `active` | `healthy` | `--status-success` (green) | HEALTHY |
| `paused` | `paused` | `--status-info` (blue) | PAUSED |
| `error` | `error` | `--status-error` (red) | ERROR |

The routine `state` column in the DB stores `active` / `paused` / `error`. The mapping function `routineStateToStatus()` lives in `packages/design-system/src/status-mapping.ts` alongside the existing `betStatusToStatus()`, `taskStateToStatus()`, etc.

---

## Component budget impact

**Zero new custom components.** The design composes from:
- StatusChip (Tier 1) -- routine status display
- KeyValue (Tier 1) -- configuration detail
- EmptyState (Tier 2) -- empty routines
- ErrorState (Tier 2) -- error state
- SkeletonCard (existing utility) -- loading states

The routine row in WorkTeam is an inline component (like BetRow) -- it does not enter the design-system component budget. The routine detail page is a page component in `packages/web/src/pages/`.

---

## Rejected directions (do not re-litigate)

1. **BetRow-identical routine rows.** Makes routines and bets visually indistinguishable. Rejected because scanning speed for "is everything healthy?" requires visual differentiation.

2. **Side drawer for routine detail.** Adds interaction complexity (focus trap, drawer state, escape handler, mobile push) with no benefit over a full page. Bets use pages; routines should too.

3. **Inline accordion expansion.** Run history can overflow the page scroll area. Full page is the correct surface.

4. **Routine cards in portfolio grid.** Routines are background work, not portfolio-level decision objects. They appear at the team level, not the portfolio level.

5. **Routine count in team pill labels.** "Growth (3b, 2r)" or "Growth 3/2" is cryptic. A summary line below the heading is clearer.

6. **New RoutineCard custom component.** The flat table row is inline code in WorkTeam. No need to add to the 19-component budget.

---

## Open questions for the architect

1. **Schema:** What columns does the routines table need? At minimum: `name` (text NOT NULL), `description` (text), `team_id` (text NOT NULL FK -> teams), `state` (text NOT NULL, enum: active/paused/error replacing boolean `active`).

2. **Run history source:** AA1 spec says "clicking a routine shows its run history." Where does run history come from? Current sessions table has no routine_id FK (AA2 adds that). Options: (a) add a `routine_runs` table now, (b) query sessions by ownerAgentId + time range (lossy), (c) add a lightweight `routine_run_log` table with just timestamp/duration/outcome/cost per run.

3. **API shape:** The routine detail endpoint needs to return the routine + run history + team context. Shape: `GET /api/routines/:id` returns `RoutineDetail` (routine config + runs array + team summary).

4. **Backfill:** Existing routines have no name. The migration needs to derive names from the routine id (e.g. "builtin:cost-sentinel" -> "Cost sentinel", "seed-routine-daily_digest" -> "Daily digest").

5. **Cost tracking:** Where does cumulative cost come from? Sessions don't have cost columns currently. This may need a `costActualMinor` column on routines (aggregated from run log) or computed from sessions when AA2 links sessions to routines.

6. **Team-scoped API:** `GET /api/teams/:id` (TeamDetail) needs to include routines in the response, or a separate `GET /api/teams/:id/routines` endpoint. The WorkTeam page currently calls `useTeam(teamId)` -- extending TeamDetail is simpler.
