import type { Team, WriteExecutor } from "@hyperidle/db";
import { type HyperIdleDb, teams } from "@hyperidle/db";
import { asc, eq, inArray } from "drizzle-orm";

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

/** Insert a `teams` row. */
export async function createTeam(db: WriteExecutor, input: CreateTeamInput): Promise<void> {
	await db.insert(teams).values({
		id: input.id,
		name: input.name,
		createdAt: input.createdAt,
	});
}
