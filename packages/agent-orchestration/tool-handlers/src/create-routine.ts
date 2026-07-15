import { randomUUID } from "node:crypto";
import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import { err, ok } from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

const createRoutineInputSchema = z.object({
	name: z.string().min(1).max(200),
	description: z.string().max(2000).optional(),
	teamId: z.string().min(1),
	ownerAgentId: z.string().min(1),
	triggerType: z.literal("calendar"),
	triggerConfig: z.string().min(1),
	costCapPerRunMinor: z.number().int().min(0).optional(),
});

type CreateRoutineInput = z.infer<typeof createRoutineInputSchema>;

interface CreateRoutineData {
	readonly routineId: string;
	readonly name: string;
	readonly nextRunAt: string;
}

async function handler<TDb>(
	rawInput: CreateRoutineInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult<CreateRoutineData>> {
	const parsed = createRoutineInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;
	const team = await ports.org.getTeamById(ctx.db, input.teamId);
	if (!team) {
		return err("NOT_FOUND", `Team not found: ${input.teamId}`);
	}

	const agent = await ports.users.getUserById(ctx.db, input.ownerAgentId);
	if (!agent) {
		return err("NOT_FOUND", `Agent not found: ${input.ownerAgentId}`);
	}

	let triggerConfigParsed: { cron?: string };
	try {
		triggerConfigParsed = JSON.parse(input.triggerConfig) as { cron?: string };
	} catch {
		return err("INVALID_INPUT", "triggerConfig must be valid JSON");
	}

	if (!triggerConfigParsed.cron) {
		return err("INVALID_INPUT", "triggerConfig must include a cron field");
	}

	let parsedCron: unknown;
	try {
		parsedCron = ports.dispatch.parseCron(triggerConfigParsed.cron);
	} catch {
		return err("INVALID_INPUT", `Invalid cron expression: ${triggerConfigParsed.cron}`);
	}

	const routineId = randomUUID();
	const now = new Date().toISOString();

	const nextRunAt = ports.dispatch.nextCronMatch(parsedCron, new Date()).toISOString();

	await ports.routine.insertRoutine(ctx.db, {
		id: routineId,
		name: input.name,
		description: input.description ?? null,
		teamId: input.teamId,
		ownerAgentId: input.ownerAgentId,
		triggerType: input.triggerType,
		triggerConfig: input.triggerConfig,
		state: "active",
		active: true,
		costCapPerRunMinor: input.costCapPerRunMinor ?? null,
		nextRunAt,
		createdAt: now,
	});

	return ok<CreateRoutineData>({
		routineId,
		name: input.name,
		nextRunAt,
	});
}

export function createCreateRoutineTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<CreateRoutineInput, TDb> {
	return {
		name: "create_routine",
		description:
			"Create a new routine (recurring automated task) for a team agent. Requires a calendar trigger with a cron expression.",
		inputSchema: createRoutineInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
		roles: ["assistant"],
	};
}
