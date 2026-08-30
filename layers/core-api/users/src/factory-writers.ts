/**
 * AU29 §2.5.2 — owner writers the core-api first-boot face needs.
 *
 * `insertUser` (user-store.ts) is a plain insert and throws on a relaunch —
 * factory bootstrap must be idempotent, so it needs the `onConflictDoNothing`
 * shape instead. `setAgentCategoryForRole` and `listFactoryAgents` are the
 * owner-side primitives the face's category backfill and roster-resolution
 * steps route through, so `framework/db`'s writes (deleted this task) never
 * need to come back.
 */

import { type HyperIdleDb, type NewUser, users, type WriteExecutor } from "@hyperidle/db";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Insert a user row, doing nothing if a row with the same id already exists.
 * Idempotent counterpart to `insertUser` — factory bootstrap runs on every
 * launch and must not throw on an existing row.
 */
export async function insertUserIfAbsent(exec: WriteExecutor, values: NewUser): Promise<void> {
	await exec.insert(users).values(values).onConflictDoNothing();
}

/**
 * Resolve the roster agents' `{id, role}` by id. Returning the queried rows
 * (not the roster constant) preserves the upgrade-path semantics: an
 * existing row's actual role decides which template it gets.
 */
export async function listFactoryAgents(
	db: HyperIdleDb,
	ids: readonly string[],
): Promise<ReadonlyArray<{ readonly id: string; readonly role: string }>> {
	if (ids.length === 0) return [];
	return db
		.select({ id: users.id, role: users.role })
		.from(users)
		.where(and(eq(users.kind, "ai"), inArray(users.id, [...ids])));
}

/**
 * Set the `status` field on the named agent rows.
 *
 * Users/agents are never hard-deleted — many tables have ON DELETE RESTRICT FKs
 * on users.id (items.sourceAgentId, routines.ownerAgentId, etc.).
 * Status='inactive' is the safe tombstone.
 *
 * @lore BA9d: the route cannot write the `users` table directly (governance
 * boundary) — it calls this function instead.
 *
 * @lore BA9g: it took a `pluginId` and filtered on `users.plugin_id`. That
 * column was the plugin service's provenance living in a table it does not own,
 * which is exactly why this write had to be here in the first place. The plugin
 * service now names the rows and this function writes them, so the boundary is
 * the same and the ownership is honest.
 */
export async function setAgentsStatus(
	exec: WriteExecutor,
	agentIds: readonly string[],
	status: "active" | "inactive",
): Promise<void> {
	if (agentIds.length === 0) return;
	await exec
		.update(users)
		.set({ status })
		.where(inArray(users.id, [...agentIds]));
}
