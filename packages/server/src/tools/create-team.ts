import { randomUUID } from "node:crypto";
import { resolveAgentScaffoldSpecs } from "@hyperidle/agent-selection";
import { teamMembers, teams } from "@hyperidle/db";
import { persistScaffoldedAgents } from "@hyperidle/org";
import { getUserById, insertUser, listUsersByTeam } from "@hyperidle/users";
import { eq } from "drizzle-orm";
import z from "zod";
import { provisionTeamRoutines } from "../services/dispatch-bindings.js";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

// AU19 Increment 1c: `org`'s `OrgUserDirectory` port (Mechanism C), wired to
// the real `user-store.ts` function references unchanged (no behavior change).
const orgUsers = { getUserById, insertUser };

/**
 * `create_team` — Create a new team with the specified functions and auto-generate
 * an agent roster using app-owned defaults.
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
 * @lore AU3: Rewritten to route through app-owned scaffold specs +
 * persistScaffoldedAgents. No inline defaultRoster() call here.
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

	// AU3: Route through app-owned scaffold specs for the default roster.
	const specs = await resolveAgentScaffoldSpecs({
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

	// AK6: persistScaffoldedAgents is the single writer, assigning ids and mechanism fields.
	const { agentIds, leadAgentId } = await persistScaffoldedAgents(
		ctx.db,
		orgUsers,
		teamMembersId,
		specs,
	);

	// Build roster summary from the inserted rows.
	const createdAgents = await listUsersByTeam(ctx.db, teamMembersId);
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

	// AK6 P4 WARNING-1: emit team_created from the tool path so async subscribers
	// (AK7/AK8/audit) fire whether creation is via HTTP route OR tool invocation.
	// The HTTP route emits independently; this covers the tool surface (AC2).
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

export const createTeamTool: ToolDefinition<CreateTeamInput> = {
	name: "create_team",
	description:
		"Create a new team with the specified functions. Automatically generates an app-default agent roster with appropriate system prompt templates.",
	inputSchema: createTeamInputSchema,
	handler,
	// @lore AD8b: role string "chief_of_staff" renamed to "assistant".
	roles: ["assistant"],
};
