import { createLogger } from "@hyperidle/diagnostics";
import type { ActionResult, EditTaskInput, TaskView } from "@hyperidle/domain-model";
import type { ActionContext } from "./action-types.js";
import { get, list } from "./task-service.js";

const logger = createLogger({ pkg: "task.dependency-watcher" });

/** The shape `edit_task`'s own bound `run` function has — injected so this
 * module never imports `task-actions.ts` (that file is what calls INTO this
 * one, per the architecture doc §6 row 3). */
type EditTask = (ctx: ActionContext, input: EditTaskInput) => Promise<ActionResult<TaskView>>;

/**
 * After a task completes, check all tasks that depend on it.
 * If all of a dependent task's dependencies are now done and it is in `hold`,
 * auto-transition it to `accepted`.
 *
 * §6 row 2: this stays an ambient `task.changed` subscription (`app.ts`),
 * but writes through `edit_task` instead of `transitionTask` — `edit_task`
 * returns problems instead of throwing, so a refused accept is logged and
 * dropped rather than propagated. The auto-transition's own `edit_task`
 * call already appends a `changes` row and emits `task.changed` for it
 * (decision 5) — no separate ambient notification of
 * the same edit rides the bus anymore.
 *
 * @lore I3 (TRACK-I.md L137-139): the previous implementation loaded every
 * row in `tasks` and ran JSON.parse on each. Replaced with a SQL pre-filter:
 * only consider hold-state rows whose `dependencies` text column contains
 * the JSON-quoted completedTaskId. The quoting is critical to prevent
 * prefix collisions ('"dep-1"' must NOT match the substring of '"dep-12"').
 */
export async function checkAndUnblockDependents(
	ctx: ActionContext,
	completedTaskId: string,
	editTask: EditTask,
): Promise<void> {
	const candidates = await list(ctx.db, "task", { dependencyId: completedTaskId, state: "hold" });

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

		if (!deplist.includes(completedTaskId)) continue;

		let allDone = true;
		for (const depId of deplist) {
			const dep = await get(ctx.db, "task", depId);
			if (dep?.state !== "done") {
				allDone = false;
				break;
			}
		}
		if (!allDone) continue;

		const result = await editTask(ctx, { id: task.id, state: "accepted" });
		if (!result.ok) {
			logger.warn("dependency-watcher: auto-accept refused", {
				taskId: task.id,
				problems: result.problems,
			});
		}
	}
}

/**
 * After a task is killed, the killed id is dropped from every dependent
 * that carries it, WHATEVER state that dependent is in — left in place it is
 * a prerequisite that can never be satisfied, which parks the task forever
 * the next time it is accepted. Separately, only the dependents that were
 * actually WAITING on it (`hold`) are reset to `proposed` for re-planning —
 * the premise they were planned under is gone, so they are not freed to
 * start the way a finished dependency frees them.
 *
 * §5 step 5e / §6 row 3: called by `edit_task` after ITS OWN commit, once
 * per killed id — never nested inside the kill's transaction. Each dependent
 * gets its own `edit_task.run` call, its own transaction, its own `changes`
 * row, actor `system:propagation`.
 */
export async function handleDependencyKilled(
	ctx: ActionContext,
	killedTaskId: string,
	editTask: EditTask,
): Promise<void> {
	const candidates = await list(ctx.db, "task", { dependencyId: killedTaskId });

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
		const result = await editTask(ctx, {
			id: task.id,
			dependencies: remaining.length > 0 ? remaining : null,
			...(task.state === "hold" ? { state: "proposed" as const } : {}),
		});
		if (!result.ok) {
			logger.warn("dependency-watcher: dependency-killed cleanup refused", {
				taskId: task.id,
				problems: result.problems,
			});
		}
	}
}
