/**
 * Shared test helpers for G1 facilitator tool suites. Each tool test only
 * seeds the rows it needs beyond the common base; the base helpers stay
 * deliberately minimal so assertions remain local to their test file.
 */

import * as os from "node:os";
import * as path from "node:path";
// @lore U1: `products` renamed to `teams`; old `teams` (membership) renamed to `teamMembers`.
import { type HyperIdleDb, teamMembers, teams, threads, users } from "@hyperidle/db";
import { EventBus, type ToolContext } from "@hyperidle/shared";

export const NOW = "2026-04-18T00:00:00.000Z";

export interface MakeContextOverrides {
	readonly agentId?: string;
	readonly label?: string;
}

/**
 * Build a ToolContext whose sandboxPath points at a unique tmp dir so
 * parallel suites never clash. The watcher is a no-op — none of the G1
 * tools use it.
 */
export function makeContext(
	db: HyperIdleDb,
	overrides: MakeContextOverrides = {},
): ToolContext<HyperIdleDb> {
	const label = overrides.label ?? "g1";
	return {
		db,
		eventBus: new EventBus(),
		agentId: overrides.agentId ?? "agent-fac",
		sessionId: "session-1",
		taskId: "task-1",
		sandboxPath: path.join(os.tmpdir(), `hi-${label}-${Date.now()}`),
		ingestion: {
			dispose: (): void => {
				/* no-op */
			},
		},
	};
}

/**
 * Seed the minimum domain needed by every G1 facilitator tool suite:
 * product, team, an active facilitator agent, and an item thread.
 */
export async function seedBase(db: HyperIdleDb): Promise<void> {
	// @lore U1: teams is the domain entity (formerly products); teamMembers is the membership group.
	await db.insert(teams).values({ id: "p1", name: "Test", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });

	// @lore AD8c: role renamed from practice_facilitator to facilitator
	await db.insert(users).values({
		id: "agent-fac",
		name: "Facilitator",
		role: "facilitator",
		status: "active",
		maxConcurrentSessions: 1,
		createdAt: NOW,
	});

	await db.insert(threads).values({
		id: "th1",
		hostKind: "task",
		hostId: "task-1",
		initiatorId: "agent-fac",
		participants: JSON.stringify(["agent-fac"]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});
}
