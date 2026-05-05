/**
 * L13 — Product-team service: application-layer enforcement of the 1:1
 * Product = Team invariant.
 *
 * @lore L13: The schema allows multiple teams per product (no UNIQUE index on
 * teams.product_id). The application contract is: exactly one active Team per
 * Product. loadProductTeam throws 500 (not 404) when the invariant is broken
 * because a missing team is a programming bug, not a user error. The follow-up
 * task adds UNIQUE(teams.product_id) to lift this to schema enforcement.
 * Reference: plans/work-packages/follow-ups.md L13 entry.
 */

import type { HyperIdleDb, Team } from "@hyperidle/db";
import { teams } from "@hyperidle/db";
import { eq } from "drizzle-orm";

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: string,
		message: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

/**
 * Load the single team for a product, enforcing the 1:1 invariant.
 *
 * @throws ApiError(500, 'team_missing') if no team exists for the product.
 * @throws ApiError(500, 'invariant_broken') if more than one team exists.
 */
export function loadProductTeam(db: HyperIdleDb, productId: string): Team {
	const rows = db.select().from(teams).where(eq(teams.productId, productId)).all();
	if (rows.length === 0) {
		throw new ApiError(500, "team_missing", `Product ${productId} has no team`);
	}
	if (rows.length > 1) {
		throw new ApiError(
			500,
			"invariant_broken",
			`Product ${productId} has ${rows.length} teams — invariant broken`,
		);
	}
	return rows[0];
}
