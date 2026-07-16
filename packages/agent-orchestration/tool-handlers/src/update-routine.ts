import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import { err, ok } from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

const updateRoutineInputSchema = z.object({
	routineId: z.string().min(1),
	updates: z.object({
		name: z.string().min(1).max(200).optional(),
		description: z.string().max(2000).optional(),
		state: z.enum(["active", "paused"]).optional(),
		triggerConfig: z.string().optional(),
		costCapPerRunMinor: z.number().int().min(0).nullable().optional(),
		costCapMonthlyMinor: z.number().int().min(0).nullable().optional(),
	}),
});

type UpdateRoutineInput = z.infer<typeof updateRoutineInputSchema>;

interface UpdateRoutineData {
	readonly routineId: string;
	readonly name: string;
	readonly state: string;
}

function stateToActive(state: string): boolean {
	return state === "active";
}

async function handler<TDb>(
	rawInput: UpdateRoutineInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult<UpdateRoutineData>> {
	const parsed = updateRoutineInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;
	const existing = await ports.routine.getRoutineById(ctx.db, input.routineId);

	if (!existing || existing.deletedAt) {
		return err("NOT_FOUND", `Routine not found: ${input.routineId}`);
	}

	const updates: Record<string, unknown> = {};
	const { updates: u } = input;

	if (u.name !== undefined) updates.name = u.name;
	if (u.description !== undefined) updates.description = u.description;
	if (u.triggerConfig !== undefined) updates.triggerConfig = u.triggerConfig;

	if (u.state !== undefined) {
		updates.state = u.state;
		updates.active = stateToActive(u.state);
	}

	if ("costCapPerRunMinor" in u) {
		updates.costCapPerRunMinor = u.costCapPerRunMinor ?? null;
	}
	if ("costCapMonthlyMinor" in u) {
		updates.costCapMonthlyMinor = u.costCapMonthlyMinor ?? null;
	}

	if (Object.keys(updates).length > 0) {
		await ports.routine.updateRoutineById(ctx.db, input.routineId, updates);
	}

	const updated = await ports.routine.getRoutineById(ctx.db, input.routineId);

	const name = updated?.name ?? existing.name;
	const state = updated?.state ?? existing.state;

	return ok<UpdateRoutineData>({
		routineId: input.routineId,
		name,
		state,
	});
}

export function createUpdateRoutineTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<UpdateRoutineInput, TDb> {
	return {
		name: "update_routine",
		description:
			"Update an existing routine's configuration — name, description, schedule, state, or cost caps.",
		inputSchema: updateRoutineInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
		roles: ["assistant"],
	};
}
