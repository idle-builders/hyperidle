/**
 * V1 — Route integration tests for routines endpoints.
 *
 * GET   /api/routines          — list routines
 * PATCH /api/routines/:id      — update routine
 * POST  /api/routines/:id/retire  — retire routine
 * POST  /api/routines/:id/trigger — manually trigger routine
 */

import { bets, type HyperIdleDb, routines, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-routines";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedRoutine(db: HyperIdleDb): Promise<{ routineId: string; taskId: string }> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "team-1", name: "Test Team", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "tm-1", teamId: "team-1", capacity: 5, activeBets: 0, formedAt: now });
	await db.insert(users).values({
		id: "agent-1",
		kind: "ai",
		name: "Test Agent",
		role: "builder",
		status: "active",
		teamId: "tm-1",
		createdAt: now,
	});
	await db.insert(bets).values({
		id: "bet-1",
		teamId: "team-1",
		description: "Test bet",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "task-1",
		title: "Test task",
		betId: "bet-1",
		teamId: "team-1",
		state: "in_progress",
		ownerAgentId: "agent-1",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(routines).values({
		id: "routine-1",
		name: "Test routine",
		teamId: "team-1",
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
		test("returns 401 without auth header on GET /api/routines", async ({ app }) => {
			const res = await app.request("/api/routines", { method: "GET" });
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

	describe("POST /api/routines/:id/retire", () => {
		test("returns 200 with routine.active=false", async ({ db, app }) => {
			const { routineId } = await seedRoutine(db);
			const res = await app.request(`/api/routines/${routineId}/retire`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { id: string; active: boolean };
			expect(body.active).toBe(false);
		});

		test("returns 404 for non-existent routine", async ({ app }) => {
			const res = await app.request("/api/routines/non-existent/retire", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});
	});

	describe("POST /api/routines/:id/trigger", () => {
		test("returns 201 with created session on manual trigger", async ({ db, app }) => {
			const { routineId } = await seedRoutine(db);
			const res = await app.request(`/api/routines/${routineId}/trigger`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as { id: string; agentId: string };
			expect(typeof body.id).toBe("string");
			expect(body.agentId).toBe("agent-1");
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

		test("emits session_started event on eventBus", async ({ db, app, eventBus }) => {
			const { routineId } = await seedRoutine(db);
			const emittedEvents: unknown[] = [];
			eventBus.on("session_started", (e) => {
				emittedEvents.push(e);
			});

			await app.request(`/api/routines/${routineId}/trigger`, {
				method: "POST",
				headers: authHeaders(),
			});

			expect(emittedEvents).toHaveLength(1);
		});
	});
});
