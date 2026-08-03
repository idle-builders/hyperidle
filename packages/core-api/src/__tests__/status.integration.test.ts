import { bets, type HyperIdleDb, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-status";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({
		id: "prod-1",
		name: "Test Product",
		phase: "build",
		createdAt: now,
	});
	await db.insert(teamMembers).values({
		id: "team-1",
		teamId: "prod-1",
		capacity: 3,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values([
		{
			id: "agent-1",
			name: "Builder Bot",
			role: "builder",
			status: "idle",
			teamId: "team-1",
			createdAt: now,
		},
		{
			id: "agent-2",
			name: "Growth Bot",
			role: "growth",
			status: "active",
			teamId: "team-1",
			createdAt: now,
		},
	]);
	await db.insert(bets).values({
		id: "bet-1",
		teamId: "prod-1",
		description: "Test",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "task-1",
		betId: "bet-1",
		teamId: "prod-1",
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
		test("returns status with zero active sessions", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/status", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.activeSessions).toBe(0);
			expect(body).toHaveProperty("agentStates");
			expect(body).toHaveProperty("uptime");

			const agentStates = body.agentStates as Record<string, number>;
			expect(agentStates.idle).toBe(1);
			expect(agentStates.active).toBe(1);
		});

		test("counts active sessions correctly", async ({ db, app }) => {
			await seedBase(db);
			// Create active session
			await db.insert(sessions).values({
				id: "sess-1",
				agentId: "agent-1",
				taskId: "task-1",
				modelTier: "workhorse",
				startedAt: new Date().toISOString(),
				state: "active",
			});

			// Create done session (should not count)
			await db.insert(sessions).values({
				id: "sess-2",
				agentId: "agent-2",
				taskId: "task-1",
				modelTier: "fast",
				startedAt: new Date().toISOString(),
				state: "done",
				endedAt: new Date().toISOString(),
			});

			const res = await app.request("/api/status", { headers: authHeaders() });
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.activeSessions).toBe(1);
		});

		// @lore AU18: `factory_start_time` settability is retired (no production
		// writer ever existed — the read always fell back to SERVER_START_TIME
		// already). `uptime` is now always a non-empty ISO timestamp string.
		test("uptime is a non-empty ISO timestamp (SERVER_START_TIME fallback, always)", async ({
			db,
			app,
		}) => {
			await seedBase(db);
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
	// (notifications/observability/git-export config tests cover those).
	// No web client depended on the raw-rows shape (confirmed via grep).
});
