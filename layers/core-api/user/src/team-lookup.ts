import type { Team, WriteExecutor } from "@hyperidle/db";
import { type HyperIdleDb, teams, users, userTeams } from "@hyperidle/db";
import { and, asc, eq, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Team reads
// ---------------------------------------------------------------------------

/**
 * Read a single `teams` row by id or name, or `undefined` if none exists.
 * A name lookup is the OLDEST match (`createdAt` then `id`, ascending) — two
 * teams may share a name (no unique index on the column), and `edit_user`'s
 * "found by name (oldest), or created" needs a deterministic pick rather
 * than whatever order the database happens to return.
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
	const [row] = await db
		.select()
		.from(teams)
		.where(eq(teams.name, query.name))
		.orderBy(asc(teams.createdAt), asc(teams.id))
		.limit(1);
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
export function listTeams(db: HyperIdleDb, filter?: { ids?: readonly string[] }): Promise<Team[]> {
	if (filter?.ids !== undefined) {
		if (filter.ids.length === 0) return Promise.resolve([]);
		return db
			.select()
			.from(teams)
			.where(inArray(teams.id, Array.from(filter.ids)));
	}
	return db.select().from(teams);
}

// ---------------------------------------------------------------------------
// Team writes
// ---------------------------------------------------------------------------

/**
 * Input for {@link createTeam}.
 */
export interface CreateTeamInput {
	readonly id: string;
	readonly name: string;
	readonly createdAt: string;
}

// @lore: the first team ever created is the global team (the company); every person joins it automatically
/** Insert a `teams` row. The first team ever created is marked as the global team. */
export async function createTeam(db: WriteExecutor, input: CreateTeamInput): Promise<void> {
	const [existingGlobal] = await db
		.select({ id: teams.id })
		.from(teams)
		.where(eq(teams.isGlobal, true))
		.limit(1);
	await db.insert(teams).values({
		id: input.id,
		name: input.name,
		createdAt: input.createdAt,
		isGlobal: !existingGlobal,
	});
}

/**
 * Return the global team (the company-wide team every person belongs to), or `undefined`
 * when no team has been marked global yet (pre-migration state).
 */
export async function getGlobalTeam(db: HyperIdleDb): Promise<Team | undefined> {
	const [row] = await db.select().from(teams).where(eq(teams.isGlobal, true)).limit(1);
	return row;
}

/**
 * Read the default runner id for each of the given team ids.
 * Returns a map from teamId → userId (only entries where a default runner exists).
 */
export async function listDefaultRunners(
	db: HyperIdleDb,
	teamIds: readonly string[],
): Promise<Map<string, string>> {
	if (teamIds.length === 0) return new Map();
	const rows = await db
		.select({ teamId: userTeams.teamId, userId: userTeams.userId })
		.from(userTeams)
		.where(and(eq(userTeams.isDefaultRunner, true), inArray(userTeams.teamId, [...teamIds])));
	return new Map(rows.map((r) => [r.teamId, r.userId]));
}

/**
 * Move the default runner of a team to a specific person.
 * Clears the previous default runner then sets the new one.
 * The person must already be a member (caller is responsible for that check).
 */
export async function setDefaultRunner(
	db: HyperIdleDb,
	teamId: string,
	userId: string,
): Promise<void> {
	// Clear the old default runner for this team
	await db.update(userTeams).set({ isDefaultRunner: false }).where(eq(userTeams.teamId, teamId));
	// Set the new one
	await db
		.update(userTeams)
		.set({ isDefaultRunner: true })
		.where(and(eq(userTeams.teamId, teamId), eq(userTeams.userId, userId)));
}

/**
 * If the team has no default runner yet, make the given person the default runner.
 * No-op when a default runner already exists for that team.
 */
export async function ensureDefaultRunner(
	db: HyperIdleDb,
	teamId: string,
	userId: string,
): Promise<void> {
	const [existing] = await db
		.select({ userId: userTeams.userId })
		.from(userTeams)
		.where(and(eq(userTeams.teamId, teamId), eq(userTeams.isDefaultRunner, true)))
		.limit(1);
	if (!existing) {
		await db
			.update(userTeams)
			.set({ isDefaultRunner: true })
			.where(and(eq(userTeams.teamId, teamId), eq(userTeams.userId, userId)));
	}
}

/**
 * After a membership change, restore the default runner for a team that may have
 * lost theirs. Picks the first remaining person (by users.created_at then id).
 * No-op when the team already has a default runner or has no persons.
 */
export async function repairDefaultRunner(db: HyperIdleDb, teamId: string): Promise<void> {
	const [existing] = await db
		.select({ userId: userTeams.userId })
		.from(userTeams)
		.where(and(eq(userTeams.teamId, teamId), eq(userTeams.isDefaultRunner, true)))
		.limit(1);
	if (existing) return; // already has one

	// Pick the earliest person in this team as the new default runner
	const [candidate] = await db
		.select({ userId: userTeams.userId })
		.from(userTeams)
		.innerJoin(users, eq(users.id, userTeams.userId))
		.where(and(eq(userTeams.teamId, teamId), eq(users.kind, "human")))
		.orderBy(asc(users.createdAt), asc(users.id))
		.limit(1);
	if (!candidate) return; // no persons left in team
	await db
		.update(userTeams)
		.set({ isDefaultRunner: true })
		.where(and(eq(userTeams.teamId, teamId), eq(userTeams.userId, candidate.userId)));
}
