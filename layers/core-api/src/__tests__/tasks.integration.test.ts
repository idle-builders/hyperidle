import { bets, type HyperIdleDb, tasks, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-tasks";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("Task Endpoints (E3)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	async function seedPrereqs(db: HyperIdleDb): Promise<void> {
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: now });

		
		await db.insert(bets).values({
			id: "bet-1",
			teamId: "prod-1",
			description: "Test bet",
			appetite: "small",
			status: "active",
			createdAt: now,
		});

		// Seed agents for FK references
		await db.insert(users).values({
			id: "agent-1",
			name: "Agent 1",
			role: "builder",
			status: "active",
			createdAt: now,
		});

		await db.insert(users).values({
			id: "agent-2",
			name: "Agent 2",
			role: "builder",
			status: "active",
			createdAt: now,
		});
	}

	async function seedTask(
		db: HyperIdleDb,
		id: string,
		overrides?: Partial<typeof tasks.$inferInsert>,
	): Promise<void> {
		const now = new Date().toISOString();
		await db.insert(tasks).values({
			id,
			betId: "bet-1",
			teamId: "prod-1",
			title: `Task ${id}`,
			state: "proposed",
			createdAt: now,
			updatedAt: now,
			...overrides,
		});
	}

	// AC8: GET /api/tasks — list, filterable by bet_id, state, owner
	describe("AC8: GET /api/tasks — list with filters", () => {
		test("returns all tasks", async ({ db, app }) => {
			await seedPrereqs(db);
			await seedTask(db, "t1");
			await seedTask(db, "t2");

			const res = await app.request("/api/tasks", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown[];
			expect(body).toHaveLength(2);
		});

		test("filters by bet_id", async ({ db, app }) => {
			await seedPrereqs(db);
			await seedTask(db, "t1");
			// Create another bet and task
			await db.insert(bets).values({
				id: "bet-2",
				teamId: "prod-1",
				description: "Other bet",
				appetite: "medium",
				status: "draft",
				createdAt: new Date().toISOString(),
			});

			seedTask(db, "t2", { betId: "bet-2" });

			const res = await app.request("/api/tasks?bet_id=bet-1", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown[];
			expect(body).toHaveLength(1);
		});

		test("filters by state", async ({ db, app }) => {
			await seedPrereqs(db);
			await seedTask(db, "t1", { state: "proposed" });
			await seedTask(db, "t2", { state: "in_progress" });

			const res = await app.request("/api/tasks?state=in_progress", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown[];
			expect(body).toHaveLength(1);
		});

		test("filters by owner", async ({ db, app }) => {
			await seedPrereqs(db);
			await seedTask(db, "t1", { ownerAgentId: "agent-1" });
			await seedTask(db, "t2", { ownerAgentId: "agent-2" });

			const res = await app.request("/api/tasks?owner=agent-1", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown[];
			expect(body).toHaveLength(1);
		});

		test("returns empty array when no tasks match", async ({ db, app }) => {
			await seedPrereqs(db);
			const res = await app.request("/api/tasks?state=done", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown[];
			expect(body).toHaveLength(0);
		});
	});

	// PATCH /api/tasks/:id (door #39) and POST /api/tasks/:id/transition (door #40) deleted.
	// Tests removed with the routes.
});
