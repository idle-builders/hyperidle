/**
 * Owner writers for callers outside the user module: the first-boot face's
 * system actor and the plugin service's agents (inserted at install, their
 * status flipped on disable/enable).
 *
 * `insertUser` (user-store.ts) is a plain insert and throws on a relaunch or
 * a reinstall — these callers must be idempotent, so they need the
 * `onConflictDoNothing` shape instead.
 */

import { type NewUser, users, type WriteExecutor } from "@hyperidle/db";
import { inArray } from "drizzle-orm";

/**
 * Insert a user row, doing nothing if a row with the same id already exists.
 * Idempotent counterpart to `insertUser` — factory bootstrap runs on every
 * launch and must not throw on an existing row.
 */
export async function insertUserIfAbsent(exec: WriteExecutor, values: NewUser): Promise<void> {
	await exec.insert(users).values(values).onConflictDoNothing();
}

/**
 * Set the `status` field on the named agent rows.
 *
 * Users/agents are never hard-deleted — many tables have ON DELETE RESTRICT FKs
 * on users.id (tasks.ownerAgentId, sessions.agentId, etc.).
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
