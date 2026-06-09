/**
 * AE3 — create_bet tool.
 *
 * Creates a new bet in "draft" status for the given team.
 * Restricted to the assistant role (renamed from chief_of_staff in AD8b).
 *
 * @lore AE3: Cross-team scope is intentional. See create-team.ts @lore AE3 comment.
 * @lore AD8b: role string "chief_of_staff" renamed to "assistant".
 */

import { randomUUID } from "node:crypto";
import { bets, teams } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import z from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

const createBetInputSchema = z.object({
	teamId: z.string().min(1),
	description: z.string().min(1).max(65_536),
	doneCondition: z.string().max(65_536).optional(),
	hypothesis: z.string().max(65_536).optional(),
});

type CreateBetInput = z.infer<typeof createBetInputSchema>;

interface CreateBetData {
	readonly betId: string;
	readonly status: "draft";
	readonly teamId: string;
}

async function handler(
	rawInput: CreateBetInput,
	ctx: ToolContext,
): Promise<ToolResult<CreateBetData>> {
	const parsed = createBetInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;

	// Verify the team exists
	const [team] = await ctx.db.select().from(teams).where(eq(teams.id, input.teamId)).limit(1);
	if (!team) {
		return err("NOT_FOUND", `Team not found: ${input.teamId}`);
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

	return ok<CreateBetData>({
		betId,
		status: "draft",
		teamId: input.teamId,
	});
}

// @lore AD8b: role string "chief_of_staff" renamed to "assistant".
export const createBetTool: ToolDefinition<CreateBetInput> = {
	name: "create_bet",
	description:
		"Create a new draft bet (time-boxed work commitment) on the specified team. The bet starts in draft status and must be committed separately to become active.",
	inputSchema: createBetInputSchema,
	handler,
	roles: ["assistant"],
};
