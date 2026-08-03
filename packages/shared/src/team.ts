/**
 * L13 — Read-side types for the Team page composite endpoint.
 *
 * These are wire types returned by GET /api/products and GET /api/products/:id.
 * The TeamDetail shape drives the WorkTeam page composition.
 *
 * @lore L13: Product = Team 1:1 invariant. The public identifier is always the
 * team id (formerly product id); the agent-membership group is an internal join key.
 * See plans/L13/concept.md §"What 1:1 actually means".
 *
 * @lore U1: File renamed from product.ts to team.ts. All Product* types renamed
 * to Team*. BetCardSummary.pitchTitle renamed to BetCardSummary.descriptionTitle.
 * deriveTitleFromPitch renamed to deriveTitle in format/bet.ts.
 */

import type { RoutineCardSummary } from "./routine.js";
import type { BetStatus } from "./types.js";

/**
 * Status of a product team — derived server-side from active bet states
 * and capacity utilisation. Matches the StatusChip "Status" type used in
 * the design system (healthy | behind | blocked).
 *
 * @lore L13: "Status" from @hyperidle/design-system cannot be imported in
 * packages/shared (shared must not depend on design-system). We redeclare the
 * relevant subset here to keep the wire contract in shared without a circular
 * dep. Both must stay in sync if the StatusChip type ever widens.
 *
 * @lore AU21 Increment 14a: this status used to also flip to "behind" on
 * cost-cap overrun (`costActualMinor >= costCapMinor`) — the cost-cap
 * feature is HARD-DELETED (founder, no replacement); status now derives
 * from capacity overrun and blocked tasks only.
 */
export type TeamStatus = "healthy" | "behind" | "blocked";

export interface TeamSummary {
	id: string;
	name: string;
	phase: string; // "shape" | "build" | "cool-down" | …
	status: TeamStatus; // derived server-side
	leadAgentId: string | null; // team_members.lead_agent_id; null on a freshly-created team
}

/** AB2: Operational status derived from session state. */
export type AgentOperationalStatus = "active" | "idle" | "error";

/** AB2: Health indicator level for display. */
export type AgentHealthLevel = "healthy" | "warning" | "critical";

export interface RosterMember {
	agentId: string;
	name: string;
	role: string; // agents.role
	isLead: boolean; // matches leadAgentId on the team
	/** AB3: "team" | "strategy" | "individual" | null. Null when category is unset. */
	agentCategory: string | null;
	// AB2: operational fields (optional for backward compat with pre-AB2 fixtures)
	operationalStatus?: AgentOperationalStatus;
	activeTaskTitle?: string | null;
	activeTaskId?: string | null;
	activeBetId?: string | null;
	healthLevel?: AgentHealthLevel;
	healthDetail?: string | null;
}

/**
 * @lore AU21 Increment 14a: `costActual`/`costCap`/`betCostActual`/
 * `routineCostThisMonth` (all WireMoney|null, L17) are HARD-DELETED along
 * with the rest of the cost-cap/accounting feature — no replacement. `burn`
 * now carries only capacity utilisation.
 */
export interface TeamBurn {
	capacity: number; // team_members.capacity (max parallel bets)
	activeBets: number; // team_members.active_bets cached counter
}

export interface BetCardSummary {
	id: string;
	// @lore U1: `descriptionTitle` was formerly `pitchTitle`. Derives a display
	// title from bets.description (formerly bets.pitch).
	descriptionTitle: string;
	status: BetStatus; // "active" in new lifecycle
	progressDone: number; // count(tasks where state='done')
	progressTotal: number; // count(tasks)
}

export interface TeamDetail {
	team: TeamSummary;
	teamMembers: { id: string; formedAt: string; dissolvedAt: string | null };
	roster: RosterMember[]; // sorted: lead first, then by name asc
	burn: TeamBurn;
	activeBets: BetCardSummary[]; // bets WHERE team_id = :id AND status = 'active'
	/** AA1: routines belonging to this team, sorted by name asc. Absent in pre-AA1 fixtures. */
	routines?: RoutineCardSummary[];
}

/**
 * Shape returned by GET /api/products (the list endpoint used by Portfolio).
 * Extends TeamSummary with portfolio-level counters.
 */
export interface TeamListItem extends TeamSummary {
	activeBets: number; // count of active bets
	shipped: number; // count of completed bets
	shipRate: string; // percentage string, e.g. "67%" or "—" when no history
	progress: { done: number; total: number }; // sum across active bets
	/** AA1: total routines belonging to this team (all states). */
	routineCount: number;
	/** AB2: total AI agents in the team. */
	agentCount: number;
	/** AB2: AI agents with an active session right now. */
	activeAgentCount: number;
	/** AB2: true when any agent has degraded health (>50% failures or lastSessionCrashed). */
	agentHealthWarning: boolean;
}

export interface TeamListResponse {
	teams: TeamListItem[];
}

/**
 * POLISH-060 B3: Optional primary harness config for team creation.
 * When provided, all scaffolded agents use this harness/model.
 */
export interface PrimaryHarnessConfig {
	readonly harnessType: string;
	readonly modelId: string;
	readonly modelProvider: string;
}

export interface CreateTeamRequest {
	name: string;
	repoPath?: string;
	/** AE2: team functions for defaultRoster(). Defaults to ["development","product"] if omitted. */
	functions?: string[];
	/** AE2: optional free-text context about what is being built. */
	buildingContext?: string;
	/** AE2: human user id — seeds welcome message in thr-ast-{userId} when provided. */
	userId?: string;
	/**
	 * POLISH-060 B3: When set, all scaffolded agents use this harness/model instead of
	 * the builtin/sonnet-4-6 default. Supplied by the onboarding flow after the user
	 * selects a primary harness. Omitting preserves the existing fallback behavior.
	 */
	primaryHarness?: PrimaryHarnessConfig;
}

export interface CreateTeamResponse {
	team: { id: string; name: string; phase: string };
	teamMembers: { id: string };
}
