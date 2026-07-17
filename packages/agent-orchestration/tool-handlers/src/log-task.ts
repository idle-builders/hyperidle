import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import { err, ok } from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

const logTaskInputSchema = z.object({
	note: z.string().min(1).max(65_536),
});

type LogTaskInput = z.infer<typeof logTaskInputSchema>;

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

	const now = new Date().toISOString();
	const entry = `[${now} ${ctx.agentId}] ${note}`;

	// Atomic append — single UPDATE with SQL CASE, no pre-read, no lost-update race.
	// `undefined` means the task row was not found (WHERE matched no rows).
	const result = await ports.work.appendTaskNote(ctx.db, ctx.taskId, entry);
	if (!result) {
		return err("NOT_FOUND", `Task not found: ${ctx.taskId}`);
	}

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
