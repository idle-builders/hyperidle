/**
 * L13 — Read-side types for the Product page composite endpoint.
 *
 * These are wire types returned by GET /api/products and GET /api/products/:id.
 * The ProductDetail shape drives the WorkProduct page composition.
 *
 * @lore L13: Product = Team 1:1 invariant. The public identifier is always the
 * product id; team_id is an internal join key not surfaced in URLs or copy.
 * See plans/L13/concept.md §"What 1:1 actually means".
 */

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
export type ProductStatus = "healthy" | "behind" | "blocked";

export interface ProductSummary {
	id: string;
	name: string;
	phase: string; // "shape" | "build" | "cool-down" | …
	status: ProductStatus; // derived server-side
	leadAgentId: string | null; // teams.lead_agent_id; null on a freshly-created team
}

export interface RosterMember {
	agentId: string;
	name: string;
	role: string; // agents.role
	isLead: boolean; // matches leadAgentId on the team
}

export interface ProductBurn {
	costActual: number; // teams.cost_actual; cents (matches existing convention)
	costCap: number | null; // teams.cost_cap; null when not configured
	capacity: number; // teams.capacity (max parallel bets)
	activeBets: number; // teams.active_bets cached counter
}

export interface BetCardSummary {
	id: string;
	pitchTitle: string; // first non-empty line of bets.pitch
	appetite: string; // "1 week" | "2 weeks" | "6 weeks"
	status: BetStatus; // "committed" | "in_progress"
	progressDone: number; // count(tasks where state='done')
	progressTotal: number; // count(tasks)
}

export interface ProductDetail {
	product: ProductSummary;
	team: { id: string; formedAt: string; dissolvedAt: string | null };
	roster: RosterMember[]; // sorted: lead first, then by name asc
	burn: ProductBurn;
	activeBets: BetCardSummary[]; // bets WHERE product_id = :id AND status IN ('committed','in_progress')
}

/**
 * Shape returned by GET /api/products (the list endpoint used by Portfolio).
 * Extends ProductSummary with portfolio-level counters.
 */
export interface ProductListItem extends ProductSummary {
	activeBets: number; // count of committed+in_progress bets
	shipped: number; // count of shipped bets
	shipRate: string; // percentage string, e.g. "67%" or "—" when no history
	progress: { done: number; total: number }; // sum across active bets
}

export interface ProductListResponse {
	products: ProductListItem[];
}
