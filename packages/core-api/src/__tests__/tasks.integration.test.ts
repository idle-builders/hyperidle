import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../test-fixtures.js";

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

		await db
			.insert(teamMembers)
			.values({ id: "team-1", teamId: "prod-1", capacity: 5, activeBets: 0, formedAt: now });

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

	// AC9: PATCH /api/tasks/:id — update
	describe("AC9: PATCH /api/tasks/:id — update fields", () => {
		test("updates task title", async ({ db, app }) => {
			await seedPrereqs(db);
			await seedTask(db, "t1");

			const res = await app.request("/api/tasks/t1", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ title: "Updated title" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.title).toBe("Updated title");
		});

		test("updates multiple fields at once", async ({ db, app }) => {
			await seedPrereqs(db);
			await seedTask(db, "t1");

			const res = await app.request("/api/tasks/t1", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ title: "New title", description: "New desc" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.title).toBe("New title");
			expect(body.description).toBe("New desc");
		});

		test("returns 404 for non-existent task", async ({ db, app }) => {
			await seedPrereqs(db);
			const res = await app.request("/api/tasks/nonexistent", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ title: "New" }),
			});
			expect(res.status).toBe(404);
		});
	});

	// AC10: POST /api/tasks/:id/transition — state transition (validates)
	describe("AC10: POST /api/tasks/:id/transition — state transition", () => {
		test("transitions proposed→accepted", async ({ db, app }) => {
			await seedPrereqs(db);
			await seedTask(db, "t1", { state: "proposed" });

			const res = await app.request("/api/tasks/t1/transition", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ state: "accepted" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.state).toBe("accepted");
		});

		test("emits task_state_changed event", async ({ db, app, eventBus }) => {
			await seedPrereqs(db);
			await seedTask(db, "t1", { state: "proposed" });
			const events: unknown[] = [];
			eventBus.on("task_state_changed", (e) => events.push(e));

			await app.request("/api/tasks/t1/transition", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ state: "accepted" }),
			});

			expect(events.length).toBe(1);
		});

		test("rejects invalid transition (409)", async ({ db, app }) => {
			await seedPrereqs(db);
			await seedTask(db, "t1", { state: "proposed" });

			const res = await app.request("/api/tasks/t1/transition", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ state: "done" }),
			});

			// InvalidTransitionError from task-state-machine uses a local class
			// The error handler checks by name pattern
			expect(res.status).toBe(409);
		});

		test("returns 404 for non-existent task", async ({ db, app }) => {
			await seedPrereqs(db);
			const res = await app.request("/api/tasks/nonexistent/transition", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ state: "accepted" }),
			});
			expect(res.status).toBe(404);
		});

		test("returns 400 for missing state in body", async ({ db, app }) => {
			await seedPrereqs(db);
			await seedTask(db, "t1");

			const res = await app.request("/api/tasks/t1/transition", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(400);
		});
	});
});
