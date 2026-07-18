/**
 * L13 — Team lookup service: application-layer enforcement of the 1:1
 * Team = TeamMembers invariant.
 *
 * @lore L13: The schema allows multiple team_members per team (no UNIQUE index on
 * team_members.team_id). The application contract is: exactly one active TeamMember per
 * Team. getTeamMembers with `require:true` throws 500 (not 404) when the invariant is
 * broken because a missing team_members row is a programming bug, not a user error.
 *
 * @lore U1: Renamed from product-team.ts. `loadTeamMembers` renamed to `getTeamMembers`.
 * Queries `teamMembers` table (formerly `teams`). Returns `TeamMember` (formerly `Team`).
 *
 * @lore AU20 Am7: collapsed 22 per-call-site exports into 8 parameterized interfaces.
 * Old per-WHERE functions (getTeamById/getTeamByName/getTeamMembersById/
 * getTeamMembersByTeamId/loadTeamMembers/listTeamsByIds/listAllTeams/listAllTeamMembers/
 * listActiveTeamMembersWithTeamNames) → query-keyed getTeam/listTeams/getTeamMembers/
 * listTeamMembers. Mutators (updateTeamPhase/setTeamMembersActiveBets/setTeamMembersLeadAgent)
 * → patch-param updateTeam(teamId, patch). Cost verbs (incrementTeamMembersCost/
 * resetTeamMembersCost/resetAllTeamMembersCost) → applyTeamCost(target, change). Create/
 * delete pairs (createTeam+createTeamMembersGroup, deleteTeamById+deleteTeamMembersGroupById)
 * → atomic createTeam (1:1 invariant makes both rows one operation) + deleteTeam (cascades).
 */

import type { Team, TeamMember, WriteExecutor } from "@hyperidle/db";
import { type HyperIdleDb, teamMembers, teams } from "@hyperidle/db";
import { eq, inArray, isNull, sql } from "drizzle-orm";

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

// ---------------------------------------------------------------------------
// Team reads (collapse 4 → 2)
// ---------------------------------------------------------------------------

/**
 * Read a single `teams` row by id or name, or `undefined` if none exists.
 *
 * @example getTeam(db, { id: teamId })
 * @example getTeam(db, { name: "Alpha" })
 */
export async function getTeam(
	db: HyperIdleDb,
	query: { id: string } | { name: string },
): Promise<Team | undefined> {
	if ("id" in query) {
		const [row] = await db.select().from(teams).where(eq(teams.id, query.id)).limit(1);
		return row;
	}
	const [row] = await db.select().from(teams).where(eq(teams.name, query.name)).limit(1);
	return row;
}

/**
 * List `teams` rows, optionally filtered by a set of ids.
 * An empty `ids` array returns `[]` without querying (short-circuit guards
 * against empty-inArray dialects).
 *
 * @example listTeams(db)               — all teams
 * @example listTeams(db, { ids })      — batch by id
 */
export async function listTeams(
	db: HyperIdleDb,
	filter?: { ids?: readonly string[] },
): Promise<Team[]> {
	if (filter?.ids !== undefined) {
		if (filter.ids.length === 0) return [];
		return db
			.select()
			.from(teams)
			.where(inArray(teams.id, Array.from(filter.ids)));
	}
	return db.select().from(teams);
}

// ---------------------------------------------------------------------------
// TeamMembers reads (collapse 5 → 2, fixes the getTeamMembersById/getTeamMembersByTeamId duplicate)
// ---------------------------------------------------------------------------

/** Row shape for {@link listTeamMembers} with `withTeamName: true`. */
export interface ActiveTeamMembersWithTeamName {
	readonly id: string;
	readonly name: string;
	readonly teamActualId: string;
}

/**
 * Read the single `teamMembers` row keyed by `{ id }` (teamMembers.id) or
 * `{ teamId }` (teamMembers.teamId), or `undefined` if none exists.
 *
 * With `opts.require = true` enforces the 1:1 invariant: throws
 * `ApiError(500, 'team_members_missing')` when no row exists and
 * `ApiError(500, 'invariant_broken')` when more than one exists.
 *
 * Accepts `WriteExecutor` so callers can pass a `tx` handle from inside their
 * own `db.transaction(...)` — `transitionBet`'s capacity re-check runs inside
 * its own tx to serialize concurrent commits.
 */
