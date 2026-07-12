/**
 * AD8b Task 6 — edit_bet tool.
 *
 * High-risk tool (requires review message gate).
 * Updates the description of an existing bet.
 */

import z from "zod";
import * as work from "../work-service.js";
import type { AssistantToolResult, AssistantToolShape } from "./assistant-tool-result.js";
import type { ToolContext } from "./tool-registry.js";

const editBetInputSchema = z.object({
	betId: z.string().min(1),
	description: z.string().min(1).max(65_536).optional(),
	doneCondition: z.string().max(65_536).optional(),
	hypothesis: z.string().max(65_536).optional(),
});

type EditBetInput = z.infer<typeof editBetInputSchema>;

async function handler(
	args: EditBetInput,
	ctx: ToolContext,
): Promise<AssistantToolResult<{ betId: string }>> {
	const parsed = editBetInputSchema.safeParse(args);
	if (!parsed.success) {
		return { status: "error", message: parsed.error.message };
	}
	const input = parsed.data;

	const existing = await work.getBetById(ctx.db, input.betId);
	if (!existing) {
		return { status: "error", message: `Bet not found: ${input.betId}` };
	}

	// @lore AK4 Task 5: draft-only guard — the assistant may only edit a bet while
	// it is still in draft status. Once committed (active), completed, or killed,
	// the bet is immutable from the conversational turn. Belt-and-suspenders with the
	// transcript-binding liveness check (resolveCurrentDraftBetId never rebinds a
	// committed bet), but this guard prevents any cross-path bypass.
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

	await work.updateBetById(ctx.db, input.betId, updates);

	return { status: "ok", value: { betId: input.betId } };
}

export const editBetTool: AssistantToolShape<EditBetInput> = {
	name: "edit_bet",
	description:
		"Edit a bet's description, done condition, or hypothesis. HIGH RISK: requires human approval.",
	inputSchema: editBetInputSchema,
	handler,
};
