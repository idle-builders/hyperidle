/**
 * V1 — Route integration tests for routines endpoints.
 *
 * GET   /api/routines          — list routines
 * PATCH /api/routines/:id      — update routine
 * POST  /api/routines/:id/retire  — retire routine
 * POST  /api/routines/:id/trigger — manually trigger routine
 */

import {
	agentWorkIntents,
	bets,
	type HyperIdleDb,
	routineRuns,
	routines,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { fireStoredRoutine } from "../../__tests__/dispatch-test-helpers.js";

/**
 * @lore AU38 P10: `builtin:knowledge-decay` is a production-fixed routine id —
 * routine-scheduler.ts dispatches on exactly this string, so it cannot be
 * scoped per test. The seed upserts (another file or the scheduler itself may
 * already hold the row), and run-history assertions use before/after diffs
 * because runs accumulate on the shared id.
 */
const BUILTIN_KNOWLEDGE_DECAY_ID = "builtin:knowledge-decay";

/** Seed a built-in routine (knowledge-decay) owned by agent-1. */
async function seedBuiltinRoutine(db: HyperIdleDb, ids: ScopedIds): Promise<string> {
	await seedRoutine(db, ids);
	// Upsert: own the row's active state whatever a prior writer left behind.
	await db
		.insert(routines)
		.values({
			id: BUILTIN_KNOWLEDGE_DECAY_ID,
			name: "Knowledge decay",
			teamId: ids("team-1"),
			state: "active",
			ownerAgentId: ids("agent-1"),
			triggerType: "calendar",
			triggerConfig: JSON.stringify({ cron: "0 2 * * *" }),
			active: true,
		})
		.onConflictDoUpdate({
			target: routines.id,
			set: { active: true, state: "active" },
		});
	return BUILTIN_KNOWLEDGE_DECAY_ID;
}

const TEST_API_KEY = "test-key-routines";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedRoutine(
	db: HyperIdleDb,
	ids: ScopedIds,
): Promise<{ routineId: string; taskId: string }> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: ids("team-1"), name: "Test Team", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: ids("tm-1"), teamId: ids("team-1"), capacity: 5, activeBets: 0, formedAt: now });
	await db.insert(users).values({
		id: ids("agent-1"),
		kind: "ai",
		name: "Test Agent",
		role: "builder",
		status: "active",
		teamId: ids("tm-1"),
		createdAt: now,
	});
	await db.insert(bets).values({
		id: ids("bet-1"),
		teamId: ids("team-1"),
		description: "Test bet",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: ids("task-1"),
		title: "Test task",
		betId: ids("bet-1"),
		teamId: ids("team-1"),
		state: "in_progress",
		ownerAgentId: ids("agent-1"),
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(routines).values({
		id: ids("routine-1"),
		name: "Test routine",
		teamId: ids("team-1"),
		state: "active",
		ownerAgentId: ids("agent-1"),
		triggerType: "cron",
		triggerConfig: "0 * * * *",
		active: true,
	});
	return { routineId: ids("routine-1"), taskId: ids("task-1") };
}

describe("routines routes", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("routines auth", () => {
		test("returns 401 without auth header on GET /api/routines", async ({ app }) => {
			const res = await app.request("/api/routines", { method: "GET" });
			expect(res.status).toBe(401);
		});
	});

	describe("GET /api/routines", () => {
		test("returns 200 with list of routines", async ({ db, app, ids }) => {
			const { routineId } = await seedRoutine(db, ids);
			const res = await app.request("/api/routines", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<{ id: string }>;
			expect(Array.isArray(body)).toBe(true);
			// AU38 P6: global list endpoint — assert the arranged routine is present.
			expect(body.some((r) => r.id === routineId)).toBe(true);
		});

		// @lore AU38 P4: the original claimed an empty global list "when none
		// exist" — an absence a populated world cannot honour. Re-homed on the
		// shape the test actually guards: the response is an array.
		test("returns 200 with a routines array regardless of world state", async ({ app }) => {
			const res = await app.request("/api/routines", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown[];
			expect(Array.isArray(body)).toBe(true);
		});
	});

	describe("PATCH /api/routines/:id", () => {
		test("returns 200 with updated routine on valid patch", async ({ db, app, ids }) => {
			const { routineId } = await seedRoutine(db, ids);
			const res = await app.request(`/api/routines/${routineId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ triggerConfig: "30 * * * *" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { id: string; triggerConfig: string };
			expect(body.id).toBe(routineId);
			expect(body.triggerConfig).toBe("30 * * * *");
		});

		test("returns 404 for non-existent routine", async ({ app, ids }) => {
			// AU38 P4: a derived id nobody inserted stays absent in a populated world.
			const res = await app.request(`/api/routines/${ids("non-existent")}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ active: false }),
			});
			expect(res.status).toBe(404);
		});

		test("returns 400 on invalid autonomyLevel (out of range)", async ({ db, app, ids }) => {
			const { routineId } = await seedRoutine(db, ids);
			const res = await app.request(`/api/routines/${routineId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 99 }),
			});
			expect(res.status).toBe(400);
		});
	});

	describe("POST /api/routines/:id/retire", () => {
		test("returns 200 with routine.active=false", async ({ db, app, ids }) => {
			const { routineId } = await seedRoutine(db, ids);
			const res = await app.request(`/api/routines/${routineId}/retire`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { id: string; active: boolean };
			expect(body.active).toBe(false);
		});

		test("returns 404 for non-existent routine", async ({ app, ids }) => {
			const res = await app.request(`/api/routines/${ids("non-existent")}/retire`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});
	});

	describe("POST /api/routines/:id/trigger", () => {
		test("returns 200 after atomically recording a routine run and neutral intent", async ({
			db,
			app,
			ids,
		}) => {
			const { routineId } = await seedRoutine(db, ids);
			const res = await app.request(`/api/routines/${routineId}/trigger`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { routineId: string; runId: string; fired: boolean };
			expect(body).toMatchObject({ routineId, fired: true });

			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, body.runId));
			expect(intent).toMatchObject({
				kind: "routine_run",
				sourceKind: "routine_run",
				requestedBy: ids("agent-1"),
				idempotencyKey: `routine:${body.runId}`,
				status: "pending",
			});
			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.id, body.runId));
			expect(run).toMatchObject({ routineId, outcome: "running" });
		});

		test("returns 404 for non-existent routine", async ({ app, ids }) => {
			const res = await app.request(`/api/routines/${ids("non-existent")}/trigger`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});

		test("returns 403 when routine is disabled (active=false)", async ({ db, app, ids }) => {
			const { routineId } = await seedRoutine(db, ids);
			// First retire the routine
			await app.request(`/api/routines/${routineId}/retire`, {
				method: "POST",
				headers: authHeaders(),
			});

			// Then try to trigger it
			const res = await app.request(`/api/routines/${routineId}/trigger`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(403);
		});

		test("records routine run intent without emitting a fake session_started event", async ({
			db,
			app,
			eventBus,
			ids,
		}) => {
			const { routineId } = await seedRoutine(db, ids);
			const emittedEvents: unknown[] = [];
			eventBus.on("session_started", (e) => {
				emittedEvents.push(e);
			});

			await app.request(`/api/routines/${routineId}/trigger`, {
				method: "POST",
				headers: authHeaders(),
			});

			expect(emittedEvents).toHaveLength(0);
			const runs = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
			expect(runs).toHaveLength(1);
			expect(runs[0]?.outcome).toBe("running");
		});
	});

	// AF6 AC5 — founder observes a built-in self-run from the existing GET /:id
	// surface. fireStoredRoutine must insert a terminal routine_runs row (§3a) so
	// the route's runs[] is populated, with a terminal outcome.
	describe("AF6 AC5: built-in auto-run appears in GET /api/routines/:id runs[]", () => {
		test("after a built-in fire, runs[] has a terminal run and lastRunAt is set", async ({
			db,
			app,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const routineId = await seedBuiltinRoutine(db, ids);

			// Simulate an auto-fire (same code path the scheduler uses; no session).
			const result = await fireStoredRoutine(
				db,
				eventBus,
				agentOrchestration,
				BUILTIN_KNOWLEDGE_DECAY_ID,
			);
			expect(result.fired).toBe(true);

			const res = await app.request(`/api/routines/${routineId}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				routine: { lastRunAt: string | null };
				runs: Array<{ outcome: string; endedAt: string | null }>;
			};

			expect(body.runs.length).toBeGreaterThanOrEqual(1);
			// AU38 P5: runs[] is newest-first and the fire above is the newest
			// write to this routine's history, so [0] is the run just recorded.
			const latest = body.runs[0];
			expect(["success", "skipped"]).toContain(latest?.outcome);
			expect(latest?.endedAt).toBeTruthy();
			expect(body.routine.lastRunAt).toBeTruthy();
		});

		// AC2 negative parity at the run-row level: a disabled built-in writes NO
		// run row (the disabled short-circuit returns before any insert).
		test("a disabled built-in writes no run row", async ({
			db,
			app,
			eventBus,
			agentOrchestration,
			ids,
		}) => {
			const routineId = await seedBuiltinRoutine(db, ids);
			await db.update(routines).set({ active: false }).where(eq(routines.id, routineId));

			// AU38 P4: run history accumulates on the shared fixed id (P10), so
			// "writes no run row" is asserted as a before/after diff, not a
			// global zero.
			const runsBefore = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.routineId, routineId));

			const result = await fireStoredRoutine(
				db,
				eventBus,
				agentOrchestration,
				BUILTIN_KNOWLEDGE_DECAY_ID,
			);
			expect(result.fired).toBe(false);

			const res = await app.request(`/api/routines/${routineId}`, {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { runs: unknown[] };
			expect(body.runs.length).toBe(runsBefore.length);
		});
	});
});
