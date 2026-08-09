/**
 * Barrel for @hyperidle/org (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw
 * `teams`/`teamMembers`/`orgEdges` pgTable objects — that would let a consumer
 * obtain a table transitively and defeat Table ACL (Mechanism A). Consumers
 * get typed functions; the tables stay private to this Service.
 *
 * @lore AU19 Increment 1c: original cut-over — `org-edges.ts`/`org-routing.ts`/
 * `team-lookup.ts`/`team-default-harness.ts`/`scaffold-agents.ts` moved here
 * from `packages/server/src/services/` unchanged (behavior-preserving move).
 *
 * @lore AU20 Am7: collapsed 36 → 20 exports. Per-call-site accessors replaced
 * by parameterized interfaces (getTeam/listTeams, getTeamMembers/listTeamMembers,
 * updateTeam, createTeam+deleteTeam atomic 1:1 ops, listOrgEdges
 * with filter). `resolveTeamAgentHarness` folded into `persistScaffoldedAgents`.
 * @lore AU21 Increment 14a: `applyTeamCost` deleted along with the rest of
 * the cost feature — no replacement.
 * `PrimaryHarnessConfig` re-export dropped (callers import from @hyperidle/domain-model).
 * `CreateTeamMembersGroupInput` dropped (merged into `CreateTeamInput`).
 * `deleteOrgEdgeById` renamed to `deleteOrgEdge`. `getOrgEdgeById` folded into
 * `listOrgEdges(filter)`.
 *
 * @lore AU20 R-org: `ApiError` removed from this barrel (was exported but no
 * consumer outside @hyperidle/org imported it — confirmed by census audit).
 * The class is now private to team-lookup.ts where it is defined and used.
 */

// -- org edges (AH4) --
export type { UpsertOrgEdgeInput } from "./org-edges.js";
export { deleteOrgEdge, listOrgEdges, upsertOrgEdge } from "./org-edges.js";

// -- org routing (P2 — review recipient resolution) --
export type { ReviewRoutingContext } from "./org-routing.js";
export { resolveReviewRecipients } from "./org-routing.js";

// -- ports (Mechanism C — DI-injected outbound edges) --
export type { OrgAgentRunConfigWriter, OrgUserDirectory } from "./ports.js";

// -- scaffold agents (AK6 — single writer of agent user rows) --
export type { AgentScaffoldSpec, ScaffoldResult } from "./scaffold-agents.js";
export { persistScaffoldedAgents } from "./scaffold-agents.js";

// -- team lookup (L13 — 1:1 Team=TeamMembers invariant, AU20 Am7 collapse) --
export type { ActiveTeamMembersWithTeamName, CreateTeamInput } from "./team-lookup.js";
export {
	createTeam,
	deleteTeam,
	getTeam,
	getTeamMembers,
	listTeamMembers,
	listTeams,
	updateTeam,
} from "./team-lookup.js";
