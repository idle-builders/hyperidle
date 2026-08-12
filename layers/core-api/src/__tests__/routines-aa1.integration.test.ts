/**
 * AA1 — Routine visibility & team scoping API integration tests (Task 5).
 *
 * Tests for:
 * - AC-1: Routines visible in team Work page alongside bets
 * - AC-2: Each routine shows name, schedule, agent, last run outcome/time, next run
 * - AC-3: States beyond boolean: active, paused, error minimum
 * - AC-4: Every routine belongs to a team (NOT NULL), only team members manage
 * - AC-5: Clicking routine shows run history + config
 * - AC-6: Work portfolio shows routine count per team alongside bet count
 */

import {
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
import { describe, expect, test, vi } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-aa1";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedBase(
	db: HyperIdleDb,
	ids: ScopedIds,
): Promise<{
	teamId: string;
	tmId: string;
	agentId: string;
}> {
	const now = new Date().toISOString();
	const teamId = ids("team-aa1");
	const tmId = ids("tm-aa1");
	const agentId = ids("agent-aa1");

	await db.insert(teams).values({
		id: teamId,
		name: "AA1 Team",
		phase: "build",
		createdAt: now,
	});

	await db.insert(teamMembers).values({
		id: tmId,
		teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});

	await db.insert(users).values({
		id: agentId,
		name: "AA1 Agent",
		role: "builder",
		status: "active",
		teamId: tmId,
		createdAt: now,
	});
	return { teamId, tmId, agentId };
}

