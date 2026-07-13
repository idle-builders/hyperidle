import { randomUUID } from "node:crypto";
import { work } from "@hyperidle/core-app";
import type { TaskStateChangedEvent } from "@hyperidle/shared";
import z from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

const createTaskInputSchema = z.object({
	title: z.string().min(1).max(512),
	description: z.string().max(65_536).optional(),
	doneCondition: z.string().max(65_536).optional(),
});

type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

/**
 * Create a new task under the current session's bet.
 *
 * Derives betId and teamId from the session's parent task, or from a
 * decomposition session request context for task-free PM decomposition runs.
 * The agent cannot create tasks on an arbitrary bet. ownerAgentId is set to the
 * calling agent. New tasks start in "proposed" state.
 *
 * @lore R5 D1: betId is derived from ctx.taskId (not accepted as agent input)
 * to prevent cross-bet task injection. The parent task is already validated by
 * session-provisioning Phase 3, so a NOT_FOUND here indicates a programming
 * error, not a user error.
 */
async function handler(args: CreateTaskInput, ctx: ToolContext): Promise<ToolResult> {
	const parsed = createTaskInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;

	let parent: { betId: string; teamId: string };
	if (ctx.taskId) {
		const parentTask = await work.getTaskById(ctx.db, ctx.taskId);
		if (!parentTask) {
			return err("NOT_FOUND", `Parent task not found: ${ctx.taskId}`);
		}
		parent = { betId: parentTask.betId, teamId: parentTask.teamId };
	} else if (ctx.requestContext?.sourceKind === "decomposition") {
		const { betId, teamId } = ctx.requestContext.sourceCorrelation as {
			readonly betId: string;
			readonly teamId: string;
		};
		const bet = await work.getBetById(ctx.db, betId);
		if (!bet) {
			return err("NOT_FOUND", `Bet not found: ${betId}`);
		}
		parent = { betId, teamId };
	} else {
		return err("NOT_FOUND", "Parent task not found");
	}

	// 2. Insert new task in "proposed" state.
	// @lore U1: tasks no longer has a productId column. teamId references teams.id (domain entity).
	const taskId = randomUUID();
	const now = new Date().toISOString();
	await work.createTask(ctx.db, {
		id: taskId,
		betId: parent.betId,
		teamId: parent.teamId,
		ownerAgentId: ctx.agentId,
		title: input.title,
		description: input.description ?? null,
		doneCondition: input.doneCondition ?? null,
		state: "proposed",
		createdAt: now,
		updatedAt: now,
	});

	// 3. Emit task_state_changed event for observability.
	const event: TaskStateChangedEvent = {
		type: "task_state_changed",
		streamId: taskId,
		taskId,
		fromState: "proposed",
		toState: "proposed",
		timestamp: Date.now(),
	};
	ctx.eventBus.emit(event);

	return ok({ taskId, betId: parent.betId });
}

export const createTaskTool: ToolDefinition<CreateTaskInput> = {
	name: "create_task",
	description:
		"Create a new task under the current bet. Derives betId and teamId from the session context. The new task starts in 'proposed' state.",
	inputSchema: createTaskInputSchema,
	handler,
};
