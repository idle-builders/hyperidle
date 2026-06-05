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
import type { WireMoney } from "./types/money.js";
import type { BetStatus } from "./types.js";

/**
 * Status of a product team — derived server-side from active bet states
 * and cost cap utilisation. Matches the StatusChip "Status" type used in
 * the design system (healthy | behind | blocked).
 *
 * @lore L13: "Status" from @hyperidle/design-system cannot be imported in
 * packages/shared (shared must not depend on design-system). We redeclare the
 * relevant subset here to keep the wire contract in shared without a circular
 * dep. Both must stay in sync if the StatusChip type ever widens.
 */
export type TeamStatus = "healthy" | "behind" | "blocked";

export interface TeamSummary {
	id: string;
	name: string;
	phase: string; // "shape" | "build" | "cool-down" | …
	status: TeamStatus; // derived server-side
	leadAgentId: string | null; // team_members.lead_agent_id; null on a freshly-created team
}

export interface RosterMember {
	agentId: string;
	name: string;
	role: string; // agents.role
	isLead: boolean; // matches leadAgentId on the team
}

export interface TeamBurn {
	// L17: changed from number to WireMoney|null to support structured money.
	costActual: WireMoney | null;
	costCap: WireMoney | null;
	capacity: number; // team_members.capacity (max parallel bets)
	activeBets: number; // team_members.active_bets cached counter
}

export interface BetCardSummary {
	id: string;
	// @lore U1: `descriptionTitle` was formerly `pitchTitle`. Derives a display
	// title from bets.description (formerly bets.pitch).
	descriptionTitle: string;
	// L17: replaced appetite: string with structured WireMoney.
	costAppetite: WireMoney | null;
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
}

export interface TeamListResponse {
	teams: TeamListItem[];
}

export interface CreateTeamRequest {
	name: string;
	repoPath?: string;
}

export interface CreateTeamResponse {
	team: { id: string; name: string; phase: string };
	teamMembers: { id: string };
}
