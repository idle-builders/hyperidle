/**
 * AD8b Task 6 — update_task_status tool.
 *
 * Medium-risk tool. Transitions a task to the given state.
 * The assistant can update task status on behalf of the user.
 */

import { tasks } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import z from "zod";
import type { AssistantToolResult, AssistantToolShape } from "./assistant-tool-result.js";
import type { ToolContext } from "./tool-registry.js";

const TASK_STATES = ["proposed", "accepted", "active", "paused", "done", "cancelled"] as const;

const updateTaskStatusInputSchema = z.object({
	taskId: z.string().min(1),
	state: z.enum(TASK_STATES),
});

type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusInputSchema>;

async function handler(
	args: UpdateTaskStatusInput,
	ctx: ToolContext,
): Promise<AssistantToolResult<{ taskId: string; state: string }>> {
	const parsed = updateTaskStatusInputSchema.safeParse(args);
	if (!parsed.success) {
		return { status: "error", message: parsed.error.message };
	}
	const input = parsed.data;

	const [existing] = await ctx.db.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
	if (!existing) {
		return { status: "error", message: `Task not found: ${input.taskId}` };
	}

	const now = new Date().toISOString();
	await ctx.db
		.update(tasks)
		.set({ state: input.state, updatedAt: now })
		.where(eq(tasks.id, input.taskId));

	return { status: "ok", value: { taskId: input.taskId, state: input.state } };
}

export const updateTaskStatusTool: AssistantToolShape<UpdateTaskStatusInput> = {
	name: "update_task_status",
	description: "Update the state of a task (proposed, accepted, active, paused, done, cancelled).",
	inputSchema: updateTaskStatusInputSchema,
	handler,
};
