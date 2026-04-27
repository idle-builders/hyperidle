import { type HyperIdleDb, tasks } from "@hyperidle/db";
import { createLogger, type EventBus } from "@hyperidle/shared";
import { and, eq, sql } from "drizzle-orm";
import { escapeLikePattern } from "./like-escape.js";
import { readFactoryState } from "./recovery-service.js";
import { transitionTask } from "./task-state-machine.js";

const logger = createLogger({ pkg: "server.dependency-watcher" });

/**
 * After a task completes, check all tasks that depend on it.
 * If all of a dependent task's dependencies are now done and it is in `hold`,
 * auto-transition it to `accepted` and emit a notification.
 *
 * @lore I3 (TRACK-I.md L137-139): the previous implementation loaded every
 * row in `tasks` and ran JSON.parse on each. Replaced with a SQL pre-filter:
 * only consider hold-state rows whose `dependencies` text column contains
 * the JSON-quoted completedTaskId. The quoting is critical to prevent
 * prefix collisions ('"dep-1"' must NOT match the substring of '"dep-12"').
 *
 * @lore I3 review W3 / sec MEDIUM-2: even though IDs are crypto.randomUUID
 * today, escapeLikePattern() is applied unconditionally so a future caller
 * passing an ID containing `%` or `_` literals doesn't accidentally widen
 * the LIKE match (single `_` matches any char; `%` matches any sequence).
 * The `ESCAPE '\'` clause makes our backslash escape effective.
 */
export function checkAndUnblockDependents(
	db: HyperIdleDb,
	eventBus: EventBus,
	completedTaskId: string,
): void {
	// @lore L7 (ADV2): when the factory is paused (kill switch active),
	// the watcher MUST NOT auto-transition any hold task to accepted.
	// The kill cascade flips queued (`accepted`) tasks to `hold` to block
	// them. Without this guard, a dependency completing during a pause
	// promotes those tasks back to `accepted` — defeating the kill
	// switch. On factory resume, `resumeFactory` restores the kill-
	// flipped tasks; subsequent dependency completions will then run
	// the watcher normally.
	const factory = readFactoryState(db);
	if (factory.paused) {
		logger.info("dependency-watcher: skipping hold→accepted transitions (factory paused)", {
			completedTaskId,
			pausedBy: factory.pausedBy,
		});
		return;
	}

	// SQL pre-filter: hold-state tasks whose dependencies include the literal
	// quoted completedTaskId. The LIKE pattern wraps the id in JSON quotes
	// so substrings of unrelated IDs ("dep-1" vs "dep-12") don't match.
	const escapedId = escapeLikePattern(completedTaskId);
	const pattern = `%"${escapedId}"%`;
	const candidates = db
		.select()
		.from(tasks)
		.where(and(eq(tasks.state, "hold"), sql`${tasks.dependencies} LIKE ${pattern} ESCAPE '\\'`))
		.all();

	for (const task of candidates) {
		if (!task.dependencies) continue;

		// Defence-in-depth: a row could conceivably store malformed JSON.
		// Log via observability and skip rather than throw — a malformed
		// dependencies blob is a data problem, not a runtime fault for the
		// watcher (I3 review O8).
		let deps: string[];
		try {
			const parsed = JSON.parse(task.dependencies);
			if (!Array.isArray(parsed)) {
				logger.warn("dependency-watcher: dependencies is not a JSON array", {
					taskId: task.id,
					value: task.dependencies,
				});
				continue;
			}
			deps = parsed.filter((v): v is string => typeof v === "string");
		} catch (err) {
			logger.warn("dependency-watcher: failed to parse dependencies JSON", {
				taskId: task.id,
				error: err instanceof Error ? err.message : String(err),
			});
			continue;
		}

		// Sanity: the LIKE proves the JSON-quoted ID appears as text. The
		// runtime check still guards against false positives across array
		// boundaries (shouldn't happen, but cheap).
		if (!deps.includes(completedTaskId)) continue;

		// Check if ALL dependencies are done.
		const allDone = deps.every((depId) => {
			const dep = db.select().from(tasks).where(eq(tasks.id, depId)).get();
			return dep?.state === "done";
		});

		if (!allDone) continue;

		// Auto-transition hold -> accepted
		transitionTask(db, eventBus, task.id, "accepted");

		// Emit notification
		eventBus.emit({
			type: "notification",
			streamId: task.id,
			targetId: task.id,
			message: `Task ${task.id} auto-transitioned to accepted: all dependencies are done`,
			timestamp: Date.now(),
		});
	}
}
