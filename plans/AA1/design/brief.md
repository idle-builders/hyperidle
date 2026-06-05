# AA1 Design Brief — Routine Visibility & Team Scoping

DESIGN-CLASS: routine-low-conf  ref=BetRow(WorkTeam inline)  pattern=none

## Story

As a team lead viewing the Work surface, I want to see all my team's routines alongside bets -- with their schedule, status, last run, and cost -- so that I understand the full picture of what my team is doing, including the recurring work that runs in the background.

## Classification rationale

- **Existing component reference:** YES -- spec says "Routine entries use the same design system components as bet entries." The inline BetRow in WorkTeam.tsx and BetCard in WorkPortfolio.tsx are the reference family.
- **Pattern match in HTML:** NO -- no RoutineRow.html or RoutineCard.html exists. The information shape differs from bets (schedule + agent + last-run-outcome + next-run vs progress + appetite + done/total).
- Mixed signal triggers low-confidence routine: 2 variants instead of 1.

## Key design decisions (settled from spec + codebase)

1. **Routine detail surface:** Inline expansion or side panel, NOT a full page. Routines are simpler than bets (no tasks, no kanban). Run history + config fits in a collapsible detail. Navigation to a full page would be disproportionate overhead for 2-4 routines per team.

2. **Portfolio routine counts:** Integrated into existing team summary, not a parallel grid. Routines are background work -- they inform the portfolio view but don't demand their own card grid. A count annotation suffices.

3. **Scale:** 2-4 routines per team typical (seed data shows 6 total across 2-3 agents). Not a pagination problem. Small dense list.

4. **Routine states map to StatusChip vocabulary:**
   - `active` -> StatusChip `healthy` (green dot + "HEALTHY")
   - `paused` -> StatusChip `paused` (blue dot + "PAUSED")
   - `error` -> StatusChip `error` (red dot + "ERROR")

5. **No new custom component.** Routines compose from existing primitives: StatusChip, KeyValue, Tag. The row shape in WorkTeam is an inline `<button>` (like BetRow). No addition to the 19-component budget.

## Surfaces to design

| Surface | Location | What changes |
|---------|----------|--------------|
| Team Work page | WorkTeam.tsx | New "Routines" section (R5) after active bets (R2), before roster (R3) |
| Routine detail | WorkTeam.tsx or drawer | Run history + configuration on click |
| Work portfolio | WorkPortfolio.tsx | Routine count per team visible somewhere |

## Information per routine row

Required by AC-2:
- Name (text, primary weight)
- Schedule in human-readable form ("Every Monday at 10am", "Every 15 min", "On bet completion")
- Assigned agent (name or initials)
- Last run outcome (success/failure indicator)
- Last run time (relative timestamp)
- Next scheduled run (relative or absolute)
- Cumulative cost (WireMoney formatted)

## Constraints

- Hearth design language (warm earth tones, 6px grid, generous rounding)
- Density over whitespace (8-12px padding default)
- No new custom component (reuse StatusChip, KeyValue, Tag)
- AQ rules: no off-grid spacing, no cool grays, no AI aesthetic
- Desktop primary (IconRail | Submenu | Main | Rail), mobile three tabs
