// @lore: first-boot writes only the system actor (role="system", invisible to `search_users`) — must exist before any write; idempotent, called every launch

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
