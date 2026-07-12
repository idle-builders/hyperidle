import { randomUUID } from "node:crypto";
import { teams } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import z from "zod";
import * as routine from "../routine-service.js";
import { nextCronMatch, parseCron } from "../services/routine-scheduler.js";
import { getUserById } from "../services/user-store.js";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

/**
 * `create_routine` — Create a new recurring automated task (routine) for a team agent.
 * Requires a calendar trigger with a valid cron expression.
 *
 * @lore AE3: Two-step validation: (1) JSON.parse, (2) parseCron. Each failure returns
 * INVALID_INPUT with distinct messages, matching the pattern in routines-routes.ts:150-178.
 *
 * @lore AE3: Cross-team scope is intentional. See create-team.ts @lore AE3 comment.
 *
 * @lore AD8b: role string "chief_of_staff" will be renamed to "assistant" in AD8b.
 */
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

async function handler(
	rawInput: CreateRoutineInput,
	ctx: ToolContext,
): Promise<ToolResult<CreateRoutineData>> {
	const parsed = createRoutineInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;
	// Verify team exists
	const [team] = await ctx.db.select().from(teams).where(eq(teams.id, input.teamId)).limit(1);
	if (!team) {
		return err("NOT_FOUND", `Team not found: ${input.teamId}`);
	}

	// Verify agent exists
	const agent = await getUserById(ctx.db, input.ownerAgentId);
	if (!agent) {
		return err("NOT_FOUND", `Agent not found: ${input.ownerAgentId}`);
	}

	// Validate triggerConfig — two separate failure modes per critique warning:
	// (1) invalid JSON, (2) valid JSON but invalid/missing cron
	let triggerConfigParsed: { cron?: string };
	try {
		triggerConfigParsed = JSON.parse(input.triggerConfig) as { cron?: string };
	} catch {
		return err("INVALID_INPUT", "triggerConfig must be valid JSON");
	}

	if (!triggerConfigParsed.cron) {
		return err("INVALID_INPUT", "triggerConfig must include a cron field");
	}

	let parsedCron: ReturnType<typeof parseCron>;
	try {
		parsedCron = parseCron(triggerConfigParsed.cron);
	} catch {
		return err("INVALID_INPUT", `Invalid cron expression: ${triggerConfigParsed.cron}`);
	}

	const routineId = randomUUID();
	const now = new Date().toISOString();

	// Compute nextRunAt from the already-parsed cron expression (parsedCron set above)
	const nextRunAt = nextCronMatch(parsedCron, new Date()).toISOString();

	await routine.insertRoutine(ctx.db, {
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

// @lore AD8b: role string "chief_of_staff" renamed to "assistant" in AD8b.
export const createRoutineTool: ToolDefinition<CreateRoutineInput> = {
	name: "create_routine",
	description:
		"Create a new routine (recurring automated task) for a team agent. Requires a calendar trigger with a cron expression.",
	inputSchema: createRoutineInputSchema,
	handler,
	// @lore AD8b: role string "chief_of_staff" renamed to "assistant".
	roles: ["assistant"],
};
