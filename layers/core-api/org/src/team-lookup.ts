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
import { eq, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Team reads
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
// Team writes
// ---------------------------------------------------------------------------

/**
 * Input for {@link createTeam}.
 *
 * @lore AU44 B1: `teamMembersId`/`capacity`/`activeBets`/`formedAt` removed —
 * these formerly seeded the companion `team_members` row; after the fold they
 * live on `teams` with schema defaults (capacity=5, formedAt=createdAt).
 * @lore BB1: `activeBets` column dropped — the WIP limit is now counted live
 * from `tasks.state = 'in_progress'` via `countTeamTasksInProgress` in
 * `@hyperidle/work`. No stored tally that can drift.
 */
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
 * @lore AU44 B1: formerly inserted both `teams` and `team_members` companion.
 * After the fold, a single insert suffices; default (capacity=5) lives in the schema.
 * @lore BB1: `activeBets: 0` default removed — the column is dropped.
 */
export async function createTeam(db: WriteExecutor, input: CreateTeamInput): Promise<void> {
	await db.insert(teams).values({
		id: input.id,
		name: input.name,
		phase: input.phase,
		functions: input.functions,
		factoryDbPath: input.factoryDbPath,
		createdAt: input.createdAt,
		capacity: 5,
		formedAt: input.createdAt,
	});
}

/**
 * Update team-owned columns on the `teams` row.
 *
 * @example updateTeam(db, teamId, { phase: "archive" })
 * @example updateTeam(db, teamId, { leadAgentId: agentId })
 *
 * @lore AU44 B1: formerly split between `teams` (phase) and `team_members`
 * (leadAgentId). After the fold all columns are on `teams`.
 * @lore BB1: `activeBets` removed — the column is dropped; WIP is counted live.
 */
export async function updateTeam(
	db: WriteExecutor,
	teamId: string,
	patch: { phase?: string; leadAgentId?: string },
): Promise<void> {
	const set: { phase?: string; leadAgentId?: string } = {};
	if (patch.phase !== undefined) set.phase = patch.phase;
	if (patch.leadAgentId !== undefined) set.leadAgentId = patch.leadAgentId;
	if (Object.keys(set).length === 0) return;
	await db.update(teams).set(set).where(eq(teams.id, teamId));
}

// @lore AU21 Increment 14a: `applyTeamCost` (the `teamMembers.costActual`
// increment/reset seam) is deleted along with the rest of the cost feature —
// the column is dropped, no replacement.