export function getTeamMembers(
	db: WriteExecutor,
	query: { id: string } | { teamId: string },
	opts: { require: true },
): Promise<TeamMember>;
export function getTeamMembers(
	db: WriteExecutor,
	query: { id: string } | { teamId: string },
	opts?: { require?: false },
): Promise<TeamMember | undefined>;
export async function getTeamMembers(
	db: WriteExecutor,
	query: { id: string } | { teamId: string },
	opts?: { require?: boolean },
): Promise<TeamMember | undefined> {
	const rows =
		"id" in query
			? await db.select().from(teamMembers).where(eq(teamMembers.id, query.id)).limit(2)
			: await db.select().from(teamMembers).where(eq(teamMembers.teamId, query.teamId)).limit(2);

	if (!opts?.require) {
		return rows[0];
	}

	// require:true — enforce the 1:1 invariant
	const keyLabel = "id" in query ? `id=${query.id}` : `teamId=${query.teamId}`;
	if (rows.length === 0) {
		throw new ApiError(500, "team_members_missing", `TeamMembers row for ${keyLabel} not found`);
	}
	if (rows.length > 1) {
		throw new ApiError(
			500,
			"invariant_broken",
			`TeamMembers for ${keyLabel} has ${rows.length} rows — invariant broken`,
		);
	}
	const [row] = rows;
	if (!row) {
		throw new ApiError(500, "team_members_missing", `TeamMembers row for ${keyLabel} not found`);
	}
	return row;
}

/**
 * List `teamMembers` rows, optionally filtered by active status and/or
 * joined to the team name.
 *
 * With `withTeamName: true` returns `ActiveTeamMembersWithTeamName[]`
 * (id, teams.name, teams.id as teamActualId). The join is ACL-private to
 * this package; callers receive the projected shape.
 *
 * With `active: true` filters to rows where `dissolvedAt IS NULL`.
 *
 * @example listTeamMembers(db)                                   — all rows, full TeamMember
 * @example listTeamMembers(db, { active: true, withTeamName: true })  — org-chart shape
 */
export function listTeamMembers(
	db: HyperIdleDb,
	filter: { active?: boolean; withTeamName: true },
): Promise<ActiveTeamMembersWithTeamName[]>;
export function listTeamMembers(
	db: HyperIdleDb,
	filter?: { active?: boolean; withTeamName?: false },
): Promise<TeamMember[]>;
export async function listTeamMembers(
	db: HyperIdleDb,
	filter?: { active?: boolean; withTeamName?: boolean },
): Promise<TeamMember[] | ActiveTeamMembersWithTeamName[]> {
	if (filter?.withTeamName) {
		const q = db
			.select({ id: teamMembers.id, name: teams.name, teamActualId: teams.id })
			.from(teamMembers)
			.innerJoin(teams, eq(teams.id, teamMembers.teamId));
		if (filter.active) return q.where(isNull(teamMembers.dissolvedAt));
		return q;
	}
	if (filter?.active) {
		return db.select().from(teamMembers).where(isNull(teamMembers.dissolvedAt));
	}
	return db.select().from(teamMembers);
}

// ---------------------------------------------------------------------------
// Team + TeamMembers writes (collapse 7 → 3)
// ---------------------------------------------------------------------------

/**
 * Input for the atomic {@link createTeam} operation (inserts both `teams` and
 * `teamMembers` rows in one call — 1:1 invariant makes them one operation).
 *
 * @lore AU20 Am7: `teamMembersId` is the new field that replaces the old
 * separate `CreateTeamMembersGroupInput.id`. `capacity`/`activeBets`/`formedAt`
 * default to 5/0/createdAt when omitted so callers that only care about the
 * team domain fields aren't forced to supply membership-group bookkeeping.
 */
export interface CreateTeamInput {
	// teams row
	readonly id: string;
	readonly name: string;
	readonly phase: string;
	readonly functions: string | null;
	readonly factoryDbPath: string | null;
	readonly createdAt: string;
	readonly defaultHarnessType?: string | null;
	readonly defaultModelId?: string | null;
	readonly defaultModelProvider?: string | null;
	// teamMembers companion (1:1)
	readonly teamMembersId: string;
	readonly capacity?: number;
	readonly activeBets?: number;
	readonly formedAt?: string;
}

/**
 * Atomically insert a `teams` row and its `teamMembers` companion.
 *
 * The 1:1 invariant makes a team without a membership group invalid, so both
 * rows are inserted in one call. Callers that previously called `createTeam` +
 * `createTeamMembersGroup` separately should migrate to this single call.
 */
