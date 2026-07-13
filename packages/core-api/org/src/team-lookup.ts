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

import type { TeamMember, WriteExecutor } from "@hyperidle/db";
import { type HyperIdleDb, teamMembers } from "@hyperidle/db";
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

/**
 * Read the single team_members row for a team, or `undefined` if none exists.
 *
 * @lore AU19 Increment 1c: this is the concrete implementation `work`'s
 * `TeamCapacityReader` port (Mechanism C) wires to. `bet-state-machine.ts`/
 * `bet-decomposition.ts` used to import the `teamMembers` table directly for
 * capacity tracking (an interim `UNOWNED_SHARED_TABLES` exemption in
 * `table-ownership-guard.ts` — closed by this Increment, `org` is now the
 * real table owner). Unlike `loadTeamMembers` (throws `ApiError` on
 * missing/duplicate — an HTTP-route invariant), this returns `undefined` on
 * missing so `work`'s existing generic-`Error`-throwing behavior at each call
 * site is preserved byte-for-byte (no behavior change). Accepts `WriteExecutor`
 * (not just `HyperIdleDb`) so callers can pass a `tx` handle from inside their
 * own `db.transaction(...)` — `transitionBet`'s capacity re-check runs inside
 * its own tx to serialize concurrent commits.
 */
export async function getTeamMembersByTeamId(
	db: WriteExecutor,
	teamId: string,
): Promise<TeamMember | undefined> {
	const [row] = await db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId)).limit(1);
	return row;
}

/**
 * Read the single team_members row by its OWN `id` (not `teamId`), or
 * `undefined` if none exists.
 *
 * @lore AU19 Increment 1g: this is the concrete implementation `notifications`'
 * `NotificationsTeamReader` port (Mechanism C) wires to. `silence-policy.ts`
 * used to import the `teamMembers` table directly to resolve
 * `agent.teamId -> teamMembers.id -> teamMembers.teamId` for per-team silence
 * — a table-ownership-guard completeness finding (`teamMembers` is `org`-owned
 * since Increment 1c, but no accessor keyed on the row's own `id` existed yet;
 * `getTeamMembersByTeamId` queries the OTHER column, `teamMembers.teamId`).
 * Added here rather than reusing `getTeamMembersByTeamId` because the two
 * queries are genuinely different WHERE clauses, not a naming accident.
 */
export async function getTeamMembersById(
	db: HyperIdleDb,
	id: string,
): Promise<TeamMember | undefined> {
	const [row] = await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
	return row;
}

/**
 * Set `team_members.active_bets` to an absolute value.
 *
 * @lore AU19 Increment 1c: the concrete write-side counterpart to
 * `getTeamMembersByTeamId` — `work`'s `TeamCapacityReader.setActiveBets` port
 * wires to this. `work` computes the new value (increment on activate,
 * decrement on complete/kill, clamped at 0) and passes it here; `org` owns
 * only the write mechanics, not the bet-capacity business rule.
 */
export async function setTeamMembersActiveBets(
	db: WriteExecutor,
	teamMembersId: string,
	activeBets: number,
): Promise<void> {
	await db.update(teamMembers).set({ activeBets }).where(eq(teamMembers.id, teamMembersId));
}
