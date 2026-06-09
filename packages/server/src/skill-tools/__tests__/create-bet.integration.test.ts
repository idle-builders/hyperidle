/**
 * AE3 — create_bet tool integration tests.
 *
 * RED phase: these tests will fail until create-bet.ts is implemented.
 */

import { bets, teamMembers, teams } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../../test-fixtures.js";
// Import will fail until the file is created — that's expected in red phase.
import { createBetTool } from "../create-bet.js";
import { makeContext, NOW } from "./_helpers.js";

async function seedTeam(db: Parameters<typeof makeContext>[0]): Promise<{ teamId: string }> {
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
	return { teamId };
}

describe("create_bet tool", () => {
	test("inserts a bets row with status=draft and the given teamId", async ({ db }) => {
		const { teamId } = await seedTeam(db);

		const result = await createBetTool.handler(
			{ teamId, description: "Launch the landing page" },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { betId: string; status: "draft"; teamId: string };
		expect(data.status).toBe("draft");
		expect(data.teamId).toBe(teamId);

		const betRows = await db.select().from(bets).where(eq(bets.id, data.betId));
		expect(betRows).toHaveLength(1);
		expect(betRows[0].status).toBe("draft");
		expect(betRows[0].teamId).toBe(teamId);
		expect(betRows[0].description).toBe("Launch the landing page");
	});

	test("stores optional doneCondition and hypothesis", async ({ db }) => {
		const { teamId } = await seedTeam(db);

		const result = await createBetTool.handler(
			{
				teamId,
				description: "Build auth system",
				doneCondition: "All tests pass",
				hypothesis: "This will unlock self-serve signups",
			},
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { betId: string };
		const [bet] = await db.select().from(bets).where(eq(bets.id, data.betId)).limit(1);
		expect(bet.doneCondition).toBe("All tests pass");
		expect(bet.hypothesis).toBe("This will unlock self-serve signups");
	});

	test("returns ok({ betId, status: 'draft', teamId })", async ({ db }) => {
		const { teamId } = await seedTeam(db);

		const result = await createBetTool.handler(
			{ teamId, description: "Some bet" },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { betId: string; status: string; teamId: string };
		expect(typeof data.betId).toBe("string");
		expect(data.status).toBe("draft");
		expect(data.teamId).toBe(teamId);
	});

	test("NOT_FOUND for nonexistent teamId", async ({ db }) => {
		const result = await createBetTool.handler(
			{ teamId: "team-does-not-exist", description: "Will fail" },
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	test("INVALID_INPUT when description is empty (fails Zod min(1))", async ({ db }) => {
		const { teamId } = await seedTeam(db);

		const result = await createBetTool.handler({ teamId, description: "" }, makeContext(db));
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});

	test("tool is restricted to chief_of_staff role", () => {
		expect(createBetTool.roles).toBeDefined();
		expect(createBetTool.roles).toContain("chief_of_staff");
	});
});
