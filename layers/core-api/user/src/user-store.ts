/**
 * User store — the single owner of `users` row reads and writes (AU12).
 * Every caller that creates, modifies, or queries a user record routes
 * through here instead of touching the Drizzle table directly.
 *
 * @lore Executor param is plain `HyperIdleDb` (no union, no derived generic).
 * The drizzle transaction handle is structurally compatible (same
 * `insert`/`update`/`select` methods), so a caller inside `db.transaction`
 * passes its `tx as HyperIdleDb` — the accepted transaction-composition cast
 * used repo-wide (see `conversation-store.ts`'s own top `@lore`) and avoids
 * depending on drizzle's internal transaction type.
 *
 * @lore `updateUser`'s patch admits `SQL` per column (not just literal
 * `NewUser` values) for any future atomic-increment-style patch that needs
 * a SQL expression to stay race-free. (AU21 Increment 14a: the cost-metering
 * use case this originally existed for — `costActual = coalesce(costActual,
 * 0) + delta` — is deleted along with the rest of the cost feature; the
 * generic `SQL`-admitting patch type is kept as reusable infrastructure.)
 *
 * @lore AU20 Am11: 14 bespoke per-intent read variants collapsed into two
 * parameterised functions (`findUser` / `listUsers`) plus one `UserFilter`
 * type. `buildWhere` compiles the filter into a single `and(...)` WHERE so
 * every new predicate combination is a `UserFilter` literal at the call site,
 * not a new function. The two projected getters (`listAgentProfiles` /
 * `listUserDirectory`) and their associated row types (`AgentProfileRow` /
 * `OrgDirectoryRow`) are deleted — the two route call sites project full rows
 * themselves, as every other route already does.
 */

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
 *
 * Replaces: `getUserById` (`{id}`), `getUserByIdScopedToTeam` (`{id, teamIds:[id]}`),
 * `getFirstUserByKind` (`{kind}`), `findActiveTeammateByRole`
 * (`{role, teamIds, status:'active', excludeId}`).
 */
export async function findUser(exec: HyperIdleDb, filter: UserFilter): Promise<User | undefined> {
	const [row] = await exec.select().from(users).where(buildWhere(filter)).limit(1);
	return row;
}

/**
 * Return all users matching `filter` (no LIMIT).
 * Pass no filter (or `{}`) to list every user row.
 *
 * Replaces: `getUsersByIds` (`{ids}`), `listAllUsers` (`{}`),
 * `listUsersByKind` (`{kind}`), `listUsersByTeam` (`{teamIds:[id]}`),
 * `listUsersByTeams` (`{teamIds}`), `listUsersByTeamAndKind` (`{teamIds:[id], kind}`),
 * `listActiveAiUsersByTeams` (`{kind:'ai', status:'active', teamIds, orderById:true}`),
 * `searchUsersByName` (`{nameContains:q}`),
 * plus the former projected getters whose call sites now project inline.
 */
export async function listUsers(exec: HyperIdleDb, filter: UserFilter = {}): Promise<User[]> {
	// Fast-path: an empty ids/teamIds array can never match any row.
	if (filter.ids !== undefined && filter.ids.length === 0) return [];
	if (filter.teamIds !== undefined && filter.teamIds.length === 0) return [];

	const q = exec.select().from(users).where(buildWhere(filter));
	if (filter.orderById) return q.orderBy(users.id);
	return q;
}

// ===========================================================================
// Writes
// ===========================================================================

/**
 * @lore AU26 review W10: `WriteExecutor`, not `HyperIdleDb` — an agent's
 * identity row and its `agent_run_config` row are two writes since the G1
 * column move, and `POST /api/agents` wraps them in one `db.transaction` so a
 * failure between them cannot leave an agent silently running the all-null
 * default config. That needs this to accept the transaction handle.
 */
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

// @lore AU21 Increment 14a: cost metering (`resetAllUserCost`/
// `incrementUserCost`/`sumAllUserCost`, the `users.costActual` accumulator)
// is deleted along with the rest of the cost feature — the column is
// dropped, no replacement.
