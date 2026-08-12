import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-status";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedBase(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({
		id: ids("prod-1"),
		name: "Test Product",
		phase: "build",
		createdAt: now,
	});
	await db.insert(teamMembers).values({
		id: ids("team-1"),
		teamId: ids("prod-1"),
		capacity: 3,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values([
		{
			id: ids("agent-1"),
			name: "Builder Bot",
			role: "builder",
			status: "idle",
			teamId: ids("team-1"),
			createdAt: now,
		},
		{
			id: ids("agent-2"),
			name: "Growth Bot",
			role: "growth",
			status: "active",
			teamId: ids("team-1"),
			createdAt: now,
		},
	]);
	await db.insert(bets).values({
		id: ids("bet-1"),
		teamId: ids("prod-1"),
		description: "Test",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: ids("task-1"),
		betId: ids("bet-1"),
		teamId: ids("prod-1"),
		title: "Test Task",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
}

describe("Status Endpoints (E6)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC12: GET /api/status — factory-wide status
	describe("AC12: GET /api/status — factory-wide status", () => {
		// @lore AU26 J1: `activeSessions` is gone from this response — it was a raw
		// `sessions` read on a route with zero consumers repo-wide. The absence is
		// pinned by `AU26-J1-run-read-deletions.integration.test.ts`.
		test("returns the agent-state census and uptime", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request("/api/status", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toHaveProperty("agentStates");
			expect(body).toHaveProperty("uptime");

			const agentStates = body.agentStates as Record<string, number>;
			expect(agentStates.idle).toBe(1);
			expect(agentStates.active).toBe(1);
		});

		// @lore AU18: `factory_start_time` settability is retired (no production
		// writer ever existed — the read always fell back to SERVER_START_TIME
		// already). `uptime` is now always a non-empty ISO timestamp string.
		test("uptime is a non-empty ISO timestamp (SERVER_START_TIME fallback, always)", async ({
			db,
			app,
			ids,
		}) => {
			await seedBase(db, ids);
			const res = await app.request("/api/status", { headers: authHeaders() });
			const body = (await res.json()) as Record<string, unknown>;
			expect(typeof body.uptime).toBe("string");
			expect(() => new Date(body.uptime as string).toISOString()).not.toThrow();
		});
	});

	// @lore AU18: the generic `GET`/`PATCH /api/status/settings` catch-all
	// (AC13/AC14, I1 security-H1 redaction) is retired along with
	// `factorySettings` — every legitimate key it carried now has a
	// domain-specific route backed by `server_config`
	// (the notifications config tests cover those).
	// No web client depended on the raw-rows shape (confirmed via grep).
});
