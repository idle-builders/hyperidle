import { randomUUID } from "node:crypto";
import { factorySettings, teamMembers, teams, users } from "@hyperidle/db";
import { findRoleCatalogEntry } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import z from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

/**
 * `add_agent` — Add a new AI agent to an existing team with the specified role.
 * Falls back to the system template in factorySettings when no explicit systemPrompt
 * is provided.
 *
 * @lore AE3: Cross-team scope is intentional. See create-team.ts @lore AE3 comment.
 *
 * @lore AD8b: role string "chief_of_staff" will be renamed to "assistant" in AD8b.
 */
const addAgentInputSchema = z.object({
	teamId: z.string().min(1),
	role: z.string().min(1).max(100),
	name: z.string().min(1).max(200),
	systemPrompt: z.string().max(50_000).optional(),
});

type AddAgentInput = z.infer<typeof addAgentInputSchema>;

interface AddAgentData {
	readonly agentId: string;
	readonly name: string;
	readonly role: string;
	readonly teamId: string;
}

async function handler(
	rawInput: AddAgentInput,
	ctx: ToolContext,
): Promise<ToolResult<AddAgentData>> {
	const parsed = addAgentInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;
	// Verify the team exists
	const [team] = await ctx.db.select().from(teams).where(eq(teams.id, input.teamId)).limit(1);
	if (!team) {
		return err("NOT_FOUND", `Team not found: ${input.teamId}`);
	}

	// Find the teamMembers row (1:1 with teams)
	const [memberGroup] = await ctx.db
		.select()
		.from(teamMembers)
		.where(eq(teamMembers.teamId, input.teamId))
		.limit(1);

	if (!memberGroup) {
		return err("NOT_FOUND", `Team membership group not found for team ${input.teamId}`);
	}

	// Look up system template if no explicit systemPrompt provided
	let systemPrompt: string | null = input.systemPrompt ?? null;
	if (systemPrompt === null) {
		const templateKey = `system_template:${input.role}`;
		const [templateRow] = await ctx.db
			.select()
			.from(factorySettings)
			.where(eq(factorySettings.key, templateKey))
			.limit(1);
		systemPrompt = templateRow?.value ?? null;
	}

	const catalogEntry = findRoleCatalogEntry(input.role);
	const agentCategory = catalogEntry?.category ?? "team";
	const agentId = randomUUID();
	const now = new Date().toISOString();

	await ctx.db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: input.name,
		role: input.role,
		agentCategory,
		systemPrompt,
		status: "active",
		maxConcurrentSessions: 1,
		// users.teamId references teamMembers.id (the membership group)
		teamId: memberGroup.id,
		createdAt: now,
	});

	return ok<AddAgentData>({
		agentId,
		name: input.name,
		role: input.role,
		teamId: input.teamId,
	});
}

// @lore AD8b: role string "chief_of_staff" renamed to "assistant" in AD8b.
export const addAgentTool: ToolDefinition<AddAgentInput> = {
	name: "add_agent",
	description:
		"Add a new AI agent to an existing team with the specified role. If no system prompt is provided, loads the default template for the role from factory settings.",
	inputSchema: addAgentInputSchema,
	handler,
	// @lore AD8b: role string "chief_of_staff" renamed to "assistant".
	roles: ["assistant"],
};
