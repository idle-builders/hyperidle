/**
 * L13 — Team lookup service.
 *
 * @lore AU44 B1: `team_members` dissolved into `teams`. The 500-throwing
 * invariant police in `getTeamMembers` existed only because one entity was
 * split across two tables. After the fold, `getTeamMembers` collapses into
 * `getTeam`, `listTeamMembers` into `listTeams`, and `createTeam` / `updateTeam`
 * each write one table instead of two. See migration 0058.
 *
 * @lore U1: Renamed from product-team.ts. Migration 0021 renamed both tables.
 *
 * @lore AU20 Am7: collapsed 22 per-call-site exports into parameterized interfaces.
 * AU21 Increment 14a: cost verbs deleted with the cost feature.
 */

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
// Team writes
// ---------------------------------------------------------------------------

/**
 * Input for {@link createTeam}.
 *
 * @lore BC5 T11: a team is an id and a name now (D-e3zm2j, migration 0090)
 * — `phase`/`factoryDbPath`/every other scaffold-tracking column is gone.
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

// @lore BC5 T11: `updateTeam` (phase/leadAgentId) is deleted — both columns
// are dropped (migration 0090); a team has no writable field but its name,
// and `edit_user` never renames one.
