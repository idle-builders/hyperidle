/**
 * AE3 — create_team tool integration tests.
 *
 * RED phase: these tests will fail until create-team.ts is implemented.
 */

import { teamMembers, teams, users } from "@hyperidle/db";
import { defaultRoster } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../../test-fixtures.js";
// Import will fail until the file is created — that's expected in red phase.
// biome-ignore lint/style/useImportType: ToolDefinition is used as value
import { createTeamTool } from "../create-team.js";
import { makeContext } from "./_helpers.js";

describe("create_team tool", () => {
	test("creates team row, teamMembers row, and agent roster from functions", async ({ db }) => {
		const result = await createTeamTool.handler(
			{ name: "Marketing", functions: ["marketing"] },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as {
			teamId: string;
			teamMembersId: string;
			agentIds: readonly string[];
			roster: readonly { role: string; name: string; agentId: string }[];
		};

		// Teams row exists
		const teamRows = await db.select().from(teams).where(eq(teams.id, data.teamId));
		expect(teamRows).toHaveLength(1);
		expect(teamRows[0]!.name).toBe("Marketing");

		// functions stored as JSON string
		const storedFunctions = JSON.parse(teamRows[0]!.functions ?? "[]") as string[];
		expect(storedFunctions).toEqual(["marketing"]);

		// teamMembers row exists
		const memberRows = await db
			.select()
			.from(teamMembers)
			.where(eq(teamMembers.id, data.teamMembersId));
		expect(memberRows).toHaveLength(1);
		expect(memberRows[0]!.teamId).toBe(data.teamId);

		// Agent rows match defaultRoster
		const expectedRoles = defaultRoster(["marketing"]);
		expect(data.agentIds).toHaveLength(expectedRoles.length);
		expect(data.roster).toHaveLength(expectedRoles.length);

		for (const agentId of data.agentIds) {
			const agentRows = await db.select().from(users).where(eq(users.id, agentId));
			expect(agentRows).toHaveLength(1);
			const agent = agentRows[0];
			expect(agent!.kind).toBe("ai");
			expect(agent!.status).toBe("active");
			expect(agent!.teamId).toBe(data.teamMembersId);
			expect(expectedRoles).toContain(agent!.role);
		}
	});

	test("returns ok({ teamId, teamMembersId, agentIds, roster })", async ({ db }) => {
		const result = await createTeamTool.handler(
			{ name: "Dev Team", functions: ["development"] },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as {
			teamId: string;
			teamMembersId: string;
			agentIds: readonly string[];
			roster: readonly { role: string; name: string; agentId: string }[];
		};
		expect(typeof data.teamId).toBe("string");
		expect(typeof data.teamMembersId).toBe("string");
		expect(Array.isArray(data.agentIds)).toBe(true);
		expect(Array.isArray(data.roster)).toBe(true);
	});

	test("agents with hasTemplate=true have systemPrompt populated when template exists", async ({
		db,
	}) => {
		// Seed a system template for builder role
		const { factorySettings } = await import("@hyperidle/db");
		await db.insert(factorySettings).values({
			key: "system_template:builder",
			value: "You are a builder agent. Build great things.",
			updatedAt: new Date().toISOString(),
		});

		const result = await createTeamTool.handler(
			{ name: "Dev", functions: ["development"] },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as {
			agentIds: readonly string[];
			roster: readonly { role: string; name: string; agentId: string }[];
		};

		// Find the builder agent
		const builderEntry = data.roster.find((r) => r.role === "builder");
		expect(builderEntry).toBeDefined();
		if (!builderEntry) return;

		const [builderAgent] = await db
			.select()
			.from(users)
			.where(eq(users.id, builderEntry.agentId))
			.limit(1);
		expect(builderAgent).toBeDefined();
		expect(builderAgent!.systemPrompt).toBe("You are a builder agent. Build great things.");
	});

	test("agents without a system template have systemPrompt = null", async ({ db }) => {
		// brand_voice role has hasTemplate: false in catalog — no template in factorySettings
		const result = await createTeamTool.handler(
			{ name: "Mkt", functions: ["marketing"] },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as {
			roster: readonly { role: string; name: string; agentId: string }[];
		};

		const brandVoice = data.roster.find((r) => r.role === "brand_voice");
		if (!brandVoice) return; // skip if role not in roster for this function set

		const [agent] = await db.select().from(users).where(eq(users.id, brandVoice.agentId)).limit(1);
		expect(agent!.systemPrompt).toBeNull();
	});

	test("stores repoPath in teams.factoryDbPath when provided", async ({ db }) => {
		const result = await createTeamTool.handler(
			{ name: "Repo Team", functions: ["development"], repoPath: "/home/projects/myapp" },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { teamId: string };
		const [team] = await db.select().from(teams).where(eq(teams.id, data.teamId)).limit(1);
		expect(team!.factoryDbPath).toBe("/home/projects/myapp");
	});

	test("INVALID_INPUT when functions array is empty (below min(1))", async ({ db }) => {
		const result = await createTeamTool.handler({ name: "Empty", functions: [] }, makeContext(db));
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});

	// @lore AD8b: role "chief_of_staff" renamed to "assistant".
	test("tool is restricted to assistant role", () => {
		expect(createTeamTool.roles).toBeDefined();
		expect(createTeamTool.roles).toContain("assistant");
	});
});
