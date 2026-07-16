import { randomUUID } from "node:crypto";
import type { AssistantToolResult, AssistantToolShape, ToolContext } from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

const createBetInputSchema = z.object({
	teamId: z.string().min(1),
	description: z.string().min(1).max(65_536),
	doneCondition: z.string().max(65_536).optional(),
	hypothesis: z.string().max(65_536).optional(),
});

type CreateBetInput = z.infer<typeof createBetInputSchema>;

async function handler<TDb>(
	args: CreateBetInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<AssistantToolResult<{ betId: string; status: "draft"; teamId: string }>> {
	const parsed = createBetInputSchema.safeParse(args);
	if (!parsed.success) {
		return { status: "error", message: parsed.error.message };
	}
	const input = parsed.data;

	const team = await ports.org.getTeamById(ctx.db, input.teamId);
	if (!team) {
		return { status: "error", message: `Team not found: ${input.teamId}` };
	}

	const betId = randomUUID();
	const now = new Date().toISOString();

	await ports.work.createBet(ctx.db, {
		id: betId,
		teamId: input.teamId,
		description: input.description,
		doneCondition: input.doneCondition ?? null,
		hypothesis: input.hypothesis ?? null,
		status: "draft",
		createdAt: now,
	});

	return { status: "ok", value: { betId, status: "draft", teamId: input.teamId } };
}

export function createCreateBetTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): AssistantToolShape<CreateBetInput, TDb> {
	return {
		name: "create_bet",
		description:
			"Create a new bet in draft status for the given team. HIGH RISK: requires human approval before execution.",
		inputSchema: createBetInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
	};
}
