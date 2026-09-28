import { createLogger } from "@hyperidle/diagnostics";
import type { ActionResult, EditTaskInput, TaskView } from "@hyperidle/domain-model";
import type { ActionContext } from "./action-types.js";
import { get, list } from "./task-service.js";

const logger = createLogger({ pkg: "task.dependency-watcher" });

/** The shape `edit_task`'s own bound `run` function has — injected so this module never imports `task-actions.ts` (that file is what calls INTO this one). */
type EditTask = (ctx: ActionContext, input: EditTaskInput) => Promise<ActionResult<TaskView>>;

/**
 * After a task completes, check all tasks that depend on it.
 * If all dependencies are now done and the dependent is in `hold`, auto-transition to `accepted`.
 *
 * @lore: SQL pre-filters on hold-state rows by JSON-quoted completedTaskId — quoting prevents prefix collisions ("dep-1" must not match "dep-12")
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
 * After a task is killed, drop the killed id from every dependent.
 * `hold` dependents reset to `proposed` — their premise is gone, so they are not freed to start.
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
