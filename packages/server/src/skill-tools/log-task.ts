import { tasks } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { type ToolResult, err, ok } from "./tool-result.js";

const logTaskInputSchema = z.object({
	note: z.string().min(1),
});

type LogTaskInput = z.infer<typeof logTaskInputSchema>;

async function handler(args: LogTaskInput, ctx: ToolContext): Promise<ToolResult> {
	const parsed = logTaskInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const { note } = parsed.data;

	const task = ctx.db.select().from(tasks).where(eq(tasks.id, ctx.taskId)).get();
	if (!task) {
		return err("NOT_FOUND", `Task not found: ${ctx.taskId}`);
	}

	const now = new Date().toISOString();
	const existingAudit: unknown[] = task.notes ? JSON.parse(task.notes) : [];
	existingAudit.push({
		type: "note",
		agentId: ctx.agentId,
		sessionId: ctx.sessionId,
		text: note,
		timestamp: now,
	});

	ctx.db
		.update(tasks)
		.set({ notes: JSON.stringify(existingAudit), updatedAt: now })
		.where(eq(tasks.id, ctx.taskId))
		.run();

	return ok({ taskId: ctx.taskId });
}

export const logTaskTool: ToolDefinition<LogTaskInput> = {
	name: "log_task",
	description:
		"Append a note to the current task's audit trail. Useful for recording mid-session discoveries, decisions, or status updates.",
	inputSchema: logTaskInputSchema,
	handler,
};
