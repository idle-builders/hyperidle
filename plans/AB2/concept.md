# AB2 Concept — Agent Overview in Team Work Page

## Classification: No New Primitives

AB2 introduces no new concepts. Every noun in the spec maps to a stable, already-defined concept. This is a **composition workpackage** -- it surfaces existing data in existing UI structures.

## Nouns and Classification

| Noun | Classification | Source of truth | Notes |
|---|---|---|---|
| Agent | Stable | `docs/agent-layer/agent-structure.md`, `agent-identity.md` | AB2 does not reshape what an agent is |
| Operational status (active/idle/error) | Stable | AB1 `agent-profile.ts` lore (lines 11-17), frontend derivation | active = running session, error = crashed/high failure, idle = otherwise |
| Health signals | Stable | AB1 `AgentHealthSignals` type, `computeHealthSignals` | failureRate7d, lastSessionCrashed, harnessAvailable, idleDurationMs, degraded |
| Portfolio agent summary | Stable extension | `TeamListItem` in `packages/shared/src/team.ts` | Add agentCount, activeAgentCount, agentHealthWarning to existing shape |
| Error notification | Stable | H2 `enqueueNotification` in `packages/fabric/src/services/notifications/dispatcher.ts` | New event type, existing infrastructure |

## Key Design Decisions (already locked)

1. **Operational status is derived, not stored.** Per AB1 lore (A2): the `status` field on users is config status (active/paused/retired). Operational status is computed at query time from session state. AB2 reuses this derivation.

2. **Health signals are computed on-demand.** Per AB1 architecture: health is a live view, not cached. AB2 must use the same `computeHealthSignals` function (or its logic) for consistency with the profile page.

3. **Three-value health indicator maps to existing StatusChip.** The spec says "green/yellow/red." StatusChip already has: healthy (green), behind (yellow/warning), error (red). AB2 maps: not degraded -> healthy, degraded with non-critical signals -> behind, degraded with critical signals (high failure rate or last session crashed) -> error.

4. **Roster section (R3) becomes the Agents section.** The spec says "Agents section alongside Bets and Routines." Having two agent sections (identity roster + operational agents) would confuse. The natural approach: enhance R3 with status/health data and rename it.

5. **Alert throttling via state-transition tracking.** The spec says "one alert per agent per state transition." This requires tracking the last-known health state to detect transitions. This is a server-side concern, not a concept question.

## What AB2 is NOT

1. **Not a new agent primitive.** It surfaces existing agent data in a new UI location. The agent concept is unchanged.
2. **Not real-time monitoring.** No WebSocket updates. Status is fetched on page load, like all other team data.
3. **Not historical trending.** Shows current state only. No sparklines, no charts, no "last 7 days" visual history.
4. **Not agent management.** No start/stop/restart. No scheduling. No workload balancing. The team page is read-only for agent status.
5. **Not a new notification channel.** Uses existing H2 adapter. The notification is just a new event type fed through the existing pipeline.

## Required Reading for Downstream Skills

Downstream agents (`/design`, `/architecture`) must read:

- `packages/shared/src/agent-profile.ts` -- AgentHealthSignals, AgentActiveSession types
- `packages/server/src/routes/agent-profile.ts` -- computeHealthSignals function (reuse for team page)
- `packages/shared/src/team.ts` -- TeamDetail, RosterMember, TeamListItem (extend)
- `packages/web/src/pages/WorkTeam.tsx` -- current R3 Roster section and AgentCard
- `packages/web/src/pages/WorkPortfolio.tsx` -- current portfolio summary line pattern
- `packages/server/src/routes/teams-routes.ts` -- GET /teams and GET /teams/:id endpoints
- `packages/fabric/src/services/notifications/dispatcher.ts` -- enqueueNotification interface
- `packages/design-system/src/StatusChip.tsx` -- Status type (healthy | behind | blocked | paused | done | error)

## Contracts (reaffirmed, not new)

- **Agent operational status derivation** stays frontend-derived per AB1 lore. The server provides the raw signals (activeSession, healthSignals); the frontend maps to active/idle/error.
- **Health computation** uses the same thresholds as AB1: degraded = failureRate7d > 0.5 OR lastSessionCrashed OR !harnessAvailable.
- **StatusChip vocabulary** is closed. AB2 uses existing values (healthy, behind, error). No new status values introduced.
- **TeamListItem** is an open extension point -- adding fields does not require concept-doc update.
- **Notification event types** are open -- adding `agent.health.degraded` does not require concept-doc update.
