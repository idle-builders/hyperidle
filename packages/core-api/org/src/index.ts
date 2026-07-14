/**
 * Barrel for @hyperidle/org (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw
 * `teamMembers`/`orgEdges` pgTable objects — that would let a consumer obtain
 * a table transitively and defeat Table ACL (Mechanism A). Consumers get
 * typed functions; the tables stay private to this Service.
 *
 * @lore AU19 Increment 1c: this is the real cut-over — `org-edges.ts`/
 * `org-routing.ts`/`team-lookup.ts`/`team-default-harness.ts`/
 * `scaffold-agents.ts` moved here from `packages/server/src/services/`
 * unchanged (behavior-preserving move). `org`'s one outbound edge (`users`,
 * two call sites — `scaffold-agents.ts` + `org-routing.ts`, neither of which
 * has migrated yet) became an injected DI port (Mechanism C, `ports.ts`) — an
 * ordinary downward core-api→core-api edge, NOT §10.3 against-grain. The
 * concrete implementation still lives in `packages/server`
 * (`user-store.ts`) and is wired at each real call site (`server-factory.ts`,
 * `routes/teams-routes.ts`, `routes/org.ts`, `routes/assistant.ts`,
 * `routes/users.ts`, `tools/add-agent.ts`, `tools/create-team.ts`,
 * `tools/create-item.ts`, `services/session-review-creator.ts`).
 *
 * `teamMembers` (W2 closure): now that `org` is the real table owner, `work`'s
 * two direct `teamMembers` accessors (`bet-state-machine.ts`'s capacity
 * read/write, `bet-decomposition.ts`'s membership-group read) were converted
 * to `work`'s own `TeamCapacityReader` DI port, wired to this package's
 * `getTeamMembersByTeamId`/`setTeamMembersActiveBets` unchanged.
 *
 * @lore AU19 Increment 3g: `cost-cap.ts`'s three direct `teamMembers`
 * accessors (per-team spend read, atomic cost-accumulation write, cost-reset
 * write) were a genuinely NEW ownership violation surfaced only when
 * `cost-cap.ts` became its own Service package (not caught earlier — while
 * flat in `packages/server` there was no guard boundary to violate).
 * Converted to `cost`'s own `CostTeamAccessor` DI port, wired to this
 * package's `getTeamMembersById` (read, pre-existing) plus three new writes
 * added for this closure: `incrementTeamMembersCost`/`resetTeamMembersCost`/
 * `resetAllTeamMembersCost`.
 */

// -- org edges (AH4) --
export type { UpsertOrgEdgeInput } from "./org-edges.js";
export { upsertOrgEdge } from "./org-edges.js";

// -- org routing (P2 — review recipient resolution) --
export type { ReviewRoutingContext } from "./org-routing.js";
export { resolveReviewRecipients } from "./org-routing.js";

// -- ports (Mechanism C — DI-injected outbound edges) --
export type { OrgUserDirectory } from "./ports.js";

// -- scaffold agents (AK6 — single writer of agent user rows) --
export type {
	AgentScaffoldSpec,
	PrimaryHarnessConfig,
	ScaffoldResult,
} from "./scaffold-agents.js";
export { persistScaffoldedAgents } from "./scaffold-agents.js";

// -- team default harness (AV1) --
export { resolveTeamAgentHarness } from "./team-default-harness.js";

// -- team lookup (L13 — 1:1 Team=TeamMembers invariant) --
export {
	ApiError,
	getTeamMembersById,
	getTeamMembersByTeamId,
	incrementTeamMembersCost,
	loadTeamMembers,
	resetAllTeamMembersCost,
	resetTeamMembersCost,
	setTeamMembersActiveBets,
} from "./team-lookup.js";
