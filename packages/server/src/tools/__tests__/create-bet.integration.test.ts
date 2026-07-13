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
import { createBetTool } from "@hyperidle/agent-layer";
import { makeContext, NOW } from "@hyperidle/agent-layer";

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
		expect(result.status).toBe("ok");
		if (result.status !== "ok") return;

		expect((result.value as { betId: string; status: string; teamId: string }).status).toBe(
			"draft",
		);
		expect((result.value as { betId: string; status: string; teamId: string }).teamId).toBe(teamId);

		const betRows = await db
			.select()
			.from(bets)
			.where(
				eq(bets.id, (result.value as { betId: string; status: string; teamId: string }).betId),
			);
		expect(betRows).toHaveLength(1);
		expect(betRows[0]!.status).toBe("draft");
		expect(betRows[0]!.teamId).toBe(teamId);
		expect(betRows[0]!.description).toBe("Launch the landing page");
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
		expect(result.status).toBe("ok");
		if (result.status !== "ok") return;

		const [bet] = await db
			.select()
			.from(bets)
			.where(eq(bets.id, (result.value as { betId: string; status: string; teamId: string }).betId))
			.limit(1);
		expect(bet!.doneCondition).toBe("All tests pass");
		expect(bet!.hypothesis).toBe("This will unlock self-serve signups");
	});

	test("returns ok({ betId, status: 'draft', teamId })", async ({ db }) => {
		const { teamId } = await seedTeam(db);

		const result = await createBetTool.handler(
			{ teamId, description: "Some bet" },
			makeContext(db),
		);
		expect(result.status).toBe("ok");
		if (result.status !== "ok") return;

		expect(typeof (result.value as { betId: string; status: string; teamId: string }).betId).toBe(
			"string",
		);
		expect((result.value as { betId: string; status: string; teamId: string }).status).toBe(
			"draft",
		);
		expect((result.value as { betId: string; status: string; teamId: string }).teamId).toBe(teamId);
	});

	test("error when teamId does not exist", async ({ db }) => {
		const result = await createBetTool.handler(
			{ teamId: "team-does-not-exist", description: "Will fail" },
			makeContext(db),
		);
		expect(result.status).toBe("error");
		if (result.status !== "error") return;
		expect(result.message).toMatch(/Team not found/);
	});

	test("error when description is empty (fails Zod min(1))", async ({ db }) => {
		const { teamId } = await seedTeam(db);

		const result = await createBetTool.handler({ teamId, description: "" }, makeContext(db));
		expect(result.status).toBe("error");
	});

	// @lore AD8b: role "chief_of_staff" renamed to "assistant". The AssistantToolShape
	// itself has no roles field; roles filter is applied in tool-registry wrapForRegistry.
	test("createBetTool is an AssistantToolShape (name and handler defined)", () => {
		expect(createBetTool.name).toBe("create_bet");
		expect(typeof createBetTool.handler).toBe("function");
	});
});