export async function createTeam(db: HyperIdleDb, input: CreateTeamInput): Promise<void> {
	const {
		teamMembersId,
		capacity = 5,
		activeBets = 0,
		formedAt,
		// teams-only fields
		id,
		name,
		phase,
		functions,
		factoryDbPath,
		createdAt,
		defaultHarnessType,
		defaultModelId,
		defaultModelProvider,
	} = input;

	await db.insert(teams).values({
		id,
		name,
		phase,
		functions,
		factoryDbPath,
		createdAt,
		defaultHarnessType: defaultHarnessType ?? null,
		defaultModelId: defaultModelId ?? null,
		defaultModelProvider: defaultModelProvider ?? null,
	});
	await db.insert(teamMembers).values({
		id: teamMembersId,
		teamId: id,
		capacity,
		activeBets,
		formedAt: formedAt ?? createdAt,
	});
}

/**
 * Update team-owned columns on either the `teams` row (phase) or its
 * `teamMembers` companion (activeBets, leadAgentId).
 *
 * The 1:1 invariant lets membership-group fields be addressed via `teamId`
 * (WHERE teamMembers.teamId = teamId) — no pre-lookup needed.
 *
 * Accepts `WriteExecutor` so callers can pass a `tx` handle (bet-state-machine
 * updates `activeBets` inside its own transaction).
 *
 * @example updateTeam(db, teamId, { phase: "archive" })
 * @example updateTeam(tx, teamId, { activeBets: newCount })
 * @example updateTeam(db, teamId, { leadAgentId: agentId })
 */
export async function updateTeam(
	db: WriteExecutor,
	teamId: string,
	patch: { phase?: string; activeBets?: number; leadAgentId?: string },
): Promise<void> {
	if (patch.phase !== undefined) {
		await db.update(teams).set({ phase: patch.phase }).where(eq(teams.id, teamId));
	}
	const membersPatch: { activeBets?: number; leadAgentId?: string } = {};
	if (patch.activeBets !== undefined) membersPatch.activeBets = patch.activeBets;
	if (patch.leadAgentId !== undefined) membersPatch.leadAgentId = patch.leadAgentId;
	if (Object.keys(membersPatch).length > 0) {
		await db.update(teamMembers).set(membersPatch).where(eq(teamMembers.teamId, teamId));
	}
}

/**
 * Delete a team and its `teamMembers` companion (1:1 cascade).
 * Deletes the membership-group row first (to keep FK order safe), then the
 * team row. The primary use case is the POST /teams rollback path (AC-1h).
 */
export async function deleteTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	await db.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
	await db.delete(teams).where(eq(teams.id, teamId));
}

// ---------------------------------------------------------------------------
// Cost mechanics (collapse 3 → 1)
// ---------------------------------------------------------------------------

/**
 * Apply a cost change to one `teamMembers` row or all rows.
 *
 * - `target: { id }` — the `teamMembers.id` (membership-group primary key).
 * - `target: "all"` — factory-wide reset (deliberate no-WHERE update).
 * - `change: { deltaMinor }` — atomically adds `delta` via `coalesce(costActual, 0) + delta`.
 * - `change: "reset"` — sets `costActual` to 0.
 *
 * @lore AU20 Am7 / AU19 3g: cost-tracking belongs to the `cost` Service
 * in spirit; this function is the Table-ACL write seam forced by
 * `teamMembers.costActual` living on an org-owned table. When `costActual`
 * migrates to a `cost`-owned table, this function disappears.
 */
export async function applyTeamCost(
	db: WriteExecutor,
	target: { id: string } | "all",
	change: { deltaMinor: number } | "reset",
): Promise<void> {
	if (target === "all") {
		if (change === "reset") {
			// intentional: factory reset clears ALL rows (deliberate no-WHERE update).
			await db.update(teamMembers).set({ costActual: 0 }).where(sql`true`);
		} else {
			await db
				.update(teamMembers)
				.set({ costActual: sql`coalesce(${teamMembers.costActual}, 0) + ${change.deltaMinor}` })
				.where(sql`true`);
		}
	} else if (change === "reset") {
		await db.update(teamMembers).set({ costActual: 0 }).where(eq(teamMembers.id, target.id));
	} else {
		await db
			.update(teamMembers)
			.set({
				costActual: sql`coalesce(${teamMembers.costActual}, 0) + ${change.deltaMinor}`,
			})
			.where(eq(teamMembers.id, target.id));
	}
}
