import { randomUUID } from "node:crypto";
import { factorySettings, teamMembers, teams, users } from "@hyperidle/db";
import { provisionTeamRoutines } from "@hyperidle/fabric";
import { defaultRoster, findRoleCatalogEntry } from "@hyperidle/shared";
import { eq, inArray } from "drizzle-orm";
import z from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

/**
 * `create_team` — Create a new team with the specified functions and auto-generate
 * an agent roster using the role catalog.
 *
 * @lore AE3: The teams.functions column was never written to by any existing route.
 * This tool is the first writer. The column is `text` (nullable), and we store a
 * JSON array string. The Zod schema enforces min(1) so we always write a non-empty array.
 *
 * @lore AE3: Cross-team scope is intentional. The chief_of_staff (assistant) is a
 * factory-wide operator — it should be able to create teams and agents across any team.
 * No cross-team restriction is applied. The authorization boundary is role-based
 * ("only individual-category agents can use management tools"), not team-scoped.
 *
 * @lore AD8b: role string "chief_of_staff" will be renamed to "assistant" in AD8b.
 * Update the `roles` array in that migration.
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

	// Compute roster using the shared defaultRoster function
	const rosterRoles = defaultRoster(input.functions);

	// Pre-fetch all relevant soul templates in one query to avoid N+1
	const templateKeys = rosterRoles.map((r) => `soul_template:${r}`);
	const [firstKey] = templateKeys;
	const templateRows =
		firstKey !== undefined
			? await ctx.db
					.select()
					.from(factorySettings)
					.where(
						templateKeys.length === 1
							? eq(factorySettings.key, firstKey)
							: inArray(factorySettings.key, templateKeys),
					)
			: [];

	const templateMap = new Map<string, string>(templateRows.map((row) => [row.key, row.value]));

	const agentIds: string[] = [];
	const roster: { role: string; name: string; agentId: string }[] = [];

	let leadAgentId: string | null = null;

	for (const role of rosterRoles) {
		const agentId = `agent-${role}-${randomUUID()}`;
		const catalogEntry = findRoleCatalogEntry(role);
		const agentName = catalogEntry
			? `${input.name} ${catalogEntry.label}`
			: `${input.name} ${role}`;
		const agentCategory = catalogEntry?.category ?? "team";
		const templateKey = `soul_template:${role}`;
		const soulPrompt = templateMap.get(templateKey) ?? null;

		await ctx.db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: agentName,
			role,
			agentCategory,
			soulPrompt,
			status: "active",
			maxConcurrentSessions: 1,
			teamId: teamMembersId,
			createdAt: now,
		});

		agentIds.push(agentId);
		roster.push({ role, name: agentName, agentId });

		// product_manager is the lead; if none, first agent is the lead
		if (leadAgentId === null || role === "product_manager") {
			leadAgentId = agentId;
		}
	}

	// Set the lead agent on the team members row
	if (leadAgentId !== null) {
		await ctx.db.update(teamMembers).set({ leadAgentId }).where(eq(teamMembers.id, teamMembersId));
	}

	// AF17: provision built-in routines for this team — owned by this team's own agents.
	// @lore AF17: routines.team_id must be teams.id (teamId), NOT team_members.id (teamMembersId).
	// ownerByRole and leadAgentId are users.id values from the just-created roster.
	{
		const ownerByRole: Partial<Record<string, string>> = {};
		for (const { role, agentId } of roster) {
			ownerByRole[role] = agentId;
		}
		await provisionTeamRoutines(ctx.db, {
			teamId,
			ownerByRole,
			leadAgentId: leadAgentId ?? agentIds[0] ?? "",
		}).catch(() => {
			// Non-fatal: don't fail tool invocation
		});
	}

	return ok<CreateTeamData>({
		teamId,
		teamMembersId,
		agentIds,
		roster,
	});
}

// @lore AD8b: role string "chief_of_staff" renamed to "assistant" in AD8b.
export const createTeamTool: ToolDefinition<CreateTeamInput> = {
	name: "create_team",
	description:
		"Create a new team with the specified functions. Automatically generates an agent roster based on the functions using the role catalog. Each agent is created with appropriate soul prompt templates.",
	inputSchema: createTeamInputSchema,
	handler,
	// @lore AD8b: role string "chief_of_staff" renamed to "assistant".
	roles: ["assistant"],
};
