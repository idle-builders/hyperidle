import z from "zod";
import * as work from "../work-service.js";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

const logTaskInputSchema = z.object({
	note: z.string().min(1).max(65_536),
});

type LogTaskInput = z.infer<typeof logTaskInputSchema>;

/**
 * Separator between appended notes. Chosen to be unambiguous when rendered in
 * the UI and easy to split on programmatically.
 */
const NOTE_SEPARATOR = "\n\n---\n\n";

/**
 * @lore I1 C2/C3: `log_task` writes agent-authored PROSE to `tasks.notes`,
 * not JSON-serialised audit entries. State transitions and handoffs live in
 * `tasks.auditTrail`. The tool's description previously said "audit trail"
 * but that was a misnomer — the column contract is prose-only. Keeping this
 * as plain-text append preserves reader UX (notes render directly) and
 * eliminates the risk of the tool corrupting an audit JSON blob that lived
 * in the same column under the old (wrong) implementation.
 */
async function handler(args: LogTaskInput, ctx: ToolContext): Promise<ToolResult> {
	const parsed = logTaskInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const { note } = parsed.data;

	const task = await work.getTaskById(ctx.db, ctx.taskId);
	if (!task) {
		return err("NOT_FOUND", `Task not found: ${ctx.taskId}`);
	}

	const now = new Date().toISOString();
	const prefix = `[${now} ${ctx.agentId}] `;
	const entry = `${prefix}${note}`;
	const combined =
		task.notes && task.notes.length > 0 ? `${task.notes}${NOTE_SEPARATOR}${entry}` : entry;

	await work.updateTaskById(ctx.db, ctx.taskId, { notes: combined, updatedAt: now });

	return ok({ taskId: ctx.taskId });
}

export const logTaskTool: ToolDefinition<LogTaskInput> = {
	name: "log_task",
	description:
		"Append a prose note to the current task's notes column. Useful for recording mid-session discoveries, decisions, or status updates. Does not touch the audit trail.",
	inputSchema: logTaskInputSchema,
	handler,
};
