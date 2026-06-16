/**
 * AE3 — add_agent tool integration tests.
 *
 * RED phase: these tests will fail until add-agent.ts is implemented.
 */

import { factorySettings, teamMembers, teams, users } from "@hyperidle/db";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";
// Import will fail until the file is created — that's expected in red phase.
import { addAgentTool } from "../add-agent.js";
import { makeContext, NOW } from "./_helpers.js";

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
	// AK6: add_agent tool handler calls getActiveStrategy() — need a strategy registered.

	test("inserts a new agent user row linked to the team's teamMembers", async ({ db }) => {
		const { teamId, teamMembersId } = await seedTeam(db);

		// Minimal strategy for structural test — role preserved via caller-supplied name.
		setActiveStrategy(minimalStrategy);
		try {
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
			expect(agent!.kind).toBe("ai");
			expect(agent!.status).toBe("active");
			expect(agent!.role).toBe("qa_engineer");
			expect(agent!.name).toBe("QA Bot");
			// teamId on users references teamMembers.id
			expect(agent!.teamId).toBe(teamMembersId);
		} finally {
			clearActiveStrategy();
		}
	});

	test("loads system template from factorySettings when no explicit systemPrompt", async ({
		db,
	}) => {
		const { teamId } = await seedTeam(db);
		await db.insert(factorySettings).values({
			key: "system_template:qa_engineer",
			value: "You are a QA specialist.",
			updatedAt: NOW,
		});

		// Fabric strategy reads system_template:<role> for persona
		const { fabricStrategy } = await import("@hyperidle/fabric");
		setActiveStrategy(fabricStrategy);
		try {
			const result = await addAgentTool.handler(
				{ teamId, role: "qa_engineer", name: "QA Bot" },
				makeContext(db),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { agentId: string };
			const [agent] = await db.select().from(users).where(eq(users.id, data.agentId)).limit(1);
			expect(agent!.systemPrompt).toBe("You are a QA specialist.");
		} finally {
			clearActiveStrategy();
		}
	});

	test("uses explicit systemPrompt override instead of template", async ({ db }) => {
		const { teamId } = await seedTeam(db);
		await db.insert(factorySettings).values({
			key: "system_template:qa_engineer",
			value: "Default template.",
			updatedAt: NOW,
		});

		// Any strategy works for override — the override replaces the Strategy's spec.
		setActiveStrategy(minimalStrategy);
		try {
			const result = await addAgentTool.handler(
				{
					teamId,
					role: "qa_engineer",
					name: "Custom QA",
					systemPrompt: "Custom system prompt override.",
				},
				makeContext(db),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { agentId: string };
			const [agent] = await db.select().from(users).where(eq(users.id, data.agentId)).limit(1);
			expect(agent!.systemPrompt).toBe("Custom system prompt override.");
		} finally {
			clearActiveStrategy();
		}
	});

	test("systemPrompt is null when no template and no explicit override", async ({ db }) => {
		const { teamId } = await seedTeam(db);

		// Minimal strategy always returns null systemPrompt.
		setActiveStrategy(minimalStrategy);
		try {
			const result = await addAgentTool.handler(
				{ teamId, role: "unknown_role_no_template", name: "Mystery Agent" },
				makeContext(db),
			);
			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { agentId: string };
			const [agent] = await db.select().from(users).where(eq(users.id, data.agentId)).limit(1);
			expect(agent!.systemPrompt).toBeNull();
		} finally {
			clearActiveStrategy();
		}
	});

	test("NOT_FOUND for nonexistent teamId", async ({ db }) => {
		setActiveStrategy(minimalStrategy);
		try {
			const result = await addAgentTool.handler(
				{ teamId: "team-does-not-exist", role: "builder", name: "Builder Bot" },
				makeContext(db),
			);
			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("NOT_FOUND");
		} finally {
			clearActiveStrategy();
		}
	});

	test("returns ok({ agentId, name, role, teamId })", async ({ db }) => {
		const { teamId } = await seedTeam(db);

		setActiveStrategy(minimalStrategy);
		try {
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
		} finally {
			clearActiveStrategy();
		}
	});

	// @lore AD8b: role "chief_of_staff" renamed to "assistant".
	test("tool is restricted to assistant role", () => {
		expect(addAgentTool.roles).toBeDefined();
		expect(addAgentTool.roles).toContain("assistant");
	});
});
