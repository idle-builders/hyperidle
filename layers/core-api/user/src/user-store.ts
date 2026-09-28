// @lore: updateUser patch — admits SQL per column for atomic patches; SQL expressions stay race-free under concurrent writes

import {
	type HyperIdleDb,
	type NewUser,
	type User,
	users,
	type WriteExecutor,
} from "@hyperidle/db";
import { and, eq, inArray, ne, type SQL, sql } from "drizzle-orm";

/** Per-column patch that also admits SQL expressions (e.g. cost coalesce). */
type UserPatch = Partial<{ [K in keyof NewUser]: NewUser[K] | SQL }>;

// ===========================================================================
// Filter type + WHERE builder
// ===========================================================================

/**
 * Composable filter for `findUser` / `listUsers`.
 * Every field is additive (AND-combined). Omit a field to leave that column
 * unconstrained.
 *
 * - `id` — exact match on `users.id` (LIMIT 1 enforced by `findUser`)
 * - `ids` — `users.id IN (...)` — ignored when the array is empty (returns [])
 * - `kind` — exact match on `users.kind`
 * - `teamIds` — `users.teamId IN (...)` — ignored when the array is empty
 * - `role` — exact match on `users.role`
 * - `status` — exact match on `users.status`
 * - `nameContains` — case-insensitive substring match on `users.name`
 * - `excludeId` — `users.id != excludeId`
 * - `ownerUserId` — exact match on `users.ownerUserId`
 * - `orderById` — ORDER BY users.id ASC (`listUsers` only)
 */
export interface UserFilter {
	readonly id?: string;
	readonly ids?: string[];
	readonly kind?: string;
	readonly teamIds?: string[];
	readonly role?: string;
	readonly status?: string;
	readonly nameContains?: string;
	readonly excludeId?: string;
	readonly ownerUserId?: string;
	readonly orderById?: boolean;
}

function buildWhere(filter: UserFilter): SQL | undefined {
	const preds: SQL[] = [];
	if (filter.id !== undefined) preds.push(eq(users.id, filter.id));
	if (filter.ids !== undefined && filter.ids.length > 0) preds.push(inArray(users.id, filter.ids));
	if (filter.kind !== undefined) preds.push(eq(users.kind, filter.kind));
	if (filter.teamIds !== undefined && filter.teamIds.length > 0)
		preds.push(inArray(users.teamId, filter.teamIds));
	if (filter.role !== undefined) preds.push(eq(users.role, filter.role));
	if (filter.status !== undefined) preds.push(eq(users.status, filter.status));
	if (filter.ownerUserId !== undefined) preds.push(eq(users.ownerUserId, filter.ownerUserId));
	if (filter.nameContains !== undefined) {
		const pattern = `%${filter.nameContains.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
		preds.push(sql`LOWER(${users.name}) LIKE ${pattern} ESCAPE '\\'`);
	}
	if (filter.excludeId !== undefined) preds.push(ne(users.id, filter.excludeId));
	return preds.length === 0
		? undefined
		: preds.length === 1
			? preds[0]
			: and(...(preds as [SQL, ...SQL[]]));
}

// ===========================================================================
// General read interface (subsumes all 14 former per-intent variants)
// ===========================================================================

/**
 * Return the first user matching `filter` (LIMIT 1), or `undefined`.

 */
export async function findUser(exec: HyperIdleDb, filter: UserFilter): Promise<User | undefined> {
	const [row] = await exec.select().from(users).where(buildWhere(filter)).limit(1);
	return row;
}

/**
 * Return all users matching `filter` (no LIMIT).
 * Pass no filter (or `{}`) to list every user row.

 */
export function listUsers(exec: HyperIdleDb, filter: UserFilter = {}): Promise<User[]> {
	// Fast-path: an empty ids/teamIds array can never match any row.
	if (filter.ids !== undefined && filter.ids.length === 0) return Promise.resolve([]);
	if (filter.teamIds !== undefined && filter.teamIds.length === 0) return Promise.resolve([]);

	const q = exec.select().from(users).where(buildWhere(filter));
	if (filter.orderById) return q.orderBy(users.id);
	return q;
}

// ===========================================================================
// Writes
// ===========================================================================

export async function insertUser(exec: WriteExecutor, values: NewUser): Promise<void> {
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
