/**
 * AE3 — add_agent tool integration tests.
 *
 * RED phase: these tests will fail until add-agent.ts is implemented.
 */

import { eq } from "drizzle-orm";
import { factorySettings, teamMembers, teams, users } from "@hyperidle/db";
import { describe, expect } from "vitest";
import { test } from "../../test-fixtures.js";
import { makeContext, NOW } from "./_helpers.js";

// Import will fail until the file is created — that's expected in red phase.
import { addAgentTool } from "../add-agent.js";

async function seedTeam(
	db: Parameters<typeof makeContext>[0],
): Promise<{ teamId: string; teamMembersId: string }> {
	const teamId = `team-${Date.now()}`;
	const teamMembersId = `tm-${Date.now()}`;
	await db.insert(teams).values({ id: teamId, name: "Test Team", phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: teamMembersId,
		teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});
	return { teamId, teamMembersId };
}

describe("add_agent tool", () => {
	test("inserts a new agent user row linked to the team's teamMembers", async ({ db }) => {
		const { teamId, teamMembersId } = await seedTeam(db);

		const result = await addAgentTool.handler(
			{ teamId, role: "qa_engineer", name: "QA Bot" },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { agentId: string; name: string; role: string; teamId: string };
		expect(data.name).toBe("QA Bot");
		expect(data.role).toBe("qa_engineer");
		expect(data.teamId).toBe(teamId);

		const agentRows = await db.select().from(users).where(eq(users.id, data.agentId));
		expect(agentRows).toHaveLength(1);
		const agent = agentRows[0];
		expect(agent.kind).toBe("ai");
		expect(agent.status).toBe("active");
		expect(agent.role).toBe("qa_engineer");
		expect(agent.name).toBe("QA Bot");
		// teamId on users references teamMembers.id
		expect(agent.teamId).toBe(teamMembersId);
	});

	test("loads soul template from factorySettings when no explicit soulPrompt", async ({ db }) => {
		const { teamId } = await seedTeam(db);
		await db.insert(factorySettings).values({
			key: "soul_template:qa_engineer",
			value: "You are a QA specialist.",
			updatedAt: NOW,
		});

		const result = await addAgentTool.handler(
			{ teamId, role: "qa_engineer", name: "QA Bot" },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { agentId: string };
		const [agent] = await db.select().from(users).where(eq(users.id, data.agentId)).limit(1);
		expect(agent.soulPrompt).toBe("You are a QA specialist.");
	});

	test("uses explicit soulPrompt override instead of template", async ({ db }) => {
		const { teamId } = await seedTeam(db);
		await db.insert(factorySettings).values({
			key: "soul_template:qa_engineer",
			value: "Default template.",
			updatedAt: NOW,
		});

		const result = await addAgentTool.handler(
			{
				teamId,
				role: "qa_engineer",
				name: "Custom QA",
				soulPrompt: "Custom soul prompt override.",
			},
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { agentId: string };
		const [agent] = await db.select().from(users).where(eq(users.id, data.agentId)).limit(1);
		expect(agent.soulPrompt).toBe("Custom soul prompt override.");
	});

	test("soulPrompt is null when no template and no explicit override", async ({ db }) => {
		const { teamId } = await seedTeam(db);

		const result = await addAgentTool.handler(
			{ teamId, role: "unknown_role_no_template", name: "Mystery Agent" },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { agentId: string };
		const [agent] = await db.select().from(users).where(eq(users.id, data.agentId)).limit(1);
		expect(agent.soulPrompt).toBeNull();
	});

	test("NOT_FOUND for nonexistent teamId", async ({ db }) => {
		const result = await addAgentTool.handler(
			{ teamId: "team-does-not-exist", role: "builder", name: "Builder Bot" },
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	test("returns ok({ agentId, name, role, teamId })", async ({ db }) => {
		const { teamId } = await seedTeam(db);

		const result = await addAgentTool.handler(
			{ teamId, role: "designer", name: "Design Agent" },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { agentId: string; name: string; role: string; teamId: string };
		expect(typeof data.agentId).toBe("string");
		expect(data.name).toBe("Design Agent");
		expect(data.role).toBe("designer");
		expect(data.teamId).toBe(teamId);
	});

	test("tool is restricted to chief_of_staff role", () => {
		expect(addAgentTool.roles).toBeDefined();
		expect(addAgentTool.roles).toContain("chief_of_staff");
	});
});
