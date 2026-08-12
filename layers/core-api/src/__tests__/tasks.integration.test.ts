import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
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

	async function seedPrereqs(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: ids("prod-1"), name: "Test Product", phase: "build", createdAt: now });

		await db.insert(teamMembers).values({
			id: ids("team-1"),
			teamId: ids("prod-1"),
			capacity: 5,
			activeBets: 0,
			formedAt: now,
		});

		await db.insert(bets).values({
			id: ids("bet-1"),
			teamId: ids("prod-1"),
			description: "Test bet",
			appetite: "small",
			status: "active",
			createdAt: now,
		});

		// Seed agents for FK references
		await db.insert(users).values({
			id: ids("agent-1"),
			name: "Agent 1",
			role: "builder",
			status: "active",
			createdAt: now,
		});

		await db.insert(users).values({
			id: ids("agent-2"),
			name: "Agent 2",
			role: "builder",
			status: "active",
			createdAt: now,
		});
	}

	async function seedTask(
		db: HyperIdleDb,
		ids: ScopedIds,
		id: string,
		overrides?: Partial<typeof tasks.$inferInsert>,
	): Promise<void> {
		const now = new Date().toISOString();
		await db.insert(tasks).values({
			id,
			betId: ids("bet-1"),
			teamId: ids("prod-1"),
			title: `Task ${id}`,
			state: "proposed",
			createdAt: now,
			updatedAt: now,
			...overrides,
		});
	}

	// AC8: GET /api/tasks — list, filterable by bet_id, state, owner
	describe("AC8: GET /api/tasks — list with filters", () => {
		test("returns all tasks", async ({ db, app, ids }) => {
			await seedPrereqs(db, ids);
			await seedTask(db, ids, ids("t1"));
			await seedTask(db, ids, ids("t2"));

			const res = await app.request("/api/tasks", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<Record<string, unknown>>;
			const mine = body.filter((t) => t.id === ids("t1") || t.id === ids("t2"));
			expect(mine).toHaveLength(2);
		});

		test("filters by bet_id", async ({ db, app, ids }) => {
			await seedPrereqs(db, ids);
			await seedTask(db, ids, ids("t1"));
			// Create another bet and task
			await db.insert(bets).values({
				id: ids("bet-2"),
				teamId: ids("prod-1"),
				description: "Other bet",
				appetite: "medium",
				status: "draft",
				createdAt: new Date().toISOString(),
			});

			seedTask(db, ids, ids("t2"), { betId: ids("bet-2") });

			const res = await app.request(`/api/tasks?bet_id=${ids("bet-1")}`, {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<Record<string, unknown>>;
			const mine = body.filter((t) => t.id === ids("t1"));
			expect(mine).toHaveLength(1);
		});

		test("filters by state", async ({ db, app, ids }) => {
			await seedPrereqs(db, ids);
			await seedTask(db, ids, ids("t1"), { state: "proposed" });
			await seedTask(db, ids, ids("t2"), { state: "in_progress" });

			const res = await app.request("/api/tasks?state=in_progress", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<Record<string, unknown>>;
			const mine = body.filter((t) => t.id === ids("t2"));
			expect(mine).toHaveLength(1);
		});

		test("filters by owner", async ({ db, app, ids }) => {
			await seedPrereqs(db, ids);
			await seedTask(db, ids, ids("t1"), { ownerAgentId: ids("agent-1") });
			await seedTask(db, ids, ids("t2"), { ownerAgentId: ids("agent-2") });

			const res = await app.request(`/api/tasks?owner=${ids("agent-1")}`, {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<Record<string, unknown>>;
			const mine = body.filter((t) => t.id === ids("t1"));
			expect(mine).toHaveLength(1);
		});

		test("returns empty array when no tasks match", async ({ db, app, ids }) => {
			await seedPrereqs(db, ids);
			const res = await app.request("/api/tasks?state=done", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<Record<string, unknown>>;
			expect(body).toHaveLength(0);
		});
	});

	// AC9: PATCH /api/tasks/:id — update
	describe("AC9: PATCH /api/tasks/:id — update fields", () => {
		test("updates task title", async ({ db, app, ids }) => {
			await seedPrereqs(db, ids);
			await seedTask(db, ids, ids("t1"));

			const res = await app.request(`/api/tasks/${ids("t1")}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ title: "Updated title" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.title).toBe("Updated title");
		});

		test("updates multiple fields at once", async ({ db, app, ids }) => {
			await seedPrereqs(db, ids);
			await seedTask(db, ids, ids("t1"));

			const res = await app.request(`/api/tasks/${ids("t1")}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ title: "New title", description: "New desc" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.title).toBe("New title");
			expect(body.description).toBe("New desc");
		});

		test("returns 404 for non-existent task", async ({ db, app, ids }) => {
			await seedPrereqs(db, ids);
			const res = await app.request(`/api/tasks/${ids("nonexistent")}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ title: "New" }),
			});
			expect(res.status).toBe(404);
		});
	});

	// AC10: POST /api/tasks/:id/transition — state transition (validates)
	describe("AC10: POST /api/tasks/:id/transition — state transition", () => {
		test("transitions proposed→accepted", async ({ db, app, ids }) => {
			await seedPrereqs(db, ids);
			await seedTask(db, ids, ids("t1"), { state: "proposed" });

			const res = await app.request(`/api/tasks/${ids("t1")}/transition`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ state: "accepted" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.state).toBe("accepted");
		});

		test("emits task_state_changed event", async ({ db, app, eventBus, ids }) => {
			await seedPrereqs(db, ids);
			await seedTask(db, ids, ids("t1"), { state: "proposed" });
			const events: unknown[] = [];
			eventBus.on("task_state_changed", (e) => events.push(e));

			await app.request(`/api/tasks/${ids("t1")}/transition`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ state: "accepted" }),
			});

			expect(events.length).toBe(1);
		});

		test("rejects invalid transition (409)", async ({ db, app, ids }) => {
			await seedPrereqs(db, ids);
			await seedTask(db, ids, ids("t1"), { state: "proposed" });

			const res = await app.request(`/api/tasks/${ids("t1")}/transition`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ state: "done" }),
			});

			// InvalidTransitionError from task-state-machine uses a local class
			// The error handler checks by name pattern
			expect(res.status).toBe(409);
		});

		test("returns 404 for non-existent task", async ({ db, app, ids }) => {
			await seedPrereqs(db, ids);
			const res = await app.request(`/api/tasks/${ids("nonexistent")}/transition`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ state: "accepted" }),
			});
			expect(res.status).toBe(404);
		});

		test("returns 400 for missing state in body", async ({ db, app, ids }) => {
			await seedPrereqs(db, ids);
			await seedTask(db, ids, ids("t1"));

			const res = await app.request(`/api/tasks/${ids("t1")}/transition`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(400);
		});
	});
});
