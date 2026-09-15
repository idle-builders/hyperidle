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
	type HyperIdleDb,
	routineRuns,
	routines,
	tasks,
	teams,
	users,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { fireStoredRoutine } from "../../__tests__/dispatch-test-helpers.js";

/** Seed a built-in routine (knowledge-decay) owned by agent-1. */
async function seedBuiltinRoutine(db: HyperIdleDb): Promise<string> {
	await seedRoutine(db);
	await db.insert(routines).values({
		id: "builtin:knowledge-decay",
		name: "Knowledge decay",
		state: "active",
		ownerAgentId: "agent-1",
		triggerType: "calendar",
		triggerConfig: JSON.stringify({ cron: "0 2 * * *" }),
		active: true,
	});
	return "builtin:knowledge-decay";
}

const TEST_API_KEY = "test-key-routines";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedRoutine(db: HyperIdleDb): Promise<{ routineId: string; taskId: string }> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "team-1", name: "Test Team", phase: "build", createdAt: now });
	await db.insert(users).values({
		id: "agent-1",
		kind: "ai",
		name: "Test Agent",
		role: "builder",
		status: "active",
		teamId: "team-1",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "bet-1",
		parentTaskId: null,
		teamId: "team-1",
		title: "Test bet",
		description: "Test bet",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(tasks).values({
		id: "task-1",
		title: "Test task",
		parentTaskId: "bet-1",
		teamId: "team-1",
		state: "in_progress",
		ownerAgentId: "agent-1",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(routines).values({
		id: "routine-1",
		name: "Test routine",
		state: "active",
		ownerAgentId: "agent-1",
		triggerType: "cron",
		triggerConfig: "0 * * * *",
		active: true,
	});
	return { routineId: "routine-1", taskId: "task-1" };
}

describe("routines routes", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("routines auth", () => {
		test("returns 401 without auth header on GET /api/routines", async ({ requestWithoutAuth }) => {
			const res = await requestWithoutAuth("/api/routines", { method: "GET" });
			expect(res.status).toBe(401);
		});
	});

	describe("GET /api/routines", () => {
		test("returns 200 with list of routines", async ({ db, app }) => {
			await seedRoutine(db);
			const res = await app.request("/api/routines", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown[];
			expect(Array.isArray(body)).toBe(true);
			expect(body).toHaveLength(1);
		});

		test("returns 200 with empty array when none exist", async ({ app }) => {
			const res = await app.request("/api/routines", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown[];
			expect(body).toHaveLength(0);
		});
	});

	describe("PATCH /api/routines/:id", () => {
		test("returns 200 with updated routine on valid patch", async ({ db, app }) => {
			const { routineId } = await seedRoutine(db);
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

		test("returns 404 for non-existent routine", async ({ app }) => {
			const res = await app.request("/api/routines/non-existent", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ active: false }),
			});
			expect(res.status).toBe(404);
		});

		test("returns 400 on invalid autonomyLevel (out of range)", async ({ db, app }) => {
			const { routineId } = await seedRoutine(db);
			const res = await app.request(`/api/routines/${routineId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 99 }),
			});
			expect(res.status).toBe(400);
		});
	});

	// POST /api/routines/:id/retire deleted. Tests removed with the route.

	describe("POST /api/routines/:id/trigger", () => {
		test("returns 200 after atomically recording a routine run and neutral intent", async ({
			db,
			app,
		}) => {
			const { routineId } = await seedRoutine(db);
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
				requestedBy: "agent-1",
				idempotencyKey: `routine:${body.runId}`,
				status: "pending",
			});
			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.id, body.runId));
			expect(run).toMatchObject({ routineId, outcome: "running" });
		});

		test("returns 404 for non-existent routine", async ({ app }) => {
			const res = await app.request("/api/routines/non-existent/trigger", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});

		test("returns 403 when routine is disabled (active=false)", async ({ db, app }) => {
			const { routineId } = await seedRoutine(db);
			// retire route is deleted; disable the routine directly via DB
			await db.update(routines).set({ active: false }).where(eq(routines.id, routineId));

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
		}) => {
			const { routineId } = await seedRoutine(db);
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
	// surface. fireStoredRoutine inserts a routine_runs row (§3a) so the route's
	// runs[] is populated. Since BA9d all routines fire via the generic
	// async-dispatch path: the run row starts with outcome="running" and lastRunAt
	// is set immediately; the run completes asynchronously by the agent pipeline.
	describe("AF6 AC5: built-in auto-run appears in GET /api/routines/:id runs[]", () => {
		test("after a built-in fire, runs[] has a running run and lastRunAt is set", async ({
			db,
			app,
			eventBus,
			agentOrchestration,
		}) => {
			const routineId = await seedBuiltinRoutine(db);

			// Simulate an auto-fire (same code path the scheduler uses; no session).
			const result = await fireStoredRoutine(
				db,
				eventBus,
				agentOrchestration,
				"builtin:knowledge-decay",
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
			const latest = body.runs[0];
			// @lore BA9d: all routines now fire via generic async dispatch — the run
			// row outcome is "running" immediately; it becomes terminal only after the
			// agent pipeline completes (outside this test boundary).
			expect(latest?.outcome).toBe("running");
			expect(body.routine.lastRunAt).toBeTruthy();
		});

		// AC2 negative parity at the run-row level: a disabled built-in writes NO
		// run row (the disabled short-circuit returns before any insert).
		test("a disabled built-in writes no run row", async ({
			db,
			app,
			eventBus,
			agentOrchestration,
		}) => {
			const routineId = await seedBuiltinRoutine(db);
			await db.update(routines).set({ active: false }).where(eq(routines.id, routineId));

			const result = await fireStoredRoutine(
				db,
				eventBus,
				agentOrchestration,
				"builtin:knowledge-decay",
			);
			expect(result.fired).toBe(false);

			const res = await app.request(`/api/routines/${routineId}`, {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as { runs: unknown[] };
			expect(body.runs).toHaveLength(0);
		});
	});

	/**
	 * BA9d D11 — silent-disable footgun.
	 *
	 * eventTransitionTo on a non-transition event type (anything other than
	 * task_state_changed) silently never fires because the
	 * event carries no fromState/toState. The route must reject this at creation
	 * time with 400 so the author gets immediate feedback instead of a routine
	 * that appears active but never runs.
	 */
	describe("BA9d D11 — POST /api/routines rejects transition constraint on non-transition event", () => {
		test("eventTransitionTo with knowledge_updated returns 400", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db
				.insert(teams)
				.values({ id: "ba9d-footgun-team", name: "Footgun team", phase: "build", createdAt: now });
			await db.insert(users).values({
				id: "ba9d-footgun-agent",
				kind: "ai",
				name: "Footgun Agent",
				role: "builder",
				status: "active",
				teamId: "ba9d-footgun-team",
				createdAt: now,
			});

			const res = await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					name: "Bad constraint routine",
					ownerAgentId: "ba9d-footgun-agent",
					triggerType: "event",
					eventType: "knowledge_updated",
					eventTransitionTo: "done",
				}),
			});

			expect(res.status).toBe(400);
			const body = (await res.json()) as { error: string };
			expect(body.error).toMatch(/only task_state_changed qualifies/);
		});

		test("eventTransitionTo with task_state_changed returns 201", async ({ db, app }) => {
			const now = new Date().toISOString();
			await db
				.insert(teams)
				.values({ id: "ba9d-valid-team", name: "Valid team", phase: "build", createdAt: now });
			await db.insert(users).values({
				id: "ba9d-valid-agent",
				kind: "ai",
				name: "Valid Agent",
				role: "builder",
				status: "active",
				teamId: "ba9d-valid-team",
				createdAt: now,
			});

			const res = await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					name: "Valid constraint routine",
					ownerAgentId: "ba9d-valid-agent",
					triggerType: "event",
					eventType: "task_state_changed",
					eventTransitionTo: "done",
				}),
			});

			expect(res.status).toBe(201);
		});
	});

	/**
	 * BA1 D5/NB2 — `teamId` is removed from the create contract, not merely
	 * ignored. A plain `z.object` (today's `createRoutineSchema`, no
	 * `.strict()`) STRIPS an unrecognized key rather than rejecting it, and
	 * `teamId` is currently a REQUIRED, used field — so posting it today
	 * succeeds (201), which is exactly the "accepted and discarded" outcome
	 * D5 rules out. RED until `teamId` is dropped from the schema and
	 * `.strict()` is added (architecture.md §9 "teamId is gone from the
	 * create contract, not ignored").
	 */
	describe("BA1 D5 — POST /api/routines rejects a teamId in the body", () => {
		test("a body carrying teamId is rejected with 400, not accepted and discarded", async ({
			db,
			app,
		}) => {
			const now = new Date().toISOString();
			await db
				.insert(teams)
				.values({ id: "ba1-strict-team", name: "BA1 strict team", phase: "build", createdAt: now });
			await db.insert(users).values({
				id: "ba1-strict-agent",
				kind: "ai",
				name: "Strict Agent",
				role: "builder",
				status: "active",
				teamId: "ba1-strict-team",
				createdAt: now,
			});

			const res = await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					name: "BA1 strict test routine",
					teamId: "ba1-strict-team",
					ownerAgentId: "ba1-strict-agent",
					triggerType: "calendar",
					triggerConfig: JSON.stringify({ cron: "0 9 * * 1-5" }),
				}),
			});

			expect(res.status).toBe(400);
		});
	});
});
