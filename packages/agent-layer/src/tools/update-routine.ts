import { routine } from "@hyperidle/core-app";
import z from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

/**
 * `update_routine` — Update an existing routine's configuration.
 * Syncs the `active` boolean from the `state` field for backward compatibility.
 *
 * @lore AE3: Soft-deleted routines (deletedAt IS NOT NULL) are treated as NOT_FOUND,
 * matching the PATCH route behavior in routines-routes.ts:477-479.
 *
 * @lore AD8b: role string "chief_of_staff" will be renamed to "assistant" in AD8b.
 */
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

/**
 * Map routine state string to `active` boolean for backward compat.
 * active → true; paused → false.
 */
function stateToActive(state: string): boolean {
	return state === "active";
}

async function handler(
	rawInput: UpdateRoutineInput,
	ctx: ToolContext,
): Promise<ToolResult<UpdateRoutineData>> {
	const parsed = updateRoutineInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;
	// Verify routine exists and is not soft-deleted.
	// @lore AU13 CONFUSION: the real predicate was SQL-level
	// `isNull(routines.deletedAt)`. Preserved as an app-level check on the
	// full row instead — identical observable behavior (soft-deleted →
	// NOT_FOUND either way), matching the precedent already used by
	// routines-routes.ts's PATCH handler (`if (!existing || existing.deletedAt)`).
	const existing = await routine.getRoutineById(ctx.db, input.routineId);

	if (!existing || existing.deletedAt) {
		return err("NOT_FOUND", `Routine not found: ${input.routineId}`);
	}

	// Build the updates object — only include fields that are present in input
	const updates: routine.RoutinePatch = {};
	const { updates: u } = input;

	if (u.name !== undefined) updates.name = u.name;
	if (u.description !== undefined) updates.description = u.description;
	if (u.triggerConfig !== undefined) updates.triggerConfig = u.triggerConfig;

	if (u.state !== undefined) {
		updates.state = u.state;
		// Sync active boolean for backward compat (AA1 pattern from routines-routes.ts)
		updates.active = stateToActive(u.state);
	}

	// null removes the cap (explicit null is valid)
	if ("costCapPerRunMinor" in u) {
		updates.costCapPerRunMinor = u.costCapPerRunMinor ?? null;
	}
	if ("costCapMonthlyMinor" in u) {
		updates.costCapMonthlyMinor = u.costCapMonthlyMinor ?? null;
	}

	if (Object.keys(updates).length > 0) {
		await routine.updateRoutineById(ctx.db, input.routineId, updates);
	}

	// Re-read to get the canonical final state
	const updated = await routine.getRoutineById(ctx.db, input.routineId);

	// updated must exist — we just verified it above and the id is a PK
	const name = updated?.name ?? existing.name;
	const state = updated?.state ?? existing.state;

	return ok<UpdateRoutineData>({
		routineId: input.routineId,
		name,
		state,
	});
}

// @lore AD8b: role string "chief_of_staff" renamed to "assistant" in AD8b.
export const updateRoutineTool: ToolDefinition<UpdateRoutineInput> = {
	name: "update_routine",
	description:
		"Update an existing routine's configuration — name, description, schedule, state, or cost caps.",
	inputSchema: updateRoutineInputSchema,
	handler,
	// @lore AD8b: role string "chief_of_staff" renamed to "assistant".
	roles: ["assistant"],
};
