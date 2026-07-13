/**
 * User store — the single owner of `users` row writes (AU12). Every caller
 * that creates or modifies a user record (human or agent) routes its
 * `insert`/`update` through one of these functions instead of writing the
 * Drizzle table directly.
 *
 * @lore Executor param is plain `HyperIdleDb` (no union, no derived generic).
 * The drizzle transaction handle is structurally compatible (same
 * `insert`/`update`/`select` methods), so a caller inside `db.transaction`
 * passes its `tx as HyperIdleDb` — the accepted transaction-composition cast
 * used repo-wide. This mirrors the documented precedent at
 * `practice-meeting.ts:448-454` and avoids depending on drizzle's internal
 * transaction type.
 *
 * @lore `updateUser`'s patch admits `SQL` per column (not just literal
 * `NewUser` values) because cost metering accumulates atomically via
 * `costActual = coalesce(costActual, 0) + delta` (see `cost-cap.ts`), which
 * must be a SQL expression to stay race-free.
 */

import { type HyperIdleDb, type NewUser, type User, users } from "@hyperidle/db";
import { and, eq, inArray, ne, type SQL, sql } from "drizzle-orm";
import { escapeLikePattern } from "./like-escape.js";

/** Per-column patch that also admits SQL expressions (e.g. cost coalesce). */
type UserPatch = Partial<{ [K in keyof NewUser]: NewUser[K] | SQL }>;

export async function insertUser(exec: HyperIdleDb, values: NewUser): Promise<void> {
	await exec.insert(users).values(values);
}

export async function updateUser(exec: HyperIdleDb, id: string, patch: UserPatch): Promise<void> {
	await exec.update(users).set(patch).where(eq(users.id, id));
}

/**
 * Get the user row with `id`, inserting `create` first if it does not exist.
 * Caller supplies the full `NewUser` (keeps assistant persona / system-prompt
 * composition in the caller — pulling that agent-layer constant into a core
 * service would be a boundary smell).
 */
export async function getOrCreateUser(
	exec: HyperIdleDb,
	id: string,
	create: NewUser,
): Promise<User> {
	const [existing] = await exec.select().from(users).where(eq(users.id, id)).limit(1);
	if (existing) return existing;
	await insertUser(exec, create);
	const [created] = await exec.select().from(users).where(eq(users.id, id)).limit(1);
	if (!created) {
		throw new Error(`getOrCreateUser: user ${id} missing immediately after insert`);
	}
	return created;
}

/** Bulk reset every user's accumulated cost to zero (cost-cap reset path). */
export async function resetAllUserCost(exec: HyperIdleDb): Promise<void> {
	await exec.update(users).set({ costActual: 0 });
}

/**
 * Atomically add `deltaMinor` to a user's `costActual` via
 * `coalesce(costActual, 0) + delta`. Owns the coalesce SQL so the
 * `users.costActual` column ref never leaves this store (cost-cap accumulation).
 */
export async function incrementUserCost(
	exec: HyperIdleDb,
	id: string,
	deltaMinor: number,
): Promise<void> {
	await exec
		.update(users)
		.set({ costActual: sql`coalesce(${users.costActual}, 0) + ${deltaMinor}` })
		.where(eq(users.id, id));
}

// ===========================================================================
// READS (AU12 rework) — every read of `users` routes through here. Full-row
// getters serve internal/logic callers and the user routes whose current
// response IS the full row (e.g. routes/users.ts CRUD returns `c.json(fullRow)`
// incl. `email` — behavior-preserving). Projected getters return EXACTLY the
// column set their route's current response includes — no more, no less (§8b#1).
// ===========================================================================

// --- full-row getters (internal / trusted callers, and full-row routes) ---

/** Full user row by id, or `undefined`. The dominant lookup (~64 sites). */
export async function getUserById(exec: HyperIdleDb, id: string): Promise<User | undefined> {
	const [row] = await exec.select().from(users).where(eq(users.id, id)).limit(1);
	return row;
}

/**
 * Full user row by id, additionally scoped to a team-membership group when
 * `teamMembersId` is provided (trigger-resolution's membership-guarded lookup).
 */
export async function getUserByIdScopedToTeam(
	exec: HyperIdleDb,
	id: string,
	teamMembersId?: string,
): Promise<User | undefined> {
	const [row] = await exec
		.select()
		.from(users)
		.where(
			teamMembersId ? and(eq(users.id, id), eq(users.teamId, teamMembersId)) : eq(users.id, id),
		)
		.limit(1);
	return row;
}

/** Full user rows for an id set (`inArray(users.id, ids)`). */
export async function getUsersByIds(exec: HyperIdleDb, ids: string[]): Promise<User[]> {
	return exec.select().from(users).where(inArray(users.id, ids));
}

/** Every user row. */
export async function listAllUsers(exec: HyperIdleDb): Promise<User[]> {
	return exec.select().from(users);
}

/** First user of a given `kind` (e.g. the singleton `human`), or `undefined`. */
export async function getFirstUserByKind(
	exec: HyperIdleDb,
	kind: string,
): Promise<User | undefined> {
	const [row] = await exec.select().from(users).where(eq(users.kind, kind)).limit(1);
	return row;
}

