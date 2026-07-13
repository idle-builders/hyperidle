/**
 * L13 — Team lookup service: application-layer enforcement of the 1:1
 * Team = TeamMembers invariant.
 *
 * @lore L13: The schema allows multiple team_members per team (no UNIQUE index on
 * team_members.team_id). The application contract is: exactly one active TeamMember per
 * Team. loadTeamMembers throws 500 (not 404) when the invariant is broken
 * because a missing team_members row is a programming bug, not a user error.
 *
 * @lore U1: Renamed from product-team.ts. `loadProductTeam` renamed to `loadTeamMembers`.
 * Queries `teamMembers` table (formerly `teams`). Returns `TeamMember` (formerly `Team`).
 */

import type { HyperIdleDb, TeamMember } from "@hyperidle/db";
import { teamMembers } from "@hyperidle/db";
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
 * Load the single team_members row for a team, enforcing the 1:1 invariant.
 *
 * @throws ApiError(500, 'team_members_missing') if no team_members row exists for the team.
 * @throws ApiError(500, 'invariant_broken') if more than one team_members row exists.
 */
export async function loadTeamMembers(db: HyperIdleDb, teamId: string): Promise<TeamMember> {
	const rows = await db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));
	if (rows.length === 0) {
		throw new ApiError(500, "team_members_missing", `Team ${teamId} has no team_members row`);
	}
	if (rows.length > 1) {
		throw new ApiError(
			500,
			"invariant_broken",
			`Team ${teamId} has ${rows.length} team_members rows — invariant broken`,
		);
	}
	const [row] = rows;
	if (!row) {
		// Unreachable: the length checks above guarantee exactly one row. The guard
		// re-narrows from `Row | undefined` for noUncheckedIndexedAccess.
		throw new ApiError(500, "team_members_missing", `Team ${teamId} has no team_members row`);
	}
	return row;
}
