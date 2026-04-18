import { type HyperIdleDb, tasks } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { transitionTask } from "./task-state-machine.js";

/**
 * After a task completes, check all tasks that depend on it.
 * If all of a dependent task's dependencies are now done and it is in `hold`,
 * auto-transition it to `accepted` and emit a notification.
 */
export function checkAndUnblockDependents(
	db: HyperIdleDb,
	eventBus: EventBus,
	completedTaskId: string,
): void {
	// Find all tasks that have dependencies (non-null)
	const allTasks = db.select().from(tasks).all();

	for (const task of allTasks) {
		if (!task.dependencies) continue;

		const deps: string[] = JSON.parse(task.dependencies);
		if (!deps.includes(completedTaskId)) continue;

		// Only auto-transition tasks in hold state
		if (task.state !== "hold") continue;

		// Check if ALL dependencies are done
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
