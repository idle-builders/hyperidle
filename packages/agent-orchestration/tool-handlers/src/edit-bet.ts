import type { AssistantToolResult, AssistantToolShape, ToolContext } from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

const editBetInputSchema = z.object({
	betId: z.string().min(1),
	description: z.string().min(1).max(65_536).optional(),
	doneCondition: z.string().max(65_536).optional(),
	hypothesis: z.string().max(65_536).optional(),
});

type EditBetInput = z.infer<typeof editBetInputSchema>;

async function handler<TDb>(
	args: EditBetInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<AssistantToolResult<{ betId: string }>> {
	const parsed = editBetInputSchema.safeParse(args);
	if (!parsed.success) {
		return { status: "error", message: parsed.error.message };
	}
	const input = parsed.data;

	const existing = await ports.work.getBetById(ctx.db, input.betId);
	if (!existing) {
		return { status: "error", message: `Bet not found: ${input.betId}` };
	}

	if (existing.status !== "draft") {
		return { status: "error", message: "Can only edit a draft bet." };
	}

	const updates: Partial<{
		description: string;
		doneCondition: string | null;
		hypothesis: string | null;
	}> = {};
	if (input.description !== undefined) updates.description = input.description;
	if (input.doneCondition !== undefined) updates.doneCondition = input.doneCondition;
	if (input.hypothesis !== undefined) updates.hypothesis = input.hypothesis;

	if (Object.keys(updates).length === 0) {
		return { status: "error", message: "No fields to update." };
	}

	await ports.work.updateBetById(ctx.db, input.betId, updates);

	return { status: "ok", value: { betId: input.betId } };
}

export function createEditBetTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): AssistantToolShape<EditBetInput, TDb> {
	return {
		name: "edit_bet",
		description:
			"Edit a bet's description, done condition, or hypothesis. HIGH RISK: requires human approval.",
		inputSchema: editBetInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
	};
}
