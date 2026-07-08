import { teamMembers, teams } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import z from "zod";
import { resolveAgentScaffoldSpecs } from "../services/agent-defaults/resolvers.js";
import { persistScaffoldedAgents } from "../services/scaffold-agents.js";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

/**
 * `add_agent` — Add a new AI agent to an existing team with the specified role.
 * Routes through app-owned scaffold specs to decide the persona.
 *
 * @lore AE3: Cross-team scope is intentional. See create-team.ts @lore AE3 comment.
 *
 * @lore AU3: Rewritten to route through app-owned scaffold specs +
 * persistScaffoldedAgents). The caller-supplied name is passed through as
 * ScaffoldRequest.name for agent_added.
 * Persona (systemPrompt) is app-owned — not read from factorySettings inline.
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

	// AU3: route through app-owned scaffold specs for the persona.
	// If a caller-supplied systemPrompt is provided, it overrides the app spec.
	const specs = await resolveAgentScaffoldSpecs({
		db: ctx.db,
		trigger: "agent_added",
		teamId: input.teamId,
		teamMembersId: memberGroup.id,
		teamName: team.name,
		functions: null,
		role: input.role,
		name: input.name,
		ownerUserId: null,
		ownerUserName: null,
	});

	// If caller explicitly provided a systemPrompt, override the app spec.
	// This preserves the existing tool contract: callers can pass systemPrompt directly.
	const finalSpecs =
		input.systemPrompt !== undefined
			? specs.map((s) => ({ ...s, systemPrompt: input.systemPrompt ?? null }))
			: specs;

	const { agentIds } = await persistScaffoldedAgents(ctx.db, memberGroup.id, finalSpecs);
	const agentId = agentIds[0];
	if (!agentId) {
		return err("INTERNAL_ERROR", "App defaults returned no specs for agent_added trigger");
	}

	// AK6 P4 WARNING-1: emit agent_added from the tool path so async subscribers
	// (AK7/AK8/audit) fire whether creation is via HTTP route OR tool invocation.
	// The HTTP route emits independently; this covers the tool surface (AC2).
	ctx.eventBus.emit({
		type: "agent_added",
		streamId: input.teamId,
		teamId: input.teamId,
		teamMembersId: memberGroup.id,
		agentId,
		role: input.role,
		at: new Date().toISOString(),
	});

	return ok<AddAgentData>({
		agentId,
		name: input.name,
		role: input.role,
		teamId: input.teamId,
	});
}

export const addAgentTool: ToolDefinition<AddAgentInput> = {
	name: "add_agent",
	description:
		"Add a new AI agent to an existing team with the specified role. App defaults determine the persona. If systemPrompt is provided, it overrides the default.",
	inputSchema: addAgentInputSchema,
	handler,
	// @lore AD8b: role string "chief_of_staff" renamed to "assistant".
	roles: ["assistant"],
};
