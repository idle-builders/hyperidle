import { randomUUID } from "node:crypto";
import { teamMembers, teams, users } from "@hyperidle/db";
import { provisionTeamRoutines } from "@hyperidle/fabric";
import { eq } from "drizzle-orm";
import z from "zod";
import { persistScaffoldedAgents } from "../services/scaffold-agents.js";
import { getActiveStrategy } from "../services/strategy-registry.js";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

/**
 * `create_team` — Create a new team with the specified functions and auto-generate
 * an agent roster using the active Strategy.
 *
 * @lore AE3: The teams.functions column was never written to by any existing route.
 * This tool is the first writer. The column is `text` (nullable), and we store a
 * JSON array string. The Zod schema enforces min(1) so we always write a non-empty array.
 *
 * @lore AE3: Cross-team scope is intentional. The assistant is a factory-wide operator
 * — it should be able to create teams and agents across any team.
 * No cross-team restriction is applied. The authorization boundary is role-based
 * ("only individual-category agents can use management tools"), not team-scoped.
 *
 * @lore AK6 T7: Rewritten to route through the Strategy port (scaffoldAgents +
 * persistScaffoldedAgents). No inline defaultRoster() call — the active Strategy
 * decides the roster composition.
 */
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

async function handler(
	rawInput: CreateTeamInput,
	ctx: ToolContext,
): Promise<ToolResult<CreateTeamData>> {
	const parsed = createTeamInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;
	const now = new Date().toISOString();

	// @lore U2: ID prefix "team-" per the U2 domain rename from product- to team-.
	const teamId = `team-${randomUUID()}`;
	const teamMembersId = `team-${randomUUID()}`;

	// Insert the team row. functions stored as JSON string.
	await ctx.db.insert(teams).values({
		id: teamId,
		name: input.name,
		phase: "build",
		functions: JSON.stringify(input.functions),
		factoryDbPath: input.repoPath ?? null,
		createdAt: now,
	});

	// Insert the teamMembers membership row
	await ctx.db.insert(teamMembers).values({
		id: teamMembersId,
		teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});

	// AK6 T7: Route through Strategy port — the active Strategy decides the roster.
	const specs = await getActiveStrategy().scaffoldAgents({
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

	// AK6: Kernel persists the specs (single writer, assigns ids, attaches mechanism fields).
	const { agentIds, leadAgentId } = await persistScaffoldedAgents(ctx.db, teamMembersId, specs);

	// Build roster summary from the inserted rows.
	const createdAgents = await ctx.db
		.select({ id: users.id, role: users.role, name: users.name })
		.from(users)
		.where(eq(users.teamId, teamMembersId));
	const roster = createdAgents.map((a) => ({
		role: a.role ?? "",
		name: a.name,
		agentId: a.id,
	}));

	// Set the lead agent on the team members row
	const lead = leadAgentId ?? agentIds[0] ?? null;
	if (lead !== null) {
		await ctx.db
			.update(teamMembers)
			.set({ leadAgentId: lead })
			.where(eq(teamMembers.id, teamMembersId));
	}

	// AF17: provision built-in routines for this team — owned by this team's own agents.
	// @lore AF17: routines.team_id must be teams.id (teamId), NOT team_members.id (teamMembersId).
	// ownerByRole is built from the created roster rows in the DB.
	{
		const ownerByRole: Partial<Record<string, string>> = {};
		for (const { role, agentId } of roster) {
			if (role && !ownerByRole[role]) {
				ownerByRole[role] = agentId;
			}
		}
		// AF17: provisioning errors propagate — tool invocation must fail loudly if
		// routine provisioning fails, not silently create a team without automation.
		await provisionTeamRoutines(ctx.db, {
			teamId,
			ownerByRole,
			leadAgentId: lead ?? agentIds[0] ?? "",
		});
	}

	return ok<CreateTeamData>({
		teamId,
		teamMembersId,
		agentIds,
		roster,
	});
}

export const createTeamTool: ToolDefinition<CreateTeamInput> = {
	name: "create_team",
	description:
		"Create a new team with the specified functions. Automatically generates an agent roster based on the active Strategy. Each agent is created with appropriate system prompt templates.",
	inputSchema: createTeamInputSchema,
	handler,
	// @lore AD8b: role string "chief_of_staff" renamed to "assistant".
	roles: ["assistant"],
};
