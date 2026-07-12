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
import { eq, type SQL } from "drizzle-orm";

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
