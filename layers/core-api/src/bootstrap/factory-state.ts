/**
 * The core-api first-boot face: writes the hidden system actor and nothing
 * else. Idempotent — the desktop app calls it on every launch.
 *
 * @lore The install ships empty: the person's own assistant arrives from the
 * welcome screen, every other agent from a plugin or from the person. The
 * one row boot still writes is not an agent — it is the actor system writes
 * are attributed to (`changes.actor`, `messages.senderId` and friends
 * reference `users.id`), so it must exist before the first system write.
 * Role "system" is its structural marker: it cannot be retired and
 * `search_users` leaves it out unless a caller names it.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { insertUserIfAbsent } from "@hyperidle/user";

/** Write the hidden system actor if it is not there yet. */
export async function applyFactoryCoreState(db: HyperIdleDb): Promise<void> {
	await insertUserIfAbsent(db, {
		id: "system:propagation",
		kind: "ai",
		name: "Propagation System",
		role: "system",
		agentCategory: null,
		status: "active",
		createdAt: new Date().toISOString(),
	});
}
