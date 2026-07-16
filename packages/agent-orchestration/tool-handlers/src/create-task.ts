import { randomUUID } from "node:crypto";
import type {
	TaskStateChangedEvent,
	ToolContext,
	ToolDefinition,
	ToolResult,
} from "@hyperidle/shared";
import { err, ok } from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

const createTaskInputSchema = z.object({
	title: z.string().min(1).max(512),
	description: z.string().max(65_536).optional(),
	doneCondition: z.string().max(65_536).optional(),
});

type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

async function handler<TDb>(
	args: CreateTaskInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult> {
	const parsed = createTaskInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;

	let parent: { betId: string; teamId: string };
	if (ctx.taskId) {
		const parentTask = await ports.work.getTaskById(ctx.db, ctx.taskId);
		if (!parentTask) {
			return err("NOT_FOUND", `Parent task not found: ${ctx.taskId}`);
		}
		parent = { betId: parentTask.betId, teamId: parentTask.teamId };
	} else if (ctx.requestContext?.sourceKind === "decomposition") {
		const { betId, teamId } = ctx.requestContext.sourceCorrelation as {
			readonly betId: string;
			readonly teamId: string;
		};
		const bet = await ports.work.getBetById(ctx.db, betId);
		if (!bet) {
			return err("NOT_FOUND", `Bet not found: ${betId}`);
		}
		parent = { betId, teamId };
	} else {
		return err("NOT_FOUND", "Parent task not found");
	}

	const taskId = randomUUID();
	const now = new Date().toISOString();
	await ports.work.createTask(ctx.db, {
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

export function createCreateTaskTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<CreateTaskInput, TDb> {
	return {
		name: "create_task",
		description:
			"Create a new task under the current bet. Derives betId and teamId from the session context. The new task starts in 'proposed' state.",
		inputSchema: createTaskInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
	};
}
