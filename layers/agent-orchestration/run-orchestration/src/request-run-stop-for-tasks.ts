// @lore: requestRunStopForTasks — return value is the ACTUAL stopped runs, not a count; 0-row CAS (already-stopped) is not in the result

import type { HyperIdleDb } from "@hyperidle/db";
import { sessions } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import { and, eq, inArray } from "drizzle-orm";
import { stopSessionRun } from "./session-store.js";

export interface StoppedRun {
	readonly taskId: string;
	readonly sessionId: string;
}

/**
 * `db`, not `WriteExecutor` — `stopSessionRun` reads and CAS-writes the same
 * row per session (never inside a shared transaction, PGlite has one
 * connection), matching every other `session-store.ts` accessor.
 */
export async function requestRunStopForTasks(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskIds: readonly string[],
	abort: (sessionId: string) => Promise<boolean>,
): Promise<readonly StoppedRun[]> {
	if (taskIds.length === 0) return [];

	const active = await db
		.select({ id: sessions.id, taskId: sessions.taskId })
		.from(sessions)
		.where(and(inArray(sessions.taskId, [...taskIds]), eq(sessions.state, "active")));

	const stopped: StoppedRun[] = [];
	for (const run of active) {
		// `sessions.taskId` is nullable, but the predicate above already
		// constrained it to the caller's list.
		if (run.taskId === null) continue;
		const result = await stopSessionRun(db, eventBus, run.id, abort);
		if (result === "already_ended") continue;
		stopped.push({ taskId: run.taskId, sessionId: run.id });
	}
	return stopped;
}
