/**
 * AF12 — AC1: Activating a draft bet at team capacity returns a clean 400
 * (VALIDATION_ERROR) the UI can show — NOT a 500.
 *
 * The happy path (draft → active = 200) is already covered by
 * R7-bet-lifecycle.integration.test.ts. This file pins the capacity-exceeded
 * branch: `transitionBet(..., 'active')` throws `CapacityExceededError`, which
 * the `/commit` handler must catch and map to 400.
 *
 * @lore AF12 RED: `/commit` currently catches only `InvalidTransitionError`, so
 * a capacity-at-limit activate falls through to the global handler → 500. This
 * test fails (gets 500) until the green phase adds the CapacityExceededError catch.
 */

import { bets, teamMembers, teams } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-af12-capacity";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

describe("AF12 AC1 — activate at capacity returns 400", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("POST /bets/:id/commit at full capacity returns 400 VALIDATION_ERROR", async ({
		db,
		app,
	}) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: "prod-1", name: "Test", phase: "build", createdAt: now });
		// Team is at capacity: capacity 1, activeBets 1.
		await db
			.insert(teamMembers)
			.values({ id: "team-1", teamId: "prod-1", capacity: 1, activeBets: 1, formedAt: now });
		await db.insert(bets).values({
			id: "bet-draft",
			teamId: "prod-1",
			description: "Test",
			appetite: "small",
			status: "draft",
			createdAt: now,
		});

		const res = await app.request("/api/bets/bet-draft/commit", {
			method: "POST",
			headers: authHeaders(),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("VALIDATION_ERROR");

		// The bet stayed draft — the failed activate did not partially apply.
		const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-draft"));
		expect(bet?.status).toBe("draft");
	});
});
