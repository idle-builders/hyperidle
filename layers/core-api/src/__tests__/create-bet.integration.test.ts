/**
 * AE3 — create_bet tool integration tests.
 *
 * @lore AU21 §9 Increment 1: create_bet now routes through the CoreApiPort
 * write seam (a real `POST /bets` route call, not the raw `ports.work.createBet`
 * DI call — deleted). Every test that actually invokes the handler now needs
 * the `app` fixture + a registered in-process transport + a stubbed
 * HYPERIDLE_API_KEY (same convention `bets.integration.test.ts` already
 * uses for every real route call). The two error-path tests below (missing
 * team / empty description) never reach the seam — they fail earlier, at
 * schema validation or the raw `ports.org.getTeamById` lookup — so they stay
 * exactly as they were.
 */

import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { bets, teams } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, describe, expect } from "vitest";
import { test, vi } from "../__testing__/test-fixtures.js";

afterEach(() => vi.unstubAllEnvs());

import { makeContext, NOW } from "./_helpers.js";

/**
 * @lore AU31 §3.2/B2: the tool is built fresh per test off THIS test's own
 * `app` (`createInProcessCoreApiTransport`) — no ambient transport global to
 * register. `buildToolDefinitions` only needs an `app` to exist, so the
 * factory works whether or not the test also touches `db`.
 */
function buildCreateBetTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app)).find(
		(t) => t.name === "create_bet",
	)!;
}

const TEST_API_KEY = "create-bet-test-key";

async function seedTeam(db: Parameters<typeof makeContext>[0]): Promise<{ teamId: string }> {
	const teamId = `team-${Date.now()}`;
	await db.insert(teams).values({ id: teamId, name: "Test Team", phase: "build", createdAt: NOW });
	return { teamId };
}

describe("create_bet tool", () => {
	test("inserts a bets row with status=draft and the given teamId", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const createBetTool = buildCreateBetTool(app);
		const { teamId } = await seedTeam(db);

		const result = await createBetTool.handler(
			{ teamId, description: "Launch the landing page" },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { betId: string; status: string; teamId: string };
		expect(data.status).toBe("draft");
		expect(data.teamId).toBe(teamId);

		const betRows = await db.select().from(bets).where(eq(bets.id, data.betId));
		expect(betRows).toHaveLength(1);
		expect(betRows[0]!.status).toBe("draft");
		expect(betRows[0]!.teamId).toBe(teamId);
		expect(betRows[0]!.description).toBe("Launch the landing page");
	});

	test("stores optional doneCondition and hypothesis", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const createBetTool = buildCreateBetTool(app);
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

		const betId = (result.data as { betId: string }).betId;
		const [bet] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
		expect(bet!.doneCondition).toBe("All tests pass");
		expect(bet!.hypothesis).toBe("This will unlock self-serve signups");
	});

	test("returns ok({ betId, status: 'draft', teamId })", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const createBetTool = buildCreateBetTool(app);
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

	test("error when teamId does not exist", async ({ db, app }) => {
		const createBetTool = buildCreateBetTool(app);
		const result = await createBetTool.handler(
			{ teamId: "team-does-not-exist", description: "Will fail" },
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error).toMatch(/Team not found/);
	});

	test("error when description is empty (fails Zod min(1))", async ({ db, app }) => {
		const createBetTool = buildCreateBetTool(app);
		const { teamId } = await seedTeam(db);

		const result = await createBetTool.handler({ teamId, description: "" }, makeContext(db));
		expect(result.success).toBe(false);
	});

	test("createBetTool is a ToolDefinition (name and handler defined)", ({ app }) => {
		const createBetTool = buildCreateBetTool(app);
		expect(createBetTool.name).toBe("create_bet");
		expect(typeof createBetTool.handler).toBe("function");
	});
});
