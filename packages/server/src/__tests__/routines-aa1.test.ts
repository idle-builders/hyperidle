/**
 * AA1 — Routine visibility & team scoping API integration tests (Task 5).
 *
 * Tests for:
 * - AC-1: Routines visible in team Work page alongside bets
 * - AC-2: Each routine shows name, schedule, agent, last run outcome/time, next run, cumulative cost
 * - AC-3: States beyond boolean: active, paused, error minimum
 * - AC-4: Every routine belongs to a team (NOT NULL), only team members manage
 * - AC-5: Clicking routine shows run history + config
 * - AC-6: Work portfolio shows routine count per team alongside bet count
 *
 * NOTE: routineRuns is imported from @hyperidle/db — this will be added in Task 1 (schema migration).
 * These tests are the red phase — they will fail until implementation is complete.
 */

import {
	bets,
	createTestDb,
	type HyperIdleDb,
	// routineRuns is NOT exported yet — AA1 Task 1 adds it.
	// The tests that reference it will fail until Task 1 is complete (correct red phase behavior).
	routines,
	type TestDbHandle,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-aa1";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();

	await db.insert(teams).values({
		id: "team-aa1",
		name: "AA1 Team",
		phase: "build",
		createdAt: now,
	});

	await db.insert(teamMembers).values({
		id: "tm-aa1",
		teamId: "team-aa1",
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});

	await db.insert(users).values({
		id: "agent-aa1",
		name: "AA1 Agent",
		role: "builder",
		status: "active",
		teamId: "tm-aa1",
		createdAt: now,
	});
}

