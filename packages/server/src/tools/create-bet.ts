/**
 * AE3 / AD8b — create_bet tool.
 *
 * Creates a new bet in "draft" status for the given team.
 * Uses AssistantToolShape (status-discriminated result) per AD8b convention.
 * Wrapped with roles: ["assistant"] in tool-registry.ts for role-based filtering.
 *
 * @lore AE3: Cross-team scope is intentional. See create-team.ts @lore AE3 comment.
 * @lore AD8b: role string "chief_of_staff" renamed to "assistant".
 * @lore AD8b: Uses AssistantToolShape — tool-registry wraps to ToolDefinition with roles filter.
 */

import { randomUUID } from "node:crypto";
import { teams } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import z from "zod";
import * as work from "../work-service.js";
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
): Promise<AssistantToolResult<{ betId: string; status: "draft"; teamId: string }>> {
	const parsed = createBetInputSchema.safeParse(args);
	if (!parsed.success) {
		return { status: "error", message: parsed.error.message };
	}
	const input = parsed.data;

	// Verify the team exists
	const [team] = await ctx.db.select().from(teams).where(eq(teams.id, input.teamId)).limit(1);
	if (!team) {
		return { status: "error", message: `Team not found: ${input.teamId}` };
	}

	const betId = randomUUID();
	const now = new Date().toISOString();

	await work.createBet(ctx.db, {
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

export const createBetTool: AssistantToolShape<CreateBetInput> = {
	name: "create_bet",
	description:
		"Create a new bet in draft status for the given team. HIGH RISK: requires human approval before execution.",
	inputSchema: createBetInputSchema,
	handler,
};
