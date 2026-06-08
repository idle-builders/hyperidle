# AB2 Design Brief

DESIGN-CLASS: routine-low-conf  ref=AgentCard(WorkTeam.tsx:485-563)  pattern=none

## User task

Team lead opens the team Work page to take stock: who's active, who's idle, who needs attention. They scan the agents section in under 5 seconds and decide whether to intervene.

## Design decisions (settled)

1. R3 Roster becomes "Agents" -- one section, not two.
2. Agent cards link to the agent profile (AB1) on click.
3. Operational status derived: active (running session), error (crashed/high failure), idle (otherwise).
4. Health is a composite signal shown as an indicator. Health != status. An agent can be idle and healthy, or idle and unhealthy.
5. Portfolio page adds per-team agent summary inline with existing team counters.

## Two variants

- **Variant A (Enhanced Card):** Evolve the existing AgentCard. Same card shape, add status/health/task info. Stay close to the existing pattern.
- **Variant B (Dense Row):** Replace cards with flat table rows (like RoutineRow). Maximize scan density. Agent info in one horizontal line.

## Constraints

- 19 custom components -- no new custom components. Compose from Avatar, StatusChip, Tag, KeyValue, Button, EmptyState.
- Hearth grid: 6px increments only.
- Type scale: 9-30px closed set.
- Card radius: --r-subtle (10px) for inner containers.
- Status through content, not structure (AQ-004).
- All states: empty, loading (handled by parent SkeletonCard), populated (normal), error agent state.