/** All user rows of a given `kind`. */
export async function listUsersByKind(exec: HyperIdleDb, kind: string): Promise<User[]> {
	return exec.select().from(users).where(eq(users.kind, kind));
}

/** All user rows in a team-membership group (`users.teamId = teamMembersId`). */
export async function listUsersByTeam(exec: HyperIdleDb, teamMembersId: string): Promise<User[]> {
	return exec.select().from(users).where(eq(users.teamId, teamMembersId));
}

/** All user rows across a set of team-membership groups (`inArray(users.teamId, ids)`). */
export async function listUsersByTeams(
	exec: HyperIdleDb,
	teamMembersIds: string[],
): Promise<User[]> {
	return exec.select().from(users).where(inArray(users.teamId, teamMembersIds));
}

/** All user rows in a team-membership group filtered by `kind`. */
export async function listUsersByTeamAndKind(
	exec: HyperIdleDb,
	teamMembersId: string,
	kind: string,
): Promise<User[]> {
	return exec
		.select()
		.from(users)
		.where(and(eq(users.teamId, teamMembersId), eq(users.kind, kind)));
}

/** Active AI users across a set of team-membership groups, ordered by id (candidate pools). */
export async function listActiveAiUsersByTeams(
	exec: HyperIdleDb,
	teamMembersIds: string[],
): Promise<User[]> {
	return exec
		.select()
		.from(users)
		.where(
			and(eq(users.kind, "ai"), eq(users.status, "active"), inArray(users.teamId, teamMembersIds)),
		)
		.orderBy(users.id);
}

/** First active teammate holding `role` in any of `teamMembersIds`, excluding `excludeId`, or `undefined`. */
export async function findActiveTeammateByRole(
	exec: HyperIdleDb,
	role: string,
	teamMembersIds: string[],
	excludeId: string,
): Promise<User | undefined> {
	const [row] = await exec
		.select()
		.from(users)
		.where(
			and(
				eq(users.role, role),
				inArray(users.teamId, teamMembersIds),
				eq(users.status, "active"),
				ne(users.id, excludeId),
			),
		)
		.limit(1);
	return row;
}

/** Users whose name matches `query` (case-insensitive substring). Owns the `LOWER(name) LIKE` + escape. */
export async function searchUsersByName(exec: HyperIdleDb, query: string): Promise<User[]> {
	const pattern = `%${escapeLikePattern(query.toLowerCase())}%`;
	return exec.select().from(users).where(sql`LOWER(${users.name}) LIKE ${pattern} ESCAPE '\\'`);
}

// --- aggregates ---

/** Sum of every user's `costActual` (factory-wide spend). Owns the `sum(costActual)` fragment. */
export async function sumAllUserCost(exec: HyperIdleDb): Promise<number> {
	const [row] = await exec
		.select({ total: sql<number>`coalesce(sum(${users.costActual}), 0)` })
		.from(users);
	return row?.total ?? 0;
}

// --- projected, response-bound getters (column set == current response, §8b#1) ---

/** One agent-list row — EXACTLY the columns `routes/agents.ts` GET `/` returns today. */
export interface AgentProfileRow {
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly agentCategory: string | null;
	readonly systemPrompt: string | null;
	readonly harnessType: string | null;
	readonly modelTierPreference: string | null;
	readonly modelId: string | null;
	readonly modelProvider: string | null;
	readonly maxConcurrentSessions: number;
	readonly status: string;
}

/**
 * Non-system, non-retired AI agents for the agent list. Returns EXACTLY the
 * users columns the route responds with today — `systemPrompt` INCLUDED because
 * `routes/agents.ts` legitimately returns it (excluding it would break AC-2).
 * `activeSessions` is NOT a users column — the route still joins it from
 * `sessions` and merges in JS.
 */
export async function listAgentProfiles(exec: HyperIdleDb): Promise<AgentProfileRow[]> {
	const rows = await exec
		.select({
			id: users.id,
			name: users.name,
			role: users.role,
			agentCategory: users.agentCategory,
			systemPrompt: users.systemPrompt,
			harnessType: users.harnessType,
			modelTierPreference: users.modelTierPreference,
			modelId: users.modelId,
			modelProvider: users.modelProvider,
			maxConcurrentSessions: users.maxConcurrentSessions,
			status: users.status,
		})
		.from(users)
		.where(and(eq(users.kind, "ai"), ne(users.role, "system"), ne(users.status, "retired")));
	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		role: r.role,
		agentCategory: r.agentCategory ?? null,
		systemPrompt: r.systemPrompt ?? null,
		harnessType: r.harnessType ?? null,
		modelTierPreference: r.modelTierPreference ?? null,
		modelId: r.modelId ?? null,
		modelProvider: r.modelProvider ?? null,
		maxConcurrentSessions: r.maxConcurrentSessions,
		status: r.status,
	}));
}

/** One org-directory row — EXACTLY the columns `routes/org.ts` GET `/` returns today. */
export interface OrgDirectoryRow {
	readonly id: string;
	readonly kind: string;
	readonly name: string;
	readonly role: string;
}

/** Projected directory of every user (id/kind/name/role) for the org graph response. */
export async function listUserDirectory(exec: HyperIdleDb): Promise<OrgDirectoryRow[]> {
	return exec
		.select({ id: users.id, kind: users.kind, name: users.name, role: users.role })
		.from(users);
}
