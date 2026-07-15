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

import type { Team, TeamMember, WriteExecutor } from "@hyperidle/db";
import { type HyperIdleDb, teamMembers, teams } from "@hyperidle/db";
import { eq, inArray, sql } from "drizzle-orm";

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

/**
 * Atomically add `deltaMinor` to a `team_members` row's `costActual` via
 * `coalesce(costActual, 0) + delta`. Owns the coalesce SQL so the
 * `teamMembers.costActual` column ref never leaves this store.
 *
 * @lore AU19 Increment 3g: the concrete write-side counterpart to
 * `getTeamMembersById` — `cost`'s `CostTeamAccessor` port (Mechanism C) wires
 * to this. `cost-cap.ts`'s `recordCostAndCheck` used to `db.update(teamMembers)`
 * directly (an ownership violation once `cost-cap.ts` becomes its own Service
 * package — `teamMembers` is `org`'s `TABLE_OWNER` since Increment 1c). Mirrors
 * `@hyperidle/users`' `incrementUserCost`.
 */
export async function incrementTeamMembersCost(
	db: WriteExecutor,
	teamMembersId: string,
	deltaMinor: number,
): Promise<void> {
	await db
		.update(teamMembers)
		.set({ costActual: sql`coalesce(${teamMembers.costActual}, 0) + ${deltaMinor}` })
		.where(eq(teamMembers.id, teamMembersId));
}

/**
 * Reset a single `team_members` row's `costActual` to zero.
 *
 * @lore AU19 Increment 3g: closes `cost`'s per-team billing-cycle reset
 * (`resetCosts({level:"team"})`) — same ownership-violation closure as
 * `incrementTeamMembersCost` above.
 */
export async function resetTeamMembersCost(
	db: WriteExecutor,
	teamMembersId: string,
): Promise<void> {
	await db.update(teamMembers).set({ costActual: 0 }).where(eq(teamMembers.id, teamMembersId));
}

/**
 * Bulk reset EVERY `team_members` row's `costActual` to zero (factory-wide
 * billing-cycle reset). Deliberate no-WHERE update, mirrors
 * `@hyperidle/users`' `resetAllUserCost`.
 *
 * @lore AU19 Increment 3g: closes `cost`'s factory-level reset
 * (`resetCosts({level:"factory"})`) — same ownership-violation closure as
 * `incrementTeamMembersCost` above.
 */
export async function resetAllTeamMembersCost(db: WriteExecutor): Promise<void> {
	// intentional: factory reset clears ALL rows (deliberate no-WHERE update).
	await db.update(teamMembers).set({ costActual: 0 }).where(sql`true`);
}

/**
 * Read a single `teams` row (the domain-entity table — distinct from
 * `team_members`, the membership-group table the rest of this file's
 * functions operate on) by its own `id`, or `undefined` if none exists.
 *
 * @lore AU19 Increment 3 (teams table-ownership remediation, 2026-07-15
 * founder ruling): the concrete implementation `context-assembly`'s
 * `TeamReader` DI port (Mechanism C) wires to — `session-context.ts` used to
 * `.from(teams)` directly, citing a stale pre-AU19 `@lore` ("`teams` is not
 * one of the five owned tables, so any file may query it") that predates
 * `org` existing as a real, guarded Table-ACL package. Mirrors
 * `getTeamMembersById`'s shape one column over (`teams.id` vs
 * `teamMembers.id`).
 */
export async function getTeamById(db: HyperIdleDb, teamId: string): Promise<Team | undefined> {
	const [row] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
	return row;
}

/**
 * Batch-read `teams` rows by id — mirrors `@hyperidle/work`'s
 * `listBetsByIds`' empty-ids short-circuit (an empty `inArray` errors in some
 * dialects).
 *
 * @lore AU19 Increment 3 (teams table-ownership remediation): closes
 * `routes/search.ts`'s batch team-name lookup for a page of bet results —
 * the other named stale-`@lore` site (alongside `work-service.ts`) the
 * founder ruling identified as evidence of the same unconverted `teams`
 * access pattern.
 */
export async function listTeamsByIds(db: HyperIdleDb, ids: readonly string[]): Promise<Team[]> {
	if (ids.length === 0) return [];
	return db
		.select()
		.from(teams)
		.where(inArray(teams.id, Array.from(ids)));
}

/** Input for {@link createTeam}. */
export interface CreateTeamInput {
	readonly id: string;
	readonly name: string;
	readonly phase: string;
	readonly functions: string | null;
	readonly factoryDbPath: string | null;
	readonly createdAt: string;
}

/**
 * Insert a `teams` row.
 *
 * @lore AU19 Increment 4: closes `tools/create-team.ts`'s direct `teams`
 * insert — the same forcing function as `getTeamById` above, now for the
 * write side (`create-team.ts` moves into the guarded `tool-handlers`
 * package this increment).
 */
export async function createTeam(db: HyperIdleDb, input: CreateTeamInput): Promise<void> {
	await db.insert(teams).values(input);
}

/** Input for {@link createTeamMembersGroup}. */
export interface CreateTeamMembersGroupInput {
	readonly id: string;
	readonly teamId: string;
	readonly capacity: number;
	readonly activeBets: number;
	readonly formedAt: string;
}

/**
 * Insert a `teamMembers` (membership-group) row.
 *
 * @lore AU19 Increment 4: closes `tools/create-team.ts`'s direct
 * `teamMembers` insert — same forcing function as `createTeam` above.
 */
export async function createTeamMembersGroup(
	db: HyperIdleDb,
	input: CreateTeamMembersGroupInput,
): Promise<void> {
	await db.insert(teamMembers).values(input);
}

/**
 * Set the lead agent on a `teamMembers` row.
 *
 * @lore AU19 Increment 4: closes `tools/create-team.ts`'s direct
 * `teamMembers` update.
 */
export async function setTeamMembersLeadAgent(
	db: HyperIdleDb,
	teamMembersId: string,
	leadAgentId: string,
): Promise<void> {
	await db.update(teamMembers).set({ leadAgentId }).where(eq(teamMembers.id, teamMembersId));
}
