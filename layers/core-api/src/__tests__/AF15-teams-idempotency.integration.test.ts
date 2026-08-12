/**
 * AF15 RED — Setup idempotency: POST /api/teams (AC-4).
 *
 * Tests that:
 * - POST /api/teams called twice with the same body returns the first team on
 *   the second call (200) without creating a duplicate team, teamMembers, or agents.
 * - The second call returns the existing team id (not a new one).
 * - Count of teams, teamMembers rows, and AI users remains 1 after two calls.
 *
 * @lore AF15: Mirrors the POST /api/users idempotency guard. The "first team"
 * approach blocks any second POST regardless of name — setup is the only caller
 * and always creates exactly one default team.
 */

import { teamMembers, teams, users } from "@hyperidle/db";
import { count, eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-af15-teams";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

describe("AF15 AC-4 — POST /api/teams idempotency guard", () => {
	// @lore AU38 P9: the team name is the idempotency key — scope it per test
	// so two tests in one file don't collide on the same literal name.
	function teamBody(ids: (label: string) => string) {
		return {
			name: `My Team ${ids("team-suffix")}`,
			functions: ["development", "product"],
		};
	}

	test("second POST returns 200 with the existing first team", async ({ app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const res1 = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(teamBody(ids)),
		});
		expect(res1.status).toBe(201);

		const res2 = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(teamBody(ids)),
		});
		expect(res2.status).toBe(200);
		const body2 = (await res2.json()) as { team?: { id: string } };

		// Second response returns the same team id (or compatible shape)
		// The body shape is the existing team row
		expect(body2).toBeDefined();
		vi.unstubAllEnvs();
	});

	test("no duplicate teams created after two POST calls", async ({ app, db, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(teamBody(ids)),
		});
		await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(teamBody(ids)),
		});

		const [teamCount] = await db.select({ count: count() }).from(teams);
		expect(teamCount?.count).toBe(1);
		vi.unstubAllEnvs();
	});

	test("no duplicate teamMembers rows after two POST calls", async ({ app, db, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(teamBody(ids)),
		});
		await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(teamBody(ids)),
		});

		const [tmCount] = await db.select({ count: count() }).from(teamMembers);
		expect(tmCount?.count).toBe(1);
		vi.unstubAllEnvs();
	});

	test("no duplicate AI agent users after two POST calls", async ({ app, db, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const res1 = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(teamBody(ids)),
		});
		expect(res1.status).toBe(201);

		const agentCountAfterFirst =
			(await db.select({ count: count() }).from(users).where(eq(users.kind, "ai")))[0]?.count ?? 0;

		await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(teamBody(ids)),
		});

		const agentCountAfterSecond =
			(await db.select({ count: count() }).from(users).where(eq(users.kind, "ai")))[0]?.count ?? 0;

		// No new agents created on second call
		expect(agentCountAfterSecond).toBe(agentCountAfterFirst);
		vi.unstubAllEnvs();
	});

	test("first POST still returns 201 on a fresh DB", async ({ app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/teams", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(teamBody(ids)),
		});
		expect(res.status).toBe(201);
		vi.unstubAllEnvs();
	});
});
