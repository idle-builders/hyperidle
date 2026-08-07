import { taskPlanningSignals, type WriteExecutor } from "@hyperidle/db";
import { eq } from "drizzle-orm";

/**
 * `work` owns `task_planning_signals` (@lore O2: `riskTier` moved off `tasks`,
 * which `work` owns, into its own extension table — same domain, same owner).
 *
 * @lore AU19 Increment 1k: this is `work`'s only accessor for the table today
 * — there is no production writer anywhere in the repo yet (only test/seed
 * fixtures insert rows directly via raw SQL). `review`'s
 * `session-review-creator.ts` reads a task's risk tier through the
 * `TaskRiskTierReader` DI port (Mechanism C), wired at the composition root
 * (`server-factory.ts`) to this real exported function — `review` never
 * imports `taskPlanningSignals` directly.
 */
export async function getTaskRiskTierByTaskId(
	exec: WriteExecutor,
	taskId: string,
): Promise<string | null> {
	const [row] = await exec
		.select({ riskTier: taskPlanningSignals.riskTier })
		.from(taskPlanningSignals)
		.where(eq(taskPlanningSignals.taskId, taskId))
		.limit(1);
	return row?.riskTier ?? null;
}
