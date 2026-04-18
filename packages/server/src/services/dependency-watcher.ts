import { type HyperIdleDb, tasks } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { and, eq, like, sql } from "drizzle-orm";
import { transitionTask } from "./task-state-machine.js";

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
 * IDs are crypto.randomUUID strings (no `%` or `_` literals), so no LIKE
 * escape is needed; if that ever changes, escape via the existing
 * `like-escape.ts` helper.
 */
export function checkAndUnblockDependents(
	db: HyperIdleDb,
	eventBus: EventBus,
	completedTaskId: string,
): void {
	// SQL pre-filter: hold-state tasks whose dependencies include the literal
	// quoted completedTaskId. The LIKE pattern wraps the id in JSON quotes
	// so substrings of unrelated IDs ("dep-1" vs "dep-12") don't match.
	const candidates = db
		.select()
		.from(tasks)
		.where(
			and(
				eq(tasks.state, "hold"),
				like(tasks.dependencies, sql`${`%"${completedTaskId}"%`}`),
			),
		)
		.all();

	for (const task of candidates) {
		if (!task.dependencies) continue;

		// Defence-in-depth: a row could conceivably store malformed JSON.
		// Skip rather than throw — a malformed dependencies blob is a data
		// problem, not a runtime fault for the watcher.
		let deps: string[];
		try {
			const parsed = JSON.parse(task.dependencies);
			if (!Array.isArray(parsed)) continue;
			deps = parsed.filter((v): v is string => typeof v === "string");
		} catch {
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
