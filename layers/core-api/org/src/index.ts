/**
 * Barrel for @hyperidle/org (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw
 * `teams`/`orgEdges` pgTable objects — that would let a consumer
 * obtain a table transitively and defeat Table ACL (Mechanism A). Consumers
 * get typed functions; the tables stay private to this Service.
 *
 * @lore AU44 B1: `team_members` dissolved into `teams`. Removed exports:
 * `getTeamMembers`, `listTeamMembers`, `ActiveTeamMembersWithTeamName`,
 * `OrgAgentRunConfigWriter` (folded into `OrgUserDirectory`),
 * `resolveTeamAgentHarness` (inlined into `persistScaffoldedAgents`),
 * `team-default-harness.ts` (deleted). `AgentScaffoldSpec` declared here;
 * `framework/factory-defaults` retains a parallel declaration (not removed —
 * factory-defaults cannot import from a service-layer package).
 * `CreateTeamInput` simplified (no teamMembersId/capacity/activeBets/formedAt).
 *
 * @lore AU19 Increment 1c: original cut-over — files moved here from
 * `packages/server/src/services/` unchanged (behavior-preserving move).
 *
 * @lore AU20 Am7: collapsed 36 → 20 exports, then AU44 B1 further to ~12.
 * @lore AU21 Increment 14a: `applyTeamCost` deleted.
 * @lore AU20 R-org: `ApiError` removed (internal to team-lookup.ts).
 */

// -- org edges (P2 — org chart edge CRUD, survivor from batch 0) --
export type { UpsertOrgEdgeInput } from "./org-edges.js";
export { deleteOrgEdge, listOrgEdges, upsertOrgEdge } from "./org-edges.js";

// -- org routing (P2 — review recipient resolution) --
export { resolveReviewRecipients } from "./org-routing.js";

// -- ports (Mechanism C — DI-injected outbound edges) --
export type { OrgUserDirectory } from "./ports.js";

// -- scaffold agents (AK6 — single writer of agent user rows) --
export type { AgentScaffoldSpec, ScaffoldResult } from "./scaffold-agents.js";
export { persistScaffoldedAgents } from "./scaffold-agents.js";

// -- team lookup (AU20 Am7 / AU44 B1 — team_members dissolved) --
export type { CreateTeamInput } from "./team-lookup.js";
export {
	createTeam,
	getTeam,
	listTeams,
	updateTeam,
} from "./team-lookup.js";
