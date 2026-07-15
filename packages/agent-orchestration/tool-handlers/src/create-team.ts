import { randomUUID } from "node:crypto";
import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import { err, ok } from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

const createTeamInputSchema = z.object({
	name: z.string().min(1).max(200),
	functions: z.array(z.string().min(1)).min(1).max(20),
	repoPath: z.string().max(500).optional(),
});

type CreateTeamInput = z.infer<typeof createTeamInputSchema>;

interface CreateTeamData {
	readonly teamId: string;
	readonly teamMembersId: string;
	readonly agentIds: readonly string[];
	readonly roster: readonly { role: string; name: string; agentId: string }[];
}

async function handler<TDb>(
	rawInput: CreateTeamInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult<CreateTeamData>> {
	const parsed = createTeamInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;
	const now = new Date().toISOString();

	const teamId = `team-${randomUUID()}`;
	const teamMembersId = `team-${randomUUID()}`;

	await ports.org.createTeam(ctx.db, {
		id: teamId,
		name: input.name,
		phase: "build",
		functions: JSON.stringify(input.functions),
		factoryDbPath: input.repoPath ?? null,
		createdAt: now,
	});

	await ports.org.createTeamMembersGroup(ctx.db, {
		id: teamMembersId,
		teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});

	const specs = await ports.agentSelection.resolveAgentScaffoldSpecs({
		db: ctx.db,
		trigger: "team_scaffold",
		teamId,
		teamMembersId,
		teamName: input.name,
		functions: input.functions,
		role: null,
		name: null,
		ownerUserId: null,
		ownerUserName: null,
	});

	const { agentIds, leadAgentId } = await ports.org.persistScaffoldedAgents(
		ctx.db,
		teamMembersId,
		specs,
	);

	const createdAgents = await ports.users.listUsersByTeam(ctx.db, teamMembersId);
	const roster = createdAgents.map((a) => ({
		role: a.role ?? "",
		name: a.name,
		agentId: a.id,
	}));

	const lead = leadAgentId ?? agentIds[0] ?? null;
	if (lead !== null) {
		await ports.org.setTeamMembersLeadAgent(ctx.db, teamMembersId, lead);
	}

	{
		const ownerByRole: Partial<Record<string, string>> = {};
		for (const { role, agentId } of roster) {
			if (role && !ownerByRole[role]) {
				ownerByRole[role] = agentId;
			}
		}
		await ports.dispatch.provisionTeamRoutines(ctx.db, {
			teamId,
			ownerByRole,
			leadAgentId: lead ?? agentIds[0] ?? "",
		});
	}

	ctx.eventBus.emit({
		type: "team_created",
		streamId: teamId,
		teamId,
		teamMembersId,
		functions: input.functions,
		agentIds,
		at: now,
	});

	return ok<CreateTeamData>({
		teamId,
		teamMembersId,
		agentIds,
		roster,
	});
}

export function createCreateTeamTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<CreateTeamInput, TDb> {
	return {
		name: "create_team",
		description:
			"Create a new team with the specified functions. Automatically generates an app-default agent roster with appropriate system prompt templates.",
		inputSchema: createTeamInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
		roles: ["assistant"],
	};
}
