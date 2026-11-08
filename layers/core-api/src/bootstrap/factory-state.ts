// @lore: first-boot writes the global team and system actor — global team must exist before any user is created so user teams are non-global; idempotent

import type { HyperIdleDb } from "@hyperidle/db";
import { SYSTEM_ACTOR_ID, SYSTEM_ACTOR_NAME } from "@hyperidle/domain-model";
import { createTeam, getGlobalTeam, insertUserIfAbsent } from "@hyperidle/user";

export const GLOBAL_TEAM_ID = "team-global";
export const GLOBAL_TEAM_NAME = "Everyone";

/** Write the global team and the hidden system actor if they are not there yet. */
export async function applyFactoryCoreState(db: HyperIdleDb): Promise<void> {
	const existing = await getGlobalTeam(db);
	if (!existing) {
		await createTeam(db, {
			id: GLOBAL_TEAM_ID,
			name: GLOBAL_TEAM_NAME,
			createdAt: new Date().toISOString(),
		});
	}
	await insertUserIfAbsent(db, {
		id: SYSTEM_ACTOR_ID,
		kind: "ai",
		name: SYSTEM_ACTOR_NAME,
		role: "system",
		agentCategory: null,
		status: "active",
		createdAt: new Date().toISOString(),
	});
}
