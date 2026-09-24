/**
 * L13 — the two agent-run display types every roster/thread row still needs.
 *
 * @lore BC5 T11: everything else this file carried (`TeamSummary`,
 * `TeamDetail`, `TeamListItem`, `TeamListResponse`, `TaskCardSummary`,
 * `TeamBurn`, `TeamStatus`, `RosterMember`, `PrimaryHarnessConfig`,
 * `CreateTeamRequest`, `CreateTeamResponse`) was the wire shape of the
 * deleted `teams`/`agents`/`org` route family (`GET /api/teams`,
 * `GET /api/teams/:id`, `POST /api/teams`, the roster `agents.ts` used to
 * stamp). A team is id + name now (migration 0090 drops every other
 * column); the UI rebuilds a team page and a portfolio row client-side from
 * `search_users`/`search_tasks` (`hooks/useTeam.ts`, `hooks/useTeams.ts`) —
 * neither imports this file any more. `AgentOperationalStatus`/
 * `AgentHealthLevel` stay: they describe a running agent, not a team row,
 * and `useAgentRunState.ts`/`ds/ThreadHostBanner.tsx`/`ds/ThreadRow.tsx`/
 * `ds/status-mapping.ts` still derive them from live run state.
 */

/** AB2: Operational status derived from session state. */
export type AgentOperationalStatus = "active" | "idle" | "error";

/** AB2: Health indicator level for display. */
export type AgentHealthLevel = "healthy" | "warning" | "critical";
