import { bets, createTestDb, type HyperIdleDb, products, tasks, teams, users ,
	type TestDbHandle
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-tasks";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("Task Endpoints (E3)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });

		// Seed product, team, and a bet
		const now = new Date().toISOString();
		await db.insert(products)
			.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: now })

		await db.insert(teams)
			.values({ id: "team-1", productId: "prod-1", capacity: 5, activeBets: 0, formedAt: now })

		await db.insert(bets)
			.values({
				id: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				pitch: "Test bet",
				appetite: "small",
				status: "in_progress",
				createdAt: now,
			})

		// Seed agents for FK references
		await db.insert(users)
			.values({ id: "agent-1", name: "Agent 1", role: "builder", status: "active", createdAt: now })

		await db.insert(users)
			.values({ id: "agent-2", name: "Agent 2", role: "builder", status: "active", createdAt: now })

	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

	function seedTask(id: string, overrides?: Record<string, unknown>): void {
		const now = new Date().toISOString();
		await db.insert(tasks)
			.values({
				id,
				betId: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				title: `Task ${id}`,
				state: "proposed",
				createdAt: now,
				updatedAt: now,
				...overrides,
			} as Record<string, unknown>)

	}

	// AC8: GET /api/tasks — list, filterable by bet_id, state, owner
	describe("AC8: GET /api/tasks — list with filters", () => {
		it("returns all tasks", async () => {
			seedTask("t1");
			seedTask("t2");

			const res = await app.request("/api/tasks", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown[];
			expect(body).toHaveLength(2);
		});

		it("filters by bet_id", async () => {
			seedTask("t1");
			// Create another bet and task
			await db.insert(bets)
				.values({
					id: "bet-2",
					productId: "prod-1",
					teamId: "team-1",
					pitch: "Other bet",
					appetite: "medium",
					status: "shaped",
					createdAt: new Date().toISOString(),
				})

			seedTask("t2", { betId: "bet-2" });

			const res = await app.request("/api/tasks?bet_id=bet-1", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown[];
			expect(body).toHaveLength(1);
		});

		it("filters by state", async () => {
			seedTask("t1", { state: "proposed" });
			seedTask("t2", { state: "in_progress" });

			const res = await app.request("/api/tasks?state=in_progress", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown[];
			expect(body).toHaveLength(1);
		});

		it("filters by owner", async () => {
			seedTask("t1", { ownerAgentId: "agent-1" });
			seedTask("t2", { ownerAgentId: "agent-2" });

			const res = await app.request("/api/tasks?owner=agent-1", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown[];
			expect(body).toHaveLength(1);
		});

		it("returns empty array when no tasks match", async () => {
			const res = await app.request("/api/tasks?state=done", { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown[];
			expect(body).toHaveLength(0);
		});
	});

	// AC9: PATCH /api/tasks/:id — update
	describe("AC9: PATCH /api/tasks/:id — update fields", () => {
		it("updates task title", async () => {
			seedTask("t1");

			const res = await app.request("/api/tasks/t1", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ title: "Updated title" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.title).toBe("Updated title");
		});

		it("updates multiple fields at once", async () => {
			seedTask("t1");

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

		it("returns 404 for non-existent task", async () => {
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
		it("transitions proposed→accepted", async () => {
			seedTask("t1", { state: "proposed" });

			const res = await app.request("/api/tasks/t1/transition", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ state: "accepted" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.state).toBe("accepted");
		});

		it("emits task_state_changed event", async () => {
			seedTask("t1", { state: "proposed" });
			const events: unknown[] = [];
			eventBus.on("task_state_changed", (e) => events.push(e));

			await app.request("/api/tasks/t1/transition", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ state: "accepted" }),
			});

			expect(events.length).toBe(1);
		});

		it("rejects invalid transition (409)", async () => {
			seedTask("t1", { state: "proposed" });

			const res = await app.request("/api/tasks/t1/transition", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ state: "done" }),
			});

			// InvalidTransitionError from task-state-machine uses a local class
			// The error handler checks by name pattern
			expect(res.status).toBe(409);
		});

		it("returns 404 for non-existent task", async () => {
			const res = await app.request("/api/tasks/nonexistent/transition", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ state: "accepted" }),
			});
			expect(res.status).toBe(404);
		});

		it("returns 400 for missing state in body", async () => {
			seedTask("t1");

			const res = await app.request("/api/tasks/t1/transition", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(400);
		});
	});
});
