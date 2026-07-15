import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import { err, ok } from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

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

async function handler<TDb>(
	rawInput: AddAgentInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult<AddAgentData>> {
	const parsed = addAgentInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;

	const team = await ports.org.getTeamById(ctx.db, input.teamId);
	if (!team) {
		return err("NOT_FOUND", `Team not found: ${input.teamId}`);
	}

	const memberGroup = await ports.org.getTeamMembersByTeamId(ctx.db, input.teamId);
	if (!memberGroup) {
		return err("NOT_FOUND", `Team membership group not found for team ${input.teamId}`);
	}

	const specs = await ports.agentSelection.resolveAgentScaffoldSpecs({
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

	const finalSpecs =
		input.systemPrompt !== undefined
			? specs.map((s) => ({ ...s, systemPrompt: input.systemPrompt ?? null }))
			: specs;

	const { agentIds } = await ports.org.persistScaffoldedAgents(ctx.db, memberGroup.id, finalSpecs);
	const agentId = agentIds[0];
	if (!agentId) {
		return err("INTERNAL_ERROR", "App defaults returned no specs for agent_added trigger");
	}

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

export function createAddAgentTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<AddAgentInput, TDb> {
	return {
		name: "add_agent",
		description:
			"Add a new AI agent to an existing team with the specified role. App defaults determine the persona. If systemPrompt is provided, it overrides the default.",
		inputSchema: addAgentInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
		roles: ["assistant"],
	};
}
