import { type HyperIdleDb, routines, sessions, tasks, teams, threads, users } from "@hyperidle/db";
import type { DomainEvent } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-routines";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	// Seed required data
	await db.insert(teams).values({
		id: "prod-1",
		name: "Test Product",
		phase: "build",
		createdAt: new Date().toISOString(),
	});

	await db.insert(users).values({
		id: "agent-1",
		name: "Builder Bot",
		role: "builder",
		status: "idle",
		teamId: "prod-1",
		createdAt: new Date().toISOString(),
	});

	// Seed a bet and task for FK references in session creation
	await db.insert(threads).values({
		id: `thr-${"bet-1"}`,
		hostKind: "team",
		hostId: "prod-1",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: new Date().toISOString(),
		createdAt: new Date().toISOString(),
	});
	await db.insert(tasks).values({
		threadId: `thr-${"bet-1"}`,
		id: "bet-1",
		parentTaskId: null,
		teamId: "prod-1",
		title: "Test",
		description: "Test",
		state: "in_progress",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});

	await db.insert(threads).values({
		id: `thr-${"task-1"}`,
		hostKind: "team",
		hostId: "prod-1",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: new Date().toISOString(),
		createdAt: new Date().toISOString(),
	});
	await db.insert(tasks).values({
		threadId: `thr-${"task-1"}`,
		id: "task-1",
		parentTaskId: "bet-1",
		teamId: "prod-1",
		title: "Test Task",
		state: "in_progress",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});

	// Seed routines (AA1: name, teamId, state are now required)
	await db.insert(routines).values([
		{
			id: "routine-1",
			name: "Test routine 1",
			state: "active",
			ownerAgentId: "agent-1",
			triggerType: "heartbeat",
			triggerConfig: JSON.stringify({ intervalMs: 60000 }),
			active: true,
		},
		{
			id: "routine-2",
			name: "Test routine 2",
			state: "active",
			ownerAgentId: "agent-1",
			triggerType: "calendar",
			active: true,
		},
	]);
}

describe("Routine Endpoints (E6)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC4: GET /api/routines — list with trigger config, last/next run
	describe("AC4: GET /api/routines — list all routines", () => {
		test("returns all routines", async ({ db, app }) => {
			await seedBase(db);
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
		test("disables a routine", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/routines/routine-1", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ active: false }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.active).toBe(false);
		});

		test("updates trigger config and autonomy level", async ({ db, app }) => {
			await seedBase(db);
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

		test("returns 404 for unknown routine", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/routines/nonexistent", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ active: false }),
			});
			expect(res.status).toBe(404);
		});
	});

	// POST /api/routines/:id/retire deleted. Tests removed with the route.

	// AC7: POST /api/routines/:id/trigger — manually trigger for testing
	describe("AC7: POST /api/routines/:id/trigger — manual trigger", () => {
		test("creates a session request", async ({ db, app, eventBus }) => {
			await seedBase(db);
			const emitted: DomainEvent[] = [];
			eventBus.on("session_started", (e) => emitted.push(e));

			const res = await app.request("/api/routines/routine-1/trigger", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.fired).toBe(true);
			expect(typeof body.runId).toBe("string");

			// Durable handoff records a run+intent; request creation belongs to the worker.
			const allSessions = await db.select().from(sessions);
			expect(allSessions).toHaveLength(0);

			expect(emitted).toHaveLength(0);
		});

		test("updates routine lastRunAt", async ({ db, app }) => {
			await seedBase(db);
			await app.request("/api/routines/routine-1/trigger", {
				method: "POST",
				headers: authHeaders(),
			});

			const allRoutines = await db.select().from(routines);
			const updated = allRoutines.find((r) => r.id === "routine-1");
			expect(updated?.lastRunAt).toBeTruthy();
		});

		test("returns 404 for unknown routine", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/routines/nonexistent/trigger", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});

		// G4 AC8: manual trigger must refuse to fire disabled routines
		test("returns 403 ROUTINE_DISABLED when routine.active=0", async ({ db, app }) => {
			await seedBase(db);
			await db.update(routines).set({ active: false }).where(eq(routines.id, "routine-1"));

			const res = await app.request("/api/routines/routine-1/trigger", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(403);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.code).toBe("FORBIDDEN");

			// Must not have created a session
			const allSessions = await db.select().from(sessions);
			expect(allSessions).toHaveLength(0);

			// Must not have updated lastRunAt
			const [updated] = await db.select().from(routines).where(eq(routines.id, "routine-1"));
			expect(updated?.lastRunAt).toBeNull();
		});

		// G4 AC7 (via API): manual trigger for a builtin invokes the handler
		test("invokes builtin handler for builtin:document-decay (no session)", async ({ db, app }) => {
			await seedBase(db);
			// Seed builtin routine directly (bypass G4 seed helper in this test file).
			// AA1: name, teamId, state are now required columns.
			await db.insert(routines).values({
				id: "builtin:document-decay",
				name: "Document decay",
				state: "active",
				ownerAgentId: "agent-1",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 2 * * *" }),
				active: true,
			});

			const sessionsBefore = await db.select().from(sessions);

			const res = await app.request("/api/routines/builtin:document-decay/trigger", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.routineId).toBe("builtin:document-decay");
			expect(body.fired).toBe(true);

			// Builtin manual trigger must NOT create a session
			const sessionsAfter = await db.select().from(sessions);
			expect(sessionsAfter).toHaveLength(sessionsBefore.length);

			const [updated] = await db
				.select()
				.from(routines)
				.where(eq(routines.id, "builtin:document-decay"));
			expect(updated?.lastRunAt).toBeTruthy();
		});
	});
});
