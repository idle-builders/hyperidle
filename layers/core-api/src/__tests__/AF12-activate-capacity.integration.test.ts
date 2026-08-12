/**
 * AF12 — AC1: Activating a draft bet at team capacity returns a clean 409
 * (CONFLICT) the UI can show — NOT a 500.
 *
 * The happy path (draft → active = 200) is already covered by
 * R7-bet-lifecycle.integration.test.ts. This file pins the capacity-exceeded
 * branch: `transitionBet(..., 'active')` throws `CapacityExceededError`, which
 * propagates to the global error handler and is mapped to 409 CONFLICT.
 *
 * @lore AF12: 409 (not 400) is the system-wide contract for capacity conflicts —
 * see middleware/error-handler.ts (CapacityExceededError → 409 CONFLICT) and the
 * `@lore U2` on bets.integration.test.ts E3 ("409 is reserved for capacity
 * conflicts"). The `/commit` handler must NOT locally map CapacityExceededError
 * to 400; an earlier AF12 plan did so on the false premise that it otherwise 500s.
 */

import { bets, teamMembers, teams } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-af12-capacity";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

describe("AF12 AC1 — activate at capacity returns 409", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("POST /bets/:id/commit at full capacity returns 409 CONFLICT", async ({ db, app, ids }) => {
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: ids("prod-1"), name: "Test", phase: "build", createdAt: now });
		// Team is at capacity: capacity 1, activeBets 1.
		await db.insert(teamMembers).values({
			id: ids("team-1"),
			teamId: ids("prod-1"),
			capacity: 1,
			activeBets: 1,
			formedAt: now,
		});
		await db.insert(bets).values({
			id: ids("bet-draft"),
			teamId: ids("prod-1"),
			description: "Test",
			appetite: "small",
			status: "draft",
			createdAt: now,
		});

		const res = await app.request(`/api/bets/${ids("bet-draft")}/commit`, {
			method: "POST",
			headers: authHeaders(),
		});

		expect(res.status).toBe(409);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("CONFLICT");

		// The bet stayed draft — the failed activate did not partially apply.
		const [bet] = await db
			.select()
			.from(bets)
			.where(eq(bets.id, ids("bet-draft")));
		expect(bet?.status).toBe("draft");
	});
});