describe("AA1: Routine Visibility API", () => {
	// ──────────────────────────────────────────────────────────────────────
	// AC-1 + AC-2: GET /api/teams/:id includes routines with correct shape
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-1 + AC-2: GET /api/teams/:id includes routines", () => {
		test("returns routines array with correct RoutineCardSummary shape", async ({
			db,
			app,
			ids,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const { teamId, agentId } = await seedBase(db, ids);

			const now = new Date().toISOString();
			const routineId = ids("routine-aa1-1");
			await db.insert(routines).values({
				id: routineId,
				name: "Daily digest",
				ownerAgentId: agentId,
				teamId,
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 8 * * *" }),
				active: true,
				lastRunAt: now,
				nextRunAt: now,
			});

			const res = await app.request(`/api/teams/${teamId}`, { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toHaveProperty("routines");

			const routinesArr = body.routines as Array<Record<string, unknown>>;
			// P6: global list — assert our routine is present
			const myRoutine = routinesArr.find((r) => r.id === routineId);
			expect(myRoutine).toBeDefined();

			const r = myRoutine;
			// AC-2: name
			expect(r).toHaveProperty("name", "Daily digest");
			// AC-2: schedule label
			expect(r).toHaveProperty("scheduleLabel");
			expect(typeof r!.scheduleLabel).toBe("string");
			expect((r!.scheduleLabel as string).length).toBeGreaterThan(0);
			// AC-2: assigned agent
			expect(r).toHaveProperty("agentName");
			expect(r).toHaveProperty("agentInitials");
			// AC-2: last run time
			expect(r).toHaveProperty("lastRunAt");
			// AC-2: last run outcome (null when no routine_runs)
			expect(r).toHaveProperty("lastRunOutcome");
			// AC-2: next run
			expect(r).toHaveProperty("nextRunAt");
			// AC-3: state
			expect(r).toHaveProperty("state", "active");
			vi.unstubAllEnvs();
		});

		test("returns routines: [] when team has no routines", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const { teamId } = await seedBase(db, ids);

			const res = await app.request(`/api/teams/${teamId}`, { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toHaveProperty("routines");
			const routinesArr = body.routines as Array<Record<string, unknown>>;
			// No routines for our team — the team endpoint returns routines scoped to that team
			expect(routinesArr).toEqual([]);
			vi.unstubAllEnvs();
		});

		test("resolves agentName from users table for routine owner", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const { teamId, agentId } = await seedBase(db, ids);

			const routineId = ids("routine-aa1-agent");
			await db.insert(routines).values({
				id: routineId,
				name: "Test routine",
				ownerAgentId: agentId,
				teamId,
				state: "active",
				triggerType: "heartbeat",
				triggerConfig: JSON.stringify({ intervalSeconds: 900 }),
				active: true,
			});

			const res = await app.request(`/api/teams/${teamId}`, { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			const routinesArr = body.routines as Array<Record<string, unknown>>;
			const myRoutine = routinesArr.find((r) => r.id === routineId);
			expect(myRoutine).toBeDefined();
			expect(myRoutine!.agentName).toBe("AA1 Agent");
			vi.unstubAllEnvs();
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-2: lastRunOutcome derived from latest routine_run
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-2: lastRunOutcome derived from latest routine_run", () => {
		test("returns lastRunOutcome=error after inserting a failed run", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const { teamId, agentId } = await seedBase(db, ids);

			const routineId = ids("routine-outcome-test");
			await db.insert(routines).values({
				id: routineId,
				name: "Outcome test",
				ownerAgentId: agentId,
				teamId,
				state: "active",
				triggerType: "heartbeat",
				triggerConfig: JSON.stringify({ intervalSeconds: 60 }),
				active: true,
			});

			await db.insert(routineRuns).values({
				id: ids("run-1"),
				routineId,
				startedAt: new Date().toISOString(),
				outcome: "error",
			});

			const res = await app.request(`/api/teams/${teamId}`, { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			const routinesArr = body.routines as Array<Record<string, unknown>>;
			const myRoutine = routinesArr.find((r) => r.id === routineId);
			expect(myRoutine).toBeDefined();
			expect(myRoutine!.lastRunOutcome).toBe("error");
			vi.unstubAllEnvs();
		});

		test("returns lastRunOutcome=success after a successful run", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const { teamId, agentId } = await seedBase(db, ids);

			const routineId = ids("routine-success-test");
			await db.insert(routines).values({
				id: routineId,
				name: "Success test",
				ownerAgentId: agentId,
				teamId,
				state: "active",
				triggerType: "heartbeat",
				triggerConfig: JSON.stringify({ intervalSeconds: 60 }),
				active: true,
			});

			await db.insert(routineRuns).values({
				id: ids("run-success-1"),
				routineId,
				startedAt: new Date().toISOString(),
				outcome: "success",
			});

			const res = await app.request(`/api/teams/${teamId}`, { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			const routinesArr = body.routines as Array<Record<string, unknown>>;
			const myRoutine = routinesArr.find((r) => r.id === routineId);
			expect(myRoutine).toBeDefined();
			expect(myRoutine!.lastRunOutcome).toBe("success");
			vi.unstubAllEnvs();
		});

		test("returns lastRunOutcome=null when no runs exist", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const { teamId, agentId } = await seedBase(db, ids);

			const routineId = ids("routine-no-runs");
			await db.insert(routines).values({
				id: routineId,
				name: "No runs",
				ownerAgentId: agentId,
				teamId,
				state: "active",
				triggerType: "heartbeat",
				triggerConfig: JSON.stringify({ intervalSeconds: 60 }),
				active: true,
			});

			const res = await app.request(`/api/teams/${teamId}`, { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			const routinesArr = body.routines as Array<Record<string, unknown>>;
			const myRoutine = routinesArr.find((r) => r.id === routineId);
			expect(myRoutine).toBeDefined();
			expect(myRoutine!.lastRunOutcome).toBeNull();
			vi.unstubAllEnvs();
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-3: States beyond boolean
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-3: Routine states: active, paused, error", () => {
		test("PATCH /api/routines/:id with state=paused updates state and syncs active=false", async ({
			db,
			app,
			ids,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const { teamId, agentId } = await seedBase(db, ids);

			const routineId = ids("routine-patch-state");
			await db.insert(routines).values({
				id: routineId,
				name: "State patch test",
				ownerAgentId: agentId,
				teamId,
				state: "active",
				triggerType: "heartbeat",
				active: true,
			});

			const res = await app.request(`/api/routines/${routineId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "paused" }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.state).toBe("paused");
			expect(body.active).toBe(false);
			vi.unstubAllEnvs();
		});

		test("PATCH /api/routines/:id with state=active updates state and syncs active=true", async ({
			db,
			app,
			ids,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const { teamId, agentId } = await seedBase(db, ids);

			const routineId = ids("routine-patch-active");
			await db.insert(routines).values({
				id: routineId,
				name: "Activate test",
				ownerAgentId: agentId,
				teamId,
				state: "paused",
				triggerType: "heartbeat",
				active: false,
			});

			const res = await app.request(`/api/routines/${routineId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "active" }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.state).toBe("active");
			expect(body.active).toBe(true);
			vi.unstubAllEnvs();
		});

		test("PATCH /api/routines/:id with state=error sets active=false", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const { teamId, agentId } = await seedBase(db, ids);

			const routineId = ids("routine-patch-error");
			await db.insert(routines).values({
				id: routineId,
				name: "Error state test",
				ownerAgentId: agentId,
				teamId,
				state: "active",
				triggerType: "heartbeat",
				active: true,
			});

			const res = await app.request(`/api/routines/${routineId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "error" }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.state).toBe("error");
			expect(body.active).toBe(false);
			vi.unstubAllEnvs();
		});

		test("PATCH /api/routines/:id rejects invalid state value", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const { teamId, agentId } = await seedBase(db, ids);

			const routineId = ids("routine-invalid-state");
			await db.insert(routines).values({
				id: routineId,
				name: "Invalid state test",
				ownerAgentId: agentId,
				teamId,
				state: "active",
				triggerType: "heartbeat",
				active: true,
			});

			const res = await app.request(`/api/routines/${routineId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "disabled" }),
			});
			expect(res.status).toBe(400);
			vi.unstubAllEnvs();
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-5: GET /api/routines/:id returns RoutineDetail with run history
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-5: GET /api/routines/:id returns RoutineDetail with run history", () => {
		test("returns RoutineDetail for an existing routine", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const { teamId, agentId } = await seedBase(db, ids);

			const routineId = ids("routine-detail-test");
			await db.insert(routines).values({
				id: routineId,
				name: "Detail test",
				ownerAgentId: agentId,
				teamId,
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 10 * * MON" }),
				active: true,
			});

			const res = await app.request(`/api/routines/${routineId}`, {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toHaveProperty("routine");
			expect(body).toHaveProperty("runs");

			const runs = body.runs as unknown[];
			expect(Array.isArray(runs)).toBe(true);
			vi.unstubAllEnvs();
		});

		test("returns run history with correct shape", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const { teamId, agentId } = await seedBase(db, ids);

			const routineId = ids("routine-with-runs");
			await db.insert(routines).values({
				id: routineId,
				name: "Runs test",
				ownerAgentId: agentId,
				teamId,
				state: "active",
				triggerType: "heartbeat",
				triggerConfig: JSON.stringify({ intervalSeconds: 900 }),
				active: true,
			});

			const startedAt = "2026-01-01T10:00:00.000Z";
			const endedAt = "2026-01-01T10:01:30.000Z";
			const runId = ids("run-history-1");
			await db.insert(routineRuns).values({
				id: runId,
				routineId,
				startedAt,
				endedAt,
				outcome: "success",
			});

			const res = await app.request(`/api/routines/${routineId}`, {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			const runs = body.runs as Array<Record<string, unknown>>;
			const myRun = runs.find((r) => r.id === runId);
			expect(myRun).toBeDefined();
			expect(myRun).toHaveProperty("startedAt");
			expect(myRun).toHaveProperty("endedAt");
			expect(myRun).toHaveProperty("outcome", "success");
			expect(myRun).toHaveProperty("durationSeconds");
			vi.unstubAllEnvs();
		});

		test("returns 404 for non-existent routine", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedBase(db, ids);

			const res = await app.request(`/api/routines/${ids("nonexistent-routine")}`, {
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toHaveProperty("error");
			expect(body).toHaveProperty("code", "NOT_FOUND");
			vi.unstubAllEnvs();
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-6: GET /api/teams lists teams with routineCount
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-6: GET /api/teams includes routineCount per team", () => {
		test("returns routineCount=0 when team has no routines", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const { teamId } = await seedBase(db, ids);

			const res = await app.request("/api/teams", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as { teams: Array<Record<string, unknown>> };
			const team = body.teams.find((t) => t.id === teamId);
			expect(team).toBeDefined();
			expect(team).toHaveProperty("routineCount", 0);
			vi.unstubAllEnvs();
		});

		test("returns correct routineCount when team has routines", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const { teamId, agentId } = await seedBase(db, ids);

			const now = new Date().toISOString();

			await db.insert(routines).values([
				{
					id: ids("count-routine-1"),
					name: "Routine one",
					ownerAgentId: agentId,
					teamId,
					state: "active",
					triggerType: "heartbeat",
					active: true,
				},
				{
					id: ids("count-routine-2"),
					name: "Routine two",
					ownerAgentId: agentId,
					teamId,
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
			const team = body.teams.find((t) => t.id === teamId);
			expect(team).toBeDefined();
			expect(team).toHaveProperty("routineCount", 2);
			vi.unstubAllEnvs();
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// PATCH /api/routines/:id — extended fields (name, description)
	// ──────────────────────────────────────────────────────────────────────

	describe("PATCH /api/routines/:id — extended fields", () => {
		test("updates name and description", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const { teamId, agentId } = await seedBase(db, ids);

			const routineId = ids("routine-name-update");
			await db.insert(routines).values({
				id: routineId,
				name: "Old name",
				ownerAgentId: agentId,
				teamId,
				state: "active",
				triggerType: "heartbeat",
				active: true,
			});

			const res = await app.request(`/api/routines/${routineId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ name: "New name", description: "A description" }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.name).toBe("New name");
			expect(body.description).toBe("A description");
			vi.unstubAllEnvs();
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// POST /api/routines/:id/trigger — creates routine_run row
	// ──────────────────────────────────────────────────────────────────────

	describe("POST /api/routines/:id/trigger — creates routine_run", () => {
		test("inserts a routine_run row when trigger fires", async ({ db, app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const { teamId, agentId } = await seedBase(db, ids);

			const now = new Date().toISOString();

			// Need a bet + task for FK satisfaction in session creation
			const betId = ids("bet-trigger-test");
			await db.insert(bets).values({
				id: betId,
				teamId,
				description: "Trigger test bet",
				status: "active",
				createdAt: now,
			});

			await db.insert(tasks).values({
				id: ids("task-trigger-test"),
				betId,
				teamId,
				title: "Trigger test task",
				state: "in_progress",
				createdAt: now,
				updatedAt: now,
				ownerAgentId: agentId,
			});

			const routineId = ids("routine-trigger-aa1");
			await db.insert(routines).values({
				id: routineId,
				name: "Trigger test",
				ownerAgentId: agentId,
				teamId,
				state: "active",
				triggerType: "heartbeat",
				triggerConfig: JSON.stringify({ intervalSeconds: 60 }),
				active: true,
			});

			const res = await app.request(`/api/routines/${routineId}/trigger`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.fired).toBe(true);
			expect(typeof body.runId).toBe("string");

			// Verify routine_run was created — scoped by routineId
			const runs = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
			expect(runs.length).toBeGreaterThan(0);
			expect(runs[0]!.startedAt).toBeTruthy();
			vi.unstubAllEnvs();
		});
	});
});
