import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import { err, ok } from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

const logTaskInputSchema = z.object({
	note: z.string().min(1).max(65_536),
});

type LogTaskInput = z.infer<typeof logTaskInputSchema>;

const NOTE_SEPARATOR = "\n\n---\n\n";

async function handler<TDb>(
	args: LogTaskInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult> {
	const parsed = logTaskInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const { note } = parsed.data;

	const task = await ports.work.getTaskById(ctx.db, ctx.taskId);
	if (!task) {
		return err("NOT_FOUND", `Task not found: ${ctx.taskId}`);
	}

	const now = new Date().toISOString();
	const prefix = `[${now} ${ctx.agentId}] `;
	const entry = `${prefix}${note}`;
	const combined =
		task.notes && task.notes.length > 0 ? `${task.notes}${NOTE_SEPARATOR}${entry}` : entry;

	await ports.work.updateTaskById(ctx.db, ctx.taskId, { notes: combined, updatedAt: now });

	return ok({ taskId: ctx.taskId });
}

export function createLogTaskTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<LogTaskInput, TDb> {
	return {
		name: "log_task",
		description:
			"Append a prose note to the current task's notes column. Useful for recording mid-session discoveries, decisions, or status updates. Does not touch the audit trail.",
		inputSchema: logTaskInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
	};
}
