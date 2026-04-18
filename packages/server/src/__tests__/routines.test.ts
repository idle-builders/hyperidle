import {
	type HyperIdleDb,
	agents,
	bets,
	createTestDb,
	products,
	routines,
	sessions,
	tasks,
	teams,
} from "@hyperidle/db";
import { type DomainEvent, EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-routines";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("Routine Endpoints (E6)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		// Seed required data
		db.insert(products)
			.values({
				id: "prod-1",
				name: "Test Product",
				phase: "build",
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(teams)
			.values({
				id: "team-1",
				productId: "prod-1",
				capacity: 3,
				activeBets: 0,
				formedAt: new Date().toISOString(),
			})
			.run();
		db.insert(agents)
			.values({
				id: "agent-1",
				name: "Builder Bot",
				role: "builder",
				status: "idle",
				teamId: "team-1",
				createdAt: new Date().toISOString(),
			})
			.run();

		// Seed a bet and task for FK references in session creation
		db.insert(bets)
			.values({
				id: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				pitch: "Test",
				appetite: "small",
				status: "committed",
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(tasks)
			.values({
				id: "task-1",
				betId: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				title: "Test Task",
				state: "in_progress",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			})
			.run();

		// Seed routines
		db.insert(routines)
			.values([
				{
					id: "routine-1",
					ownerAgentId: "agent-1",
					triggerType: "heartbeat",
					triggerConfig: JSON.stringify({ intervalMs: 60000 }),
					active: 1,
				},
				{ id: "routine-2", ownerAgentId: "agent-1", triggerType: "calendar", active: 1 },
			])
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC4: GET /api/routines — list with trigger config, last/next run
	describe("AC4: GET /api/routines — list all routines", () => {
		it("returns all routines", async () => {
			const res = await app.request("/api/routines", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Array<Record<string, unknown>>;
			expect(body).toHaveLength(2);
			expect(body[0]).toHaveProperty("triggerType");
			expect(body[0]).toHaveProperty("triggerConfig");
			expect(body[0]).toHaveProperty("lastRunAt");
			expect(body[0]).toHaveProperty("nextRunAt");
		});
	});

	// AC5: PATCH /api/routines/:id — update (enable/disable, change config)
	describe("AC5: PATCH /api/routines/:id — update routine", () => {
		it("disables a routine", async () => {
			const res = await app.request("/api/routines/routine-1", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ active: false }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.active).toBe(0);
		});

		it("updates trigger config and autonomy level", async () => {
			const res = await app.request("/api/routines/routine-1", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ triggerConfig: '{"intervalMs":120000}', autonomyLevel: 3 }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.triggerConfig).toBe('{"intervalMs":120000}');
			expect(body.autonomyLevel).toBe(3);
		});

		it("returns 404 for unknown routine", async () => {
			const res = await app.request("/api/routines/nonexistent", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ active: false }),
			});
			expect(res.status).toBe(404);
		});
	});

	// AC6: POST /api/routines/:id/retire — retire
	describe("AC6: POST /api/routines/:id/retire — retire routine", () => {
		it("retires a routine by setting active=0", async () => {
			const res = await app.request("/api/routines/routine-1/retire", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.active).toBe(0);
		});

		it("returns 404 for unknown routine", async () => {
			const res = await app.request("/api/routines/nonexistent/retire", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});
	});

	// AC7: POST /api/routines/:id/trigger — manually trigger for testing
	describe("AC7: POST /api/routines/:id/trigger — manual trigger", () => {
		it("creates a session and emits event", async () => {
			const emitted: DomainEvent[] = [];
			eventBus.on("session_started", (e) => emitted.push(e));

			const res = await app.request("/api/routines/routine-1/trigger", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(201);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.agentId).toBe("agent-1");
			expect(body.state).toBe("active");

			// Verify session was created in DB
			const allSessions = db.select().from(sessions).all();
			expect(allSessions).toHaveLength(1);

			// Verify event emitted
			expect(emitted).toHaveLength(1);
			expect(emitted[0].type).toBe("session_started");
		});

		it("updates routine lastRunAt", async () => {
			await app.request("/api/routines/routine-1/trigger", {
				method: "POST",
				headers: authHeaders(),
			});

			const updated = db
				.select()
				.from(routines)
				.all()
				.find((r) => r.id === "routine-1");
			expect(updated?.lastRunAt).toBeTruthy();
		});

		it("returns 404 for unknown routine", async () => {
			const res = await app.request("/api/routines/nonexistent/trigger", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});

		// G4 AC8: manual trigger must refuse to fire disabled routines
		it("returns 403 ROUTINE_DISABLED when routine.active=0", async () => {
			db.update(routines).set({ active: 0 }).where(eq(routines.id, "routine-1")).run();

			const res = await app.request("/api/routines/routine-1/trigger", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(403);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.code).toBe("FORBIDDEN");

			// Must not have created a session
			const allSessions = db.select().from(sessions).all();
			expect(allSessions).toHaveLength(0);

			// Must not have updated lastRunAt
			const updated = db.select().from(routines).where(eq(routines.id, "routine-1")).get();
			expect(updated?.lastRunAt).toBeNull();
		});

		// G4 AC7 (via API): manual trigger for a builtin invokes the handler
		it("invokes builtin handler for builtin:knowledge-decay (no session)", async () => {
			// Seed builtin routine directly (bypass G4 seed helper in this test file).
			db.insert(routines)
				.values({
					id: "builtin:knowledge-decay",
					ownerAgentId: "agent-1",
					triggerType: "calendar",
					triggerConfig: JSON.stringify({ cron: "0 2 * * *" }),
					active: 1,
				})
				.run();

			const sessionsBefore = db.select().from(sessions).all();

			const res = await app.request("/api/routines/builtin:knowledge-decay/trigger", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.routineId).toBe("builtin:knowledge-decay");
			expect(body.fired).toBe(true);

			// Builtin manual trigger must NOT create a session
			const sessionsAfter = db.select().from(sessions).all();
			expect(sessionsAfter).toHaveLength(sessionsBefore.length);

			const updated = db
				.select()
				.from(routines)
				.where(eq(routines.id, "builtin:knowledge-decay"))
				.get();
			expect(updated?.lastRunAt).toBeTruthy();
		});
	});
});
