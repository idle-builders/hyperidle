import {
	bets,
	type HyperIdleDb,
	routines,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import type { DomainEvent } from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-routines";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedBase(
	db: HyperIdleDb,
	ids: ScopedIds,
): Promise<{
	teamId: string;
	tmId: string;
	agentId: string;
	betId: string;
	taskId: string;
	routine1Id: string;
	routine2Id: string;
}> {
	const now = new Date().toISOString();
	const teamId = ids("prod-1");
	const tmId = ids("team-1");
	const agentId = ids("agent-1");
	const betId = ids("bet-1");
	const taskId = ids("task-1");
	const routine1Id = ids("routine-1");
	const routine2Id = ids("routine-2");

	// Seed required data
	await db.insert(teams).values({
		id: teamId,
		name: "Test Product",
		phase: "build",
		createdAt: now,
	});

	await db.insert(teamMembers).values({
		id: tmId,
		teamId,
		capacity: 3,
		activeBets: 0,
		formedAt: now,
	});

	await db.insert(users).values({
		id: agentId,
		name: "Builder Bot",
		role: "builder",
		status: "idle",
		teamId: tmId,
		createdAt: now,
	});

	// Seed a bet and task for FK references in session creation
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "Test",
		appetite: "small",
		status: "active",
		createdAt: now,
	});

	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: "Test Task",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});

	// Seed routines (AA1: name, teamId, state are now required)
	await db.insert(routines).values([
		{
			id: routine1Id,
			name: "Test routine 1",
			teamId,
			state: "active",
			ownerAgentId: agentId,
			triggerType: "heartbeat",
			triggerConfig: JSON.stringify({ intervalMs: 60000 }),
			active: true,
		},
		{
			id: routine2Id,
			name: "Test routine 2",
			teamId,
			state: "active",
			ownerAgentId: agentId,
			triggerType: "calendar",
			active: true,
		},
	]);
	return { teamId, tmId, agentId, betId, taskId, routine1Id, routine2Id };
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
		test("returns all routines", async ({ db, app, ids }) => {
			const { routine1Id, routine2Id } = await seedBase(db, ids);
			const res = await app.request("/api/routines", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Array<Record<string, unknown>>;
			// P6: global list — assert our routines are present
			expect(body.find((r) => r.id === routine1Id)).toBeDefined();
			expect(body.find((r) => r.id === routine2Id)).toBeDefined();
			expect(body[0]).toHaveProperty("triggerType");
			expect(body[0]).toHaveProperty("triggerConfig");
			expect(body[0]).toHaveProperty("lastRunAt");
			expect(body[0]).toHaveProperty("nextRunAt");
		});
	});

	// AC5: PATCH /api/routines/:id — update (enable/disable, change config)
	describe("AC5: PATCH /api/routines/:id — update routine", () => {
		test("disables a routine", async ({ db, app, ids }) => {
			const { routine1Id } = await seedBase(db, ids);
			const res = await app.request(`/api/routines/${routine1Id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ active: false }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.active).toBe(false);
		});

		test("updates trigger config and autonomy level", async ({ db, app, ids }) => {
			const { routine1Id } = await seedBase(db, ids);
			const res = await app.request(`/api/routines/${routine1Id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ triggerConfig: '{"intervalMs":120000}', autonomyLevel: 3 }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.triggerConfig).toBe('{"intervalMs":120000}');
			expect(body.autonomyLevel).toBe(3);
		});

		test("returns 404 for unknown routine", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request(`/api/routines/${ids("nonexistent")}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ active: false }),
			});
			expect(res.status).toBe(404);
		});
	});

	// AC6: POST /api/routines/:id/retire — retire
	describe("AC6: POST /api/routines/:id/retire — retire routine", () => {
		test("retires a routine by setting active=false", async ({ db, app, ids }) => {
			const { routine1Id } = await seedBase(db, ids);
			const res = await app.request(`/api/routines/${routine1Id}/retire`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.active).toBe(false);
		});

		test("returns 404 for unknown routine", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request(`/api/routines/${ids("nonexistent")}/retire`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});
	});

	// AC7: POST /api/routines/:id/trigger — manually trigger for testing
	describe("AC7: POST /api/routines/:id/trigger — manual trigger", () => {
		test("creates a session request", async ({ db, app, ids, eventBus }) => {
			const { routine1Id } = await seedBase(db, ids);
			const emitted: DomainEvent[] = [];
			eventBus.on("session_started", (e) => emitted.push(e));

			const res = await app.request(`/api/routines/${routine1Id}/trigger`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.fired).toBe(true);
			expect(typeof body.runId).toBe("string");

			// Durable handoff records a run+intent; request creation belongs to the worker.
			// P1: scope the sessions read by our team's task
			const mySessions = await db
				.select()
				.from(sessions)
				.where(eq(sessions.taskId, ids("task-1")));
			expect(mySessions).toHaveLength(0);

			expect(emitted).toHaveLength(0);
		});

		test("updates routine lastRunAt", async ({ db, app, ids }) => {
			const { routine1Id } = await seedBase(db, ids);
			await app.request(`/api/routines/${routine1Id}/trigger`, {
				method: "POST",
				headers: authHeaders(),
			});

			// P1: scope by routine id
			const [updated] = await db.select().from(routines).where(eq(routines.id, routine1Id));
			expect(updated?.lastRunAt).toBeTruthy();
		});

		test("returns 404 for unknown routine", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request(`/api/routines/${ids("nonexistent")}/trigger`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});

		// G4 AC8: manual trigger must refuse to fire disabled routines
		test("returns 403 ROUTINE_DISABLED when routine.active=0", async ({ db, app, ids }) => {
			const { routine1Id } = await seedBase(db, ids);
			await db.update(routines).set({ active: false }).where(eq(routines.id, routine1Id));

			const res = await app.request(`/api/routines/${routine1Id}/trigger`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(403);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.code).toBe("FORBIDDEN");

			// Must not have created a session — scoped by our task
			const mySessions = await db
				.select()
				.from(sessions)
				.where(eq(sessions.taskId, ids("task-1")));
			expect(mySessions).toHaveLength(0);

			// Must not have updated lastRunAt
			const [updated] = await db.select().from(routines).where(eq(routines.id, routine1Id));
			expect(updated?.lastRunAt).toBeNull();
		});

		// G4 AC7 (via API): manual trigger for a builtin invokes the handler
		test("invokes builtin handler for builtin:knowledge-decay (no session)", async ({
			db,
			app,
			ids,
		}) => {
			const { teamId, agentId } = await seedBase(db, ids);
			// Seed builtin routine directly (bypass G4 seed helper in this test file).
			// AA1: name, teamId, state are now required columns.
			const builtinId = ids("builtin:knowledge-decay");
			await db.insert(routines).values({
				id: builtinId,
				name: "Knowledge decay",
				teamId,
				state: "active",
				ownerAgentId: agentId,
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 2 * * *" }),
				active: true,
			});

			const sessionsBefore = await db
				.select()
				.from(sessions)
				.where(eq(sessions.taskId, ids("task-1")));

			const res = await app.request(`/api/routines/${builtinId}/trigger`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.routineId).toBe(builtinId);
			expect(body.fired).toBe(true);

			// Builtin manual trigger must NOT create a session — scoped
			const sessionsAfter = await db
				.select()
				.from(sessions)
				.where(eq(sessions.taskId, ids("task-1")));
			expect(sessionsAfter).toHaveLength(sessionsBefore.length);

			const [updated] = await db.select().from(routines).where(eq(routines.id, builtinId));
			expect(updated?.lastRunAt).toBeTruthy();
		});
	});
});
