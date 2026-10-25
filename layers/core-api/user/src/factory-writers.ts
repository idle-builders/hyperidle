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
import { setUserTeams } from "./user-store.js";

/**
 * Insert a user row in `teamId`'s team (or no team, for the system actor and
 * a factory-wide plugin agent), doing nothing if a row with the same id
 * already exists — its teams included, so a reinstall never undoes a move to
 * another team. Idempotent counterpart to `insertUser` — factory bootstrap
 * runs on every launch and must not throw on an existing row.
 */
export async function insertUserIfAbsent(
	exec: WriteExecutor,
	values: NewUser,
	teamId: string | null = null,
): Promise<void> {
	const inserted = await exec
		.insert(users)
		.values(values)
		.onConflictDoNothing()
		.returning({ id: users.id });
	if (inserted.length > 0 && teamId !== null) await setUserTeams(exec, values.id, [teamId]);
}

/**
 * Set the `status` field on the named agent rows.
 *
 * Users/agents are never hard-deleted — many tables have ON DELETE RESTRICT FKs
 * on users.id (tasks.ownerAgentId, sessions.agentId, etc.).
 * Status='inactive' is the safe tombstone.
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
