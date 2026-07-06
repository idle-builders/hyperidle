/**
 * POLISH-060 — persistScaffoldedAgents: primary harness parameterization.
 *
 * Root cause: persistScaffoldedAgents hardcodes harnessType:"builtin" for every
 * agent, so onboarding-created agents always use the builtin harness regardless
 * of what the user selected during setup.
 *
 * Fix: add an optional `primaryHarness` param to persistScaffoldedAgents and
 * thread it through the team-creation path (POST /api/teams).
 */

import { type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach } from "vitest";
import { persistScaffoldedAgents } from "../services/scaffold-agents.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { describe, expect, test } from "../test-fixtures.js";

beforeEach(() => {
	setActiveStrategy(minimalStrategy);
});
afterEach(() => {
	clearActiveStrategy();
});

/** Insert a teams + team_members row pair. */
async function seedTeamFixture(
	db: HyperIdleDb,
	teamId: string,
	teamMembersId: string,
	teamName: string,
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({
		id: teamId,
		name: teamName,
		phase: "build",
		createdAt: now,
	});
	await db.insert(teamMembers).values({
		id: teamMembersId,
		teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});
}

describe("persistScaffoldedAgents — primary harness parameterization", () => {
	test("specifying primaryHarness causes all scaffolded agents to use that harness type", async ({
		db,
	}) => {
		const teamId = "team-scaffold-ph-1";
		const teamMembersId = "tm-scaffold-ph-1";
		await seedTeamFixture(db, teamId, teamMembersId, "Primary Harness Test Team");

		const specs = await minimalStrategy.scaffoldAgents({
			db,
			trigger: "team_scaffold",
			teamId,
			teamMembersId,
			teamName: "Primary Harness Test Team",
			functions: ["development", "product"],
			role: null,
			name: null,
			ownerUserId: null,
			ownerUserName: null,
		});

		const { agentIds } = await persistScaffoldedAgents(db, teamMembersId, specs, {
			harnessType: "claude-code",
			modelId: "claude-sonnet-4-6",
			modelProvider: "anthropic",
		});

		expect(agentIds.length).toBeGreaterThan(0);
		const createdAgents = await db
			.select({ harnessType: users.harnessType, modelId: users.modelId })
			.from(users)
			.where(eq(users.teamId, teamMembersId));

		expect(createdAgents.length).toBeGreaterThan(0);
		for (const agent of createdAgents) {
			expect(agent.harnessType).toBe("claude-code");
			expect(agent.modelId).toBe("claude-sonnet-4-6");
		}
	});

	test("omitting primaryHarness keeps the default builtin harness for all scaffolded agents", async ({
		db,
	}) => {
		const teamId = "team-scaffold-ph-2";
		const teamMembersId = "tm-scaffold-ph-2";
		await seedTeamFixture(db, teamId, teamMembersId, "Default Harness Team");

		const specs = await minimalStrategy.scaffoldAgents({
			db,
			trigger: "team_scaffold",
			teamId,
			teamMembersId,
			teamName: "Default Harness Team",
			functions: ["development", "product"],
			role: null,
			name: null,
			ownerUserId: null,
			ownerUserName: null,
		});

		const { agentIds } = await persistScaffoldedAgents(db, teamMembersId, specs);

		expect(agentIds.length).toBeGreaterThan(0);
		const createdAgents = await db
			.select({ harnessType: users.harnessType, modelId: users.modelId })
			.from(users)
			.where(eq(users.teamId, teamMembersId));

		expect(createdAgents.length).toBeGreaterThan(0);
		for (const agent of createdAgents) {
			expect(agent.harnessType).toBe("builtin");
			expect(agent.modelId).toBe("claude-sonnet-4-6");
		}
	});

	test("POST /api/teams with primaryHarness causes created agents to use that harness", async ({
		db,
		app,
	}) => {
		const res = await app.request("/api/teams", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Claude Code Team via API",
				functions: ["development", "product"],
				primaryHarness: {
					harnessType: "claude-code",
					modelId: "claude-sonnet-4-6",
					modelProvider: "anthropic",
				},
			}),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { teamMembers: { id: string } };
		const teamMembersId = body.teamMembers.id;

		const createdAgents = await db
			.select({ harnessType: users.harnessType })
			.from(users)
			.where(eq(users.teamId, teamMembersId));

		expect(createdAgents.length).toBeGreaterThan(0);
		for (const agent of createdAgents) {
			expect(agent.harnessType).toBe("claude-code");
		}
	});
});
