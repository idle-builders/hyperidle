/**
 * Key persistence for the agents' runner.
 * The agent_runner_keys table is owned by this service — read and write go through here.
 */

import { agentRunnerKeys, type RunnerDb } from "@hyperidle/runner-db";
import { eq } from "drizzle-orm";

export interface AgentRunnerKeyRow {
	readonly agentId: string;
	readonly agentKey: string;
	readonly movedAway: boolean;
}

/** Upsert a taken key; clears moved-away on reclaim. */
export async function persistAgentRunnerKey(
	db: RunnerDb,
	agentId: string,
	agentKey: string,
): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(agentRunnerKeys)
		.values({ agentId, agentKey, movedAway: 0, createdAt: now, updatedAt: now })
		.onConflictDoUpdate({
			target: agentRunnerKeys.agentId,
			set: { agentKey, movedAway: 0, updatedAt: now },
		});
}

/** Mark a key as moved away (401 from server). The agent will not be re-taken until an explicit reclaim. */
export async function markAgentRunnerKeyMovedAway(db: RunnerDb, agentId: string): Promise<void> {
	const now = new Date().toISOString();
	await db
		.update(agentRunnerKeys)
		.set({ movedAway: 1, updatedAt: now })
		.where(eq(agentRunnerKeys.agentId, agentId));
}

/** Load all keys that are still held (not moved away). */
export async function loadHeldAgentRunnerKeys(db: RunnerDb): Promise<AgentRunnerKeyRow[]> {
	const rows = await db.select().from(agentRunnerKeys).where(eq(agentRunnerKeys.movedAway, 0));
	return rows.map((r) => ({ agentId: r.agentId, agentKey: r.agentKey, movedAway: false }));
}

/** Load all agent ids that are marked moved-away. */
export async function loadMovedAwayAgentIds(db: RunnerDb): Promise<string[]> {
	const rows = await db.select().from(agentRunnerKeys).where(eq(agentRunnerKeys.movedAway, 1));
	return rows.map((r) => r.agentId);
}
