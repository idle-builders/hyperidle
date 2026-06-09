/**
 * AD8b Task 6 — create_bet tool.
 *
 * High-risk tool (requires review message gate in the assistant dispatcher).
 * Creates a new bet in "draft" status for the given team.
 */

import { randomUUID } from "node:crypto";
import { bets, teams } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import z from "zod";
import type { AssistantToolResult, AssistantToolShape } from "./assistant-tool-result.js";
import type { ToolContext } from "./tool-registry.js";

const createBetInputSchema = z.object({
	teamId: z.string().min(1),
	description: z.string().min(1).max(65_536),
	doneCondition: z.string().max(65_536).optional(),
	hypothesis: z.string().max(65_536).optional(),
});

type CreateBetInput = z.infer<typeof createBetInputSchema>;

async function handler(
	args: CreateBetInput,
	ctx: ToolContext,
): Promise<AssistantToolResult<{ betId: string }>> {
	const parsed = createBetInputSchema.safeParse(args);
	if (!parsed.success) {
		return { status: "error", message: parsed.error.message };
	}
	const input = parsed.data;

	const [team] = await ctx.db.select().from(teams).where(eq(teams.id, input.teamId)).limit(1);
	if (!team) {
		return { status: "error", message: `Team not found: ${input.teamId}` };
	}

	const betId = randomUUID();
	const now = new Date().toISOString();

	await ctx.db.insert(bets).values({
		id: betId,
		teamId: input.teamId,
		description: input.description,
		doneCondition: input.doneCondition ?? null,
		hypothesis: input.hypothesis ?? null,
		status: "draft",
		createdAt: now,
	});

	return { status: "ok", value: { betId } };
}

export const createBetTool: AssistantToolShape<CreateBetInput> = {
	name: "create_bet",
	description:
		"Create a new bet in draft status for the given team. HIGH RISK: requires human approval before execution.",
	inputSchema: createBetInputSchema,
	handler,
};
