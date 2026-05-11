/**
 * M2: Rail contract.
 *
 * GET /api/rail — ambient awareness dashboard data.
 *
 * Replaces MOCK_RAIL_BETS, MOCK_RAIL_BLOCKERS, MOCK_RAIL_COST in
 * app-shell-data.ts. The server endpoint already exists at
 * packages/server/src/routes/rail.ts — these types pin the wire shape
 * so the client can be wired without ambiguity.
 *
 * @lore M2: The server's RailBet/RailBlocker shapes differ from the
 * client's BetItem/BlockerItem types. The server is the authority.
 * Client types must be updated to match these contract types.
 */

import type { WireMoney } from "@hyperidle/shared";

/** A bet summary in the rail. */
export interface RailBet {
	readonly id: string;
	readonly title: string;
	readonly status: string;
	readonly progress: {
		readonly done: number;
		readonly total: number;
	};
}

/** A blocked-task entry in the rail. */
export interface RailBlocker {
	readonly taskId: string;
	readonly title: string;
	readonly owner: string | null;
	readonly durationBlockedMs: number;
}

/** Cost burn-rate snapshot. Caps are null when not configured. */
export interface RailCostBurnRate {
	readonly todaySpend: WireMoney | null;
	readonly todayCap: WireMoney | null;
	readonly weekSpend: WireMoney | null;
	readonly weekCap: WireMoney | null;
	/** Total tokens consumed in the current rolling 7-day window. */
	readonly weekTokens: number | null;
}

/** Response shape for GET /api/rail. */
export interface RailResponse {
	readonly bets: readonly RailBet[];
	readonly blockers: readonly RailBlocker[];
	readonly awaitingOrdering: readonly Array<{
		readonly id: string;
		readonly title: string;
		readonly createdAt: string;
	}>;
	readonly costBurnRate: RailCostBurnRate;
}
