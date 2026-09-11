import type { WriteExecutor } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { EventBus } from "@hyperidle/event-bus";
import { type TaskStateMachineDeps, transitionTask } from "./task-state-machine.js";
import { get, list, update } from "./work-service.js";

const logger = createLogger({ pkg: "work.dependency-watcher" });

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
 *
 * @lore AU20 Ag2: relocated from `@hyperidle/filesystems` → `@hyperidle/work`.
 * The function exclusively calls work's own table read/write path
 * (`listHoldTasksWithDependencyPattern`/`getTaskById`/`transitionTask`), so
 * its correct home is the `work` Service. The old `{ work: FilesystemsWorkStore }`
 * DI-port sub-object is gone — the function calls those internals directly.
 * Only the against-grain `session-requests` recorder (`workIntents`) remains
 * injected (same port `transitionTask` itself already accepts).
 */
export async function checkAndUnblockDependents(
	db: WriteExecutor,
	eventBus: EventBus,
	completedTaskId: string,
	deps: TaskStateMachineDeps,
): Promise<void> {
	// SQL pre-filter: hold-state tasks whose dependencies include the literal
	// quoted completedTaskId. The LIKE pattern wraps the id in JSON quotes
	// so substrings of unrelated IDs ("dep-1" vs "dep-12") don't match.
	const candidates = await list(db, "task", { dependencyId: completedTaskId, state: "hold" });

	for (const task of candidates) {
		if (!task.dependencies) continue;

		// Defence-in-depth: a row could conceivably store malformed JSON.
		// Log via observability and skip rather than throw — a malformed
		// dependencies blob is a data problem, not a runtime fault for the
		// watcher (I3 review O8).
		let deplist: string[];
		try {
			const parsed = JSON.parse(task.dependencies);
			if (!Array.isArray(parsed)) {
				logger.warn("dependency-watcher: dependencies is not a JSON array", {
					taskId: task.id,
					value: task.dependencies,
				});
				continue;
			}
			deplist = parsed.filter((v): v is string => typeof v === "string");
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
		if (!deplist.includes(completedTaskId)) continue;

		// Check if ALL dependencies are done.
		let allDone = true;
		for (const depId of deplist) {
			const dep = await get(db, "task", depId);
			if (dep?.state !== "done") {
				allDone = false;
				break;
			}
		}

		if (!allDone) continue;

		// Auto-transition hold -> accepted
		await transitionTask(db, eventBus, task.id, "accepted", deps, "accepted");

		// Emit ambient event — NOT a notification (concept hard rule #6: auto-unblock is ambient)
		// AF8: kind="auto_unblock" → the notification listener filters this out entirely
		eventBus.emit({
			type: "notification",
			streamId: task.id,
			targetId: task.id,
			kind: "auto_unblock",
			message: `Task ${task.id} auto-transitioned to accepted: all dependencies are done`,
			timestamp: Date.now(),
		});
	}
}

/**
 * After a task is killed, the killed id is dropped from every dependent
 * that carries it, WHATEVER state that dependent is in — left in place it is
 * a prerequisite that can never be satisfied, which parks the task forever
 * the next time it is accepted. Separately, only the dependents that were
 * actually WAITING on it (`hold`) are reset to `proposed` for re-planning —
 * the premise they were planned under is gone, so they are not freed to
 * start the way a finished dependency frees them. A dependent in any other
 * state (still `proposed`, already `accepted`, or already `in_progress`) just
 * loses the stale id; it is not rewound.
 *
 * Queries with NO state filter — the id must be found and cleaned up
 * regardless of the dependent's current state, unlike
 * `checkAndUnblockDependents`'s `hold`-only query. See `work-service.ts`'s
 * `dependencyId` filter for why `state` had to become optional there.
 */
export async function handleDependencyKilled(
	db: WriteExecutor,
	eventBus: EventBus,
	killedTaskId: string,
	deps: TaskStateMachineDeps,
): Promise<void> {
	const candidates = await list(db, "task", { dependencyId: killedTaskId });

	for (const task of candidates) {
		if (!task.dependencies) continue;

		let deplist: string[];
		try {
			const parsed = JSON.parse(task.dependencies);
			if (!Array.isArray(parsed)) {
				logger.warn("dependency-watcher: dependencies is not a JSON array", {
					taskId: task.id,
					value: task.dependencies,
				});
				continue;
			}
			deplist = parsed.filter((v): v is string => typeof v === "string");
		} catch (err) {
			logger.warn("dependency-watcher: failed to parse dependencies JSON", {
				taskId: task.id,
				error: err instanceof Error ? err.message : String(err),
			});
			continue;
		}

		if (!deplist.includes(killedTaskId)) continue;

		const remaining = deplist.filter((id) => id !== killedTaskId);

		// Drop the stale id regardless of state.
		await update(db, "task", task.id, {
			dependencies: remaining.length > 0 ? JSON.stringify(remaining) : null,
		});

		// Only a dependent actually WAITING on it is reset — not one already
		// past the wait (`in_progress`, etc.) and not one that never entered
		// it (still `proposed`).
		if (task.state !== "hold") continue;

		await transitionTask(db, eventBus, task.id, "proposed", deps);

		eventBus.emit({
			type: "notification",
			streamId: task.id,
			targetId: task.id,
			kind: "auto_unblock",
			message: `Task ${task.id} returned to proposed: dependency ${killedTaskId} was killed`,
			timestamp: Date.now(),
		});
	}
}