describe("AA1: Routine Visibility API", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		handle = await createTestDb();
		db = handle.db;
		app = await createTestApp({ db, eventBus: new EventBus() });
		await seedBase(db);
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-1 + AC-2: GET /api/teams/:id includes routines with correct shape
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-1 + AC-2: GET /api/teams/:id includes routines", () => {
		it("returns routines array with correct RoutineCardSummary shape", async () => {
			const now = new Date().toISOString();
			// Note: inserting with name, teamId, state — columns added in Task 1
			await db.insert(routines).values({
				id: "routine-aa1-1",
				// @ts-expect-error — name/teamId/state columns added in Task 1 migration
				name: "Daily digest",
				ownerAgentId: "agent-aa1",
				// @ts-expect-error — teamId column added in Task 1 migration
				teamId: "team-aa1",
				// @ts-expect-error — state column added in Task 1 migration
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 8 * * *" }),
				active: true,
				lastRunAt: now,
				nextRunAt: now,
			});

			const res = await app.request("/api/teams/team-aa1", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toHaveProperty("routines");

			const routinesArr = body.routines as Array<Record<string, unknown>>;
			expect(routinesArr).toHaveLength(1);

			const r = routinesArr[0];
			// AC-2: name
			expect(r).toHaveProperty("id", "routine-aa1-1");
			expect(r).toHaveProperty("name", "Daily digest");
			// AC-2: schedule label
			expect(r).toHaveProperty("scheduleLabel");
			expect(typeof r.scheduleLabel).toBe("string");
			expect((r.scheduleLabel as string).length).toBeGreaterThan(0);
			// AC-2: assigned agent
			expect(r).toHaveProperty("agentName");
			expect(r).toHaveProperty("agentInitials");
			// AC-2: last run time
			expect(r).toHaveProperty("lastRunAt");
			// AC-2: last run outcome (null when no routine_runs)
			expect(r).toHaveProperty("lastRunOutcome");
			// AC-2: next run
			expect(r).toHaveProperty("nextRunAt");
			// AC-2: cumulative cost
			expect(r).toHaveProperty("costActual");
			// AC-3: state
			expect(r).toHaveProperty("state", "active");
		});

		it("returns routines: [] when team has no routines", async () => {
			const res = await app.request("/api/teams/team-aa1", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toHaveProperty("routines");
			expect(body.routines).toEqual([]);
		});

		it("resolves agentName from users table for routine owner", async () => {
			await db.insert(routines).values({
				id: "routine-aa1-agent",
				// @ts-expect-error — name/teamId/state columns added in Task 1 migration
				name: "Test routine",
				ownerAgentId: "agent-aa1",
				// @ts-expect-error — teamId column added in Task 1 migration
				teamId: "team-aa1",
				// @ts-expect-error — state column added in Task 1 migration
				state: "active",
				triggerType: "heartbeat",
				triggerConfig: JSON.stringify({ intervalSeconds: 900 }),
				active: true,
			});

			const res = await app.request("/api/teams/team-aa1", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			const routinesArr = body.routines as Array<Record<string, unknown>>;
			expect(routinesArr[0].agentName).toBe("AA1 Agent");
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-2: lastRunOutcome derived from latest routine_run
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-2: lastRunOutcome derived from latest routine_run", () => {
		it("returns lastRunOutcome=error after inserting a failed run", async () => {
			await db.insert(routines).values({
				id: "routine-outcome-test",
				// @ts-expect-error — name/teamId/state columns added in Task 1 migration
				name: "Outcome test",
				ownerAgentId: "agent-aa1",
				// @ts-expect-error — teamId column added in Task 1 migration
				teamId: "team-aa1",
				// @ts-expect-error — state column added in Task 1 migration
				state: "active",
				triggerType: "heartbeat",
				triggerConfig: JSON.stringify({ intervalSeconds: 60 }),
				active: true,
			});

			// routineRuns table added in Task 1 — this will throw until migration runs
			const { routineRuns } = (await import("@hyperidle/db")) as unknown as {
				routineRuns: typeof import("@hyperidle/db").routines;
			};
			await db.insert(routineRuns).values({
				id: "run-1",
				// @ts-expect-error — routineId/outcome fields are on routineRuns table
				routineId: "routine-outcome-test",
				startedAt: new Date().toISOString(),
				outcome: "error",
			});

			const res = await app.request("/api/teams/team-aa1", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			const routinesArr = body.routines as Array<Record<string, unknown>>;
			expect(routinesArr[0].lastRunOutcome).toBe("error");
		});

		it("returns lastRunOutcome=success after a successful run", async () => {
			await db.insert(routines).values({
				id: "routine-success-test",
				// @ts-expect-error — name/teamId/state columns added in Task 1 migration
				name: "Success test",
				ownerAgentId: "agent-aa1",
				// @ts-expect-error — teamId column added in Task 1 migration
				teamId: "team-aa1",
				// @ts-expect-error — state column added in Task 1 migration
				state: "active",
				triggerType: "heartbeat",
				triggerConfig: JSON.stringify({ intervalSeconds: 60 }),
				active: true,
			});

			const { routineRuns } = (await import("@hyperidle/db")) as unknown as {
				routineRuns: typeof import("@hyperidle/db").routines;
			};
			await db.insert(routineRuns).values({
				id: "run-success-1",
				// @ts-expect-error — routineId/outcome fields are on routineRuns table
				routineId: "routine-success-test",
				startedAt: new Date().toISOString(),
				outcome: "success",
			});

			const res = await app.request("/api/teams/team-aa1", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			const routinesArr = body.routines as Array<Record<string, unknown>>;
			expect(routinesArr[0].lastRunOutcome).toBe("success");
		});

		it("returns lastRunOutcome=null when no runs exist", async () => {
			await db.insert(routines).values({
				id: "routine-no-runs",
				// @ts-expect-error — name/teamId/state columns added in Task 1 migration
				name: "No runs",
				ownerAgentId: "agent-aa1",
				// @ts-expect-error — teamId column added in Task 1 migration
				teamId: "team-aa1",
				// @ts-expect-error — state column added in Task 1 migration
				state: "active",
				triggerType: "heartbeat",
				triggerConfig: JSON.stringify({ intervalSeconds: 60 }),
				active: true,
			});

			const res = await app.request("/api/teams/team-aa1", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			const routinesArr = body.routines as Array<Record<string, unknown>>;
			expect(routinesArr[0].lastRunOutcome).toBeNull();
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-3: States beyond boolean
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-3: Routine states: active, paused, error", () => {
		it("PATCH /api/routines/:id with state=paused updates state and syncs active=false", async () => {
			await db.insert(routines).values({
				id: "routine-patch-state",
				// @ts-expect-error — name/teamId/state columns added in Task 1 migration
				name: "State patch test",
				ownerAgentId: "agent-aa1",
				// @ts-expect-error — teamId column added in Task 1 migration
				teamId: "team-aa1",
				// @ts-expect-error — state column added in Task 1 migration
				state: "active",
				triggerType: "heartbeat",
				active: true,
			});

			const res = await app.request("/api/routines/routine-patch-state", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "paused" }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.state).toBe("paused");
			expect(body.active).toBe(false);
		});

		it("PATCH /api/routines/:id with state=active updates state and syncs active=true", async () => {
			await db.insert(routines).values({
				id: "routine-patch-active",
				// @ts-expect-error — name/teamId/state columns added in Task 1 migration
				name: "Activate test",
				ownerAgentId: "agent-aa1",
				// @ts-expect-error — teamId column added in Task 1 migration
				teamId: "team-aa1",
				// @ts-expect-error — state column added in Task 1 migration
				state: "paused",
				triggerType: "heartbeat",
				active: false,
			});

			const res = await app.request("/api/routines/routine-patch-active", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "active" }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.state).toBe("active");
			expect(body.active).toBe(true);
		});

		it("PATCH /api/routines/:id with state=error sets active=false", async () => {
			await db.insert(routines).values({
				id: "routine-patch-error",
				// @ts-expect-error — name/teamId/state columns added in Task 1 migration
				name: "Error state test",
				ownerAgentId: "agent-aa1",
				// @ts-expect-error — teamId column added in Task 1 migration
				teamId: "team-aa1",
				// @ts-expect-error — state column added in Task 1 migration
				state: "active",
				triggerType: "heartbeat",
				active: true,
			});

			const res = await app.request("/api/routines/routine-patch-error", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "error" }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.state).toBe("error");
			expect(body.active).toBe(false);
		});

		it("PATCH /api/routines/:id rejects invalid state value", async () => {
			await db.insert(routines).values({
				id: "routine-invalid-state",
				// @ts-expect-error — name/teamId/state columns added in Task 1 migration
				name: "Invalid state test",
				ownerAgentId: "agent-aa1",
				// @ts-expect-error — teamId column added in Task 1 migration
				teamId: "team-aa1",
				// @ts-expect-error — state column added in Task 1 migration
				state: "active",
				triggerType: "heartbeat",
				active: true,
			});

			const res = await app.request("/api/routines/routine-invalid-state", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "disabled" }),
			});
			expect(res.status).toBe(400);
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-5: GET /api/routines/:id returns RoutineDetail with run history
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-5: GET /api/routines/:id returns RoutineDetail with run history", () => {
		it("returns RoutineDetail for an existing routine", async () => {
			await db.insert(routines).values({
				id: "routine-detail-test",
				// @ts-expect-error — name/teamId/state columns added in Task 1 migration
				name: "Detail test",
				ownerAgentId: "agent-aa1",
				// @ts-expect-error — teamId column added in Task 1 migration
				teamId: "team-aa1",
				// @ts-expect-error — state column added in Task 1 migration
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 10 * * MON" }),
				active: true,
			});

			const res = await app.request("/api/routines/routine-detail-test", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toHaveProperty("routine");
			expect(body).toHaveProperty("runs");

			const routine = body.routine as Record<string, unknown>;
			expect(routine.id).toBe("routine-detail-test");
			expect(routine.name).toBe("Detail test");
			expect(routine.state).toBe("active");
			expect(routine).toHaveProperty("scheduleLabel");
			expect(routine).toHaveProperty("agentName");
			expect(routine).toHaveProperty("teamName");
			expect(routine).toHaveProperty("triggerType");

			const runs = body.runs as unknown[];
			expect(Array.isArray(runs)).toBe(true);
		});

		it("returns run history with correct shape", async () => {
			await db.insert(routines).values({
				id: "routine-with-runs",
				// @ts-expect-error — name/teamId/state columns added in Task 1 migration
				name: "Runs test",
				ownerAgentId: "agent-aa1",
				// @ts-expect-error — teamId column added in Task 1 migration
				teamId: "team-aa1",
				// @ts-expect-error — state column added in Task 1 migration
				state: "active",
				triggerType: "heartbeat",
				triggerConfig: JSON.stringify({ intervalSeconds: 900 }),
				active: true,
			});

			// routineRuns table added in Task 1 — this import will resolve after migration
			const { routineRuns } = (await import("@hyperidle/db")) as unknown as {
				routineRuns: typeof import("@hyperidle/db").routines;
			};
			const startedAt = "2026-01-01T10:00:00.000Z";
			const endedAt = "2026-01-01T10:01:30.000Z";
			await db.insert(routineRuns).values({
				id: "run-history-1",
				// @ts-expect-error — routineRuns table added in Task 1
				routineId: "routine-with-runs",
				startedAt,
				endedAt,
				outcome: "success",
				costMinor: 100,
				costCurrency: "USD",
			});

			const res = await app.request("/api/routines/routine-with-runs", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			const runs = body.runs as Array<Record<string, unknown>>;
			expect(runs).toHaveLength(1);

			const run = runs[0];
			expect(run.id).toBe("run-history-1");
			expect(run).toHaveProperty("startedAt");
			expect(run).toHaveProperty("endedAt");
			expect(run).toHaveProperty("outcome", "success");
			expect(run).toHaveProperty("durationSeconds");
			expect(run).toHaveProperty("cost");
		});

		it("returns 404 for non-existent routine", async () => {
			const res = await app.request("/api/routines/nonexistent-routine", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toHaveProperty("error");
			expect(body).toHaveProperty("code", "NOT_FOUND");
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-6: GET /api/teams lists teams with routineCount
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-6: GET /api/teams includes routineCount per team", () => {
		it("returns routineCount=0 when team has no routines", async () => {
			const res = await app.request("/api/teams", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as { teams: Array<Record<string, unknown>> };
			const team = body.teams.find((t) => t.id === "team-aa1");
			expect(team).toBeDefined();
			expect(team).toHaveProperty("routineCount", 0);
		});

		it("returns correct routineCount when team has routines", async () => {
			const now = new Date().toISOString();

			await db.insert(routines).values([
				{
					id: "count-routine-1",
					// @ts-expect-error — name/teamId/state columns added in Task 1 migration
					name: "Routine one",
					ownerAgentId: "agent-aa1",
					// @ts-expect-error — teamId column added in Task 1 migration
					teamId: "team-aa1",
					// @ts-expect-error — state column added in Task 1 migration
					state: "active",
					triggerType: "heartbeat",
					active: true,
				},
				{
					id: "count-routine-2",
					// @ts-expect-error — name/teamId/state columns added in Task 1 migration
					name: "Routine two",
					ownerAgentId: "agent-aa1",
					// @ts-expect-error — teamId column added in Task 1 migration
					teamId: "team-aa1",
					// @ts-expect-error — state column added in Task 1 migration
					state: "paused",
					triggerType: "calendar",
					triggerConfig: JSON.stringify({ cron: "0 8 * * *" }),
					active: false,
					lastRunAt: now,
				},
			]);

			const res = await app.request("/api/teams", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as { teams: Array<Record<string, unknown>> };
			const team = body.teams.find((t) => t.id === "team-aa1");
			expect(team).toBeDefined();
			expect(team).toHaveProperty("routineCount", 2);
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// PATCH /api/routines/:id — extended fields (name, description)
	// ──────────────────────────────────────────────────────────────────────

	describe("PATCH /api/routines/:id — extended fields", () => {
		it("updates name and description", async () => {
			await db.insert(routines).values({
				id: "routine-name-update",
				// @ts-expect-error — name/teamId/state columns added in Task 1 migration
				name: "Old name",
				ownerAgentId: "agent-aa1",
				// @ts-expect-error — teamId column added in Task 1 migration
				teamId: "team-aa1",
				// @ts-expect-error — state column added in Task 1 migration
				state: "active",
				triggerType: "heartbeat",
				active: true,
			});

			const res = await app.request("/api/routines/routine-name-update", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ name: "New name", description: "A description" }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.name).toBe("New name");
			expect(body.description).toBe("A description");
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// POST /api/routines/:id/trigger — creates routine_run row
	// ──────────────────────────────────────────────────────────────────────

	describe("POST /api/routines/:id/trigger — creates routine_run", () => {
		it("inserts a routine_run row when trigger fires", async () => {
			const now = new Date().toISOString();

			// Need a bet + task for FK satisfaction in session creation
			await db.insert(bets).values({
				id: "bet-trigger-test",
				teamId: "team-aa1",
				description: "Trigger test bet",
				status: "active",
				createdAt: now,
			});

			await db.insert(tasks).values({
				id: "task-trigger-test",
				betId: "bet-trigger-test",
				teamId: "team-aa1",
				title: "Trigger test task",
				state: "in_progress",
				createdAt: now,
				updatedAt: now,
				ownerAgentId: "agent-aa1",
			});

			await db.insert(routines).values({
				id: "routine-trigger-aa1",
				// @ts-expect-error — name/teamId/state columns added in Task 1 migration
				name: "Trigger test",
				ownerAgentId: "agent-aa1",
				// @ts-expect-error — teamId column added in Task 1 migration
				teamId: "team-aa1",
				// @ts-expect-error — state column added in Task 1 migration
				state: "active",
				triggerType: "heartbeat",
				triggerConfig: JSON.stringify({ intervalSeconds: 60 }),
				active: true,
			});

			const res = await app.request("/api/routines/routine-trigger-aa1/trigger", {
				method: "POST",
				headers: authHeaders(),
			});
			// 201 for non-builtin routines
			expect(res.status).toBe(201);

			// Verify routine_run was created — routineRuns added in Task 1
			const { routineRuns } = (await import("@hyperidle/db")) as unknown as {
				routineRuns: typeof import("@hyperidle/db").routines;
			};
			const runs = await db.select().from(routineRuns).where(eq(routineRuns.id, routineRuns.id)); // selecting all runs
			// There should be at least one run for our routine
			const ourRun = (runs as Array<Record<string, unknown>>).find(
				(r) => r.routineId === "routine-trigger-aa1",
			);
			expect(ourRun).toBeDefined();
			expect(ourRun?.startedAt).toBeTruthy();
		});
	});
});
