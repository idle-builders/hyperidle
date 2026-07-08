/**
 * AA2 — Routine Management & Session Adaptation API integration tests.
 *
 * AC coverage:
 * AC-1: Create routine from Work surface (POST /api/routines)
 * AC-2: Pause, resume, delete routines (PATCH state, DELETE soft delete)
 * AC-5: Coalescing — trigger skipped when active session exists
 * AC-6: Session outcomes recorded in run history
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	type HyperIdleDb,
	routineRuns,
	routines,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { fabricStrategy } from "@hyperidle/fabric";
import { EventBus } from "@hyperidle/shared";
import { eq, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { crashSession, createSession, endSession } from "../services/session-lifecycle.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-aa2";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();

	await db.insert(teams).values({
		id: "team-aa2",
		name: "AA2 Team",
		phase: "build",
		createdAt: now,
	});

	await db.insert(teamMembers).values({
		id: "tm-aa2",
		teamId: "team-aa2",
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});

	await db.insert(users).values({
		id: "agent-aa2",
		name: "AA2 Agent",
		role: "builder",
		status: "active",
		teamId: "tm-aa2",
		createdAt: now,
	});

	// Seed a bet + task needed for trigger/session FK satisfaction
	await db.insert(bets).values({
		id: "bet-aa2",
		teamId: "team-aa2",
		description: "AA2 test bet",
		status: "active",
		createdAt: now,
	});

	await db.insert(tasks).values({
		id: "task-aa2",
		betId: "bet-aa2",
		teamId: "team-aa2",
		title: "AA2 test task",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
		ownerAgentId: "agent-aa2",
	});
}

describe("AA2: Routine Management API", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-1: POST /api/routines — Create routine
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-1: POST /api/routines", () => {
		test("creates a routine with all required fields and returns 201", async ({ db, app }) => {
			await seedBase(db);
			const payload = {
				name: "Daily digest",
				description: "Sends a daily summary",
				teamId: "team-aa2",
				ownerAgentId: "agent-aa2",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
			};

			const res = await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify(payload),
			});

			expect(res.status).toBe(201);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toHaveProperty("id");
			expect(body.name).toBe("Daily digest");
			expect(body.description).toBe("Sends a daily summary");
			expect(body.teamId).toBe("team-aa2");
			expect(body.ownerAgentId).toBe("agent-aa2");
			expect(body.triggerType).toBe("calendar");
			expect(body.state).toBe("active");
		});

		test("includes costCapPerRunMinor when provided", async ({ db, app }) => {
			await seedBase(db);
			const payload = {
				name: "Capped routine",
				teamId: "team-aa2",
				ownerAgentId: "agent-aa2",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
				costCapPerRunMinor: 5000,
			};

			const res = await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify(payload),
			});

			expect(res.status).toBe(201);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.costCapPerRunMinor).toBe(5000);
		});

		test("returns 400 when name is missing", async ({ db, app }) => {
			await seedBase(db);
			const payload = {
				teamId: "team-aa2",
				ownerAgentId: "agent-aa2",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
			};

			const res = await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify(payload),
			});

			expect(res.status).toBe(400);
		});

		test("returns 400 when cron expression is invalid", async ({ db, app }) => {
			await seedBase(db);
			const payload = {
				name: "Bad cron routine",
				teamId: "team-aa2",
				ownerAgentId: "agent-aa2",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "not-a-cron" }),
			};

			const res = await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify(payload),
			});

			expect(res.status).toBe(400);
		});

		test("returns 404 when teamId does not exist", async ({ db, app }) => {
			await seedBase(db);
			const payload = {
				name: "Orphan routine",
				teamId: "nonexistent-team",
				ownerAgentId: "agent-aa2",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
			};

			const res = await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify(payload),
			});

			expect(res.status).toBe(404);
		});

		test("returns 404 when ownerAgentId does not exist", async ({ db, app }) => {
			await seedBase(db);
			const payload = {
				name: "Ghost agent routine",
				teamId: "team-aa2",
				ownerAgentId: "nonexistent-agent",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
			};

			const res = await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify(payload),
			});

			expect(res.status).toBe(404);
		});

		test("newly created routine appears in GET /api/routines", async ({ db, app }) => {
			await seedBase(db);
			const payload = {
				name: "Visible routine",
				teamId: "team-aa2",
				ownerAgentId: "agent-aa2",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
			};

			await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify(payload),
			});

			const listRes = await app.request("/api/routines", { headers: authHeaders() });
			expect(listRes.status).toBe(200);

			const listBody = (await listRes.json()) as unknown[];
			const found = listBody.find((r) => (r as Record<string, unknown>).name === "Visible routine");
			expect(found).toBeDefined();
		});

		test("newly created routine appears in GET /api/teams/:id routines array", async ({
			db,
			app,
		}) => {
			await seedBase(db);
			const payload = {
				name: "Team routine",
				teamId: "team-aa2",
				ownerAgentId: "agent-aa2",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
			};

			await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify(payload),
			});

			const teamRes = await app.request("/api/teams/team-aa2", { headers: authHeaders() });
			expect(teamRes.status).toBe(200);

			const teamBody = (await teamRes.json()) as Record<string, unknown>;
			const teamRoutines = teamBody.routines as Array<Record<string, unknown>>;
			const found = teamRoutines.find((r) => r.name === "Team routine");
			expect(found).toBeDefined();
		});

		test("creates no stub task for the routine", async ({ db, app }) => {
			await seedBase(db);
			const payload = {
				name: "Stub task routine",
				teamId: "team-aa2",
				ownerAgentId: "agent-aa2",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
			};

			const res = await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify(payload),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			const routineId = body.id as string;

			const [row] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
			expect(row).toBeDefined();
			expect(row!.stubTaskId).toBeNull();

			const teamTasks = await db.select().from(tasks).where(eq(tasks.teamId, "team-aa2"));
			expect(teamTasks).toHaveLength(1);
			expect(teamTasks[0]?.id).toBe("task-aa2");
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-2: Pause, resume, delete routines
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-2: DELETE /api/routines/:id — soft delete", () => {
		test("soft-deletes a routine: sets deleted_at and state=paused", async ({ db, app }) => {
			await seedBase(db);
			await db.insert(routines).values({
				id: "routine-to-delete",
				name: "Delete me",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
				active: true,
			});

			const res = await app.request("/api/routines/routine-to-delete", {
				method: "DELETE",
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.deleted).toBe(true);
			expect(body.deletedAt).toBeTruthy();

			// Verify DB state
			const [row] = await db
				.select()
				.from(routines)
				.where(eq(routines.id, "routine-to-delete"))
				.limit(1);
			expect(row).toBeDefined();
			expect(row!.deletedAt).not.toBeNull();
			expect(row!.state).toBe("paused");
			expect(row!.active).toBe(false);
		});

		test("returns 404 when deleting a non-existent routine", async ({ db, app }) => {
			await seedBase(db);
			const res = await app.request("/api/routines/nonexistent-routine-delete", {
				method: "DELETE",
				headers: authHeaders(),
			});

			expect(res.status).toBe(404);
		});

		test("returns 404 when deleting an already-deleted routine", async ({ db, app }) => {
			await seedBase(db);
			const now = new Date().toISOString();
			await db.insert(routines).values({
				id: "routine-already-deleted",
				name: "Already gone",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "paused",
				triggerType: "calendar",
				active: false,
				deletedAt: now,
			});

			const res = await app.request("/api/routines/routine-already-deleted", {
				method: "DELETE",
				headers: authHeaders(),
			});

			expect(res.status).toBe(404);
		});

		test("GET /api/routines does not return soft-deleted routines", async ({ db, app }) => {
			await seedBase(db);
			const now = new Date().toISOString();
			await db.insert(routines).values({
				id: "routine-soft-deleted",
				name: "Soft deleted",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "paused",
				triggerType: "calendar",
				active: false,
				deletedAt: now,
			});

			await db.insert(routines).values({
				id: "routine-active",
				name: "Active routine",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "active",
				triggerType: "calendar",
				active: true,
			});

			const res = await app.request("/api/routines", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Array<Record<string, unknown>>;
			const ids = body.map((r) => r.id);
			expect(ids).not.toContain("routine-soft-deleted");
			expect(ids).toContain("routine-active");
		});

		test("GET /api/routines/:id returns 404 for soft-deleted routine", async ({ db, app }) => {
			await seedBase(db);
			const now = new Date().toISOString();
			await db.insert(routines).values({
				id: "routine-deleted-404",
				name: "Deleted 404",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "paused",
				triggerType: "calendar",
				active: false,
				deletedAt: now,
			});

			const res = await app.request("/api/routines/routine-deleted-404", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(404);
		});

		test("PATCH /api/routines/:id returns 404 for soft-deleted routine", async ({ db, app }) => {
			await seedBase(db);
			const now = new Date().toISOString();
			await db.insert(routines).values({
				id: "routine-deleted-patch",
				name: "Deleted patch",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "paused",
				triggerType: "calendar",
				active: false,
				deletedAt: now,
			});

			const res = await app.request("/api/routines/routine-deleted-patch", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ name: "New name" }),
			});

			expect(res.status).toBe(404);
		});

		test("soft-deleted routine is preserved in DB (run history intact)", async ({ db, app }) => {
			await seedBase(db);
			await db.insert(routines).values({
				id: "routine-history-preserved",
				name: "History routine",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "active",
				triggerType: "calendar",
				active: true,
			});

			await db.insert(routineRuns).values({
				id: "run-history-kept",
				routineId: "routine-history-preserved",
				startedAt: new Date().toISOString(),
				outcome: "success",
			});

			await app.request("/api/routines/routine-history-preserved", {
				method: "DELETE",
				headers: authHeaders(),
			});

			// Run history should still exist in DB even after soft delete
			const runs = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.routineId, "routine-history-preserved"));
			expect(runs).toHaveLength(1);
			expect(runs[0]!.id).toBe("run-history-kept");
		});
	});

	describe("AC-2: PATCH /api/routines/:id — costCapPerRunMinor update", () => {
		test("updates costCapPerRunMinor via PATCH", async ({ db, app }) => {
			await seedBase(db);
			await db.insert(routines).values({
				id: "routine-cost-cap",
				name: "Cost cap routine",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "active",
				triggerType: "calendar",
				active: true,
			});

			const res = await app.request("/api/routines/routine-cost-cap", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ costCapPerRunMinor: 10000 }),
			});

			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.costCapPerRunMinor).toBe(10000);
		});

		test("sets costCapPerRunMinor to null (removes cap)", async ({ db, app }) => {
			await seedBase(db);
			await db.insert(routines).values({
				id: "routine-remove-cap",
				name: "Remove cap routine",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "active",
				triggerType: "calendar",
				active: true,
				costCapPerRunMinor: 5000,
			});

			const res = await app.request("/api/routines/routine-remove-cap", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ costCapPerRunMinor: null }),
			});

			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.costCapPerRunMinor).toBeNull();
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-5: Coalescing
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-5: Coalescing — trigger skipped when active session exists", () => {
		test("POST /api/routines/:id/trigger returns coalesced=true when active session exists", async ({
			db,
			app,
		}) => {
			await seedBase(db);
			await db.insert(routines).values({
				id: "routine-coalesce-test",
				name: "Coalesce test",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "active",
				triggerType: "calendar",
				active: true,
			});

			// Insert an active session for this routine
			await db.insert(sessions).values({
				id: "session-active-coalesce",
				taskId: "task-aa2",
				agentId: "agent-aa2",
				modelTier: "workhorse",
				startedAt: new Date().toISOString(),
				state: "active",
				routineId: "routine-coalesce-test",
			});

			const res = await app.request("/api/routines/routine-coalesce-test/trigger", {
				method: "POST",
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.fired).toBe(false);
			expect(body.reason).toContain("coalesce");
		});

		test("coalesced trigger inserts a routine_run with outcome=skipped", async ({ db, app }) => {
			await seedBase(db);
			await db.insert(routines).values({
				id: "routine-coalesce-run",
				name: "Coalesce run test",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "active",
				triggerType: "calendar",
				active: true,
			});

			// Insert an active session for this routine
			await db.insert(sessions).values({
				id: "session-active-coalesce-run",
				taskId: "task-aa2",
				agentId: "agent-aa2",
				modelTier: "workhorse",
				startedAt: new Date().toISOString(),
				state: "active",
				routineId: "routine-coalesce-run",
			});

			await app.request("/api/routines/routine-coalesce-run/trigger", {
				method: "POST",
				headers: authHeaders(),
			});

			const runs = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.routineId, "routine-coalesce-run"));
			expect(runs).toHaveLength(1);
			expect(runs[0]!.outcome).toBe("skipped");
		});

		test("trigger fires normally when no active session exists", async ({ db, app }) => {
			await seedBase(db);
			await db.insert(routines).values({
				id: "routine-fires-normally",
				name: "Fires normally",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "active",
				triggerType: "calendar",
				active: true,
			});

			const res = await app.request("/api/routines/routine-fires-normally/trigger", {
				method: "POST",
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-6: RoutineRunOutcome extends to include 'running' and 'timeout'
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-6: GET /api/routines/:id returns runs with new outcome fields", () => {
		test("returns run history with summary field", async ({ db, app }) => {
			await seedBase(db);
			await db.insert(routines).values({
				id: "routine-run-summary",
				name: "Run summary test",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "active",
				triggerType: "calendar",
				active: true,
			});

			await db.insert(routineRuns).values({
				id: "run-with-summary",
				routineId: "routine-run-summary",
				startedAt: new Date().toISOString(),
				endedAt: new Date().toISOString(),
				outcome: "success",
				summary: "Sent 5 messages, all delivered.",
			});

			const res = await app.request("/api/routines/routine-run-summary", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			const runs = body.runs as Array<Record<string, unknown>>;
			expect(runs).toHaveLength(1);
			expect(runs[0]!.summary).toBe("Sent 5 messages, all delivered.");
		});

		test("returns run history with outcome=running", async ({ db, app }) => {
			await seedBase(db);
			await db.insert(routines).values({
				id: "routine-run-running",
				name: "Running outcome test",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "active",
				triggerType: "calendar",
				active: true,
			});

			await db.insert(routineRuns).values({
				id: "run-with-running",
				routineId: "routine-run-running",
				startedAt: new Date().toISOString(),
				outcome: "running",
			});

			const res = await app.request("/api/routines/routine-run-running", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			const runs = body.runs as Array<Record<string, unknown>>;
			expect(runs).toHaveLength(1);
			expect(runs[0]!.outcome).toBe("running");
		});

		test("RoutineInfo includes costCapPerRun and lastRunSummary fields", async ({ db, app }) => {
			await seedBase(db);
			await db.insert(routines).values({
				id: "routine-new-fields",
				name: "New fields test",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "active",
				triggerType: "calendar",
				active: true,
				costCapPerRunMinor: 2500,
				lastRunSummary: "Last run did X and Y.",
			});

			const res = await app.request("/api/routines/routine-new-fields", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			const routine = body.routine as Record<string, unknown>;
			// costCapPerRun should be a WireMoney shape or null
			expect(routine).toHaveProperty("costCapPerRun");
			expect((routine.costCapPerRun as Record<string, unknown>).minor).toBe(2500);
			// lastRunSummary
			expect(routine).toHaveProperty("lastRunSummary", "Last run did X and Y.");
		});

		test("RoutineInfo.costCapPerRun is null when not set", async ({ db, app }) => {
			await seedBase(db);
			await db.insert(routines).values({
				id: "routine-no-cap",
				name: "No cap test",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "active",
				triggerType: "calendar",
				active: true,
			});

			const res = await app.request("/api/routines/routine-no-cap", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			const routine = body.routine as Record<string, unknown>;
			expect(routine.costCapPerRun).toBeNull();
			expect(routine.lastRunSummary).toBeNull();
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-4: Clean session starts — soft-deleted routines excluded from teams list
	// ──────────────────────────────────────────────────────────────────────

	describe("GET /api/teams/:id excludes soft-deleted routines", () => {
		test("does not include soft-deleted routines in team routines list", async ({ db, app }) => {
			await seedBase(db);
			const now = new Date().toISOString();

			await db.insert(routines).values([
				{
					id: "routine-not-deleted",
					name: "Active routine",
					ownerAgentId: "agent-aa2",
					teamId: "team-aa2",
					state: "active",
					triggerType: "calendar",
					active: true,
				},
				{
					id: "routine-soft-deleted-team",
					name: "Deleted routine",
					ownerAgentId: "agent-aa2",
					teamId: "team-aa2",
					state: "paused",
					triggerType: "calendar",
					active: false,
					deletedAt: now,
				},
			]);

			const res = await app.request("/api/teams/team-aa2", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			const teamRoutines = body.routines as Array<Record<string, unknown>>;
			const ids = teamRoutines.map((r) => r.id);
			expect(ids).toContain("routine-not-deleted");
			expect(ids).not.toContain("routine-soft-deleted-team");
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// DB schema: verify new columns exist and are writable
	// ──────────────────────────────────────────────────────────────────────

	// ──────────────────────────────────────────────────────────────────────
	// AC-6 fix: updateRoutineRunOnSessionEnd matches on routineId+outcome,
	// NOT sessionId (which is NULL on the row when the hook fires).
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-6 fix: routine_run updated even when sessionId is NULL on the row", () => {
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aa2-lifecycle-"));
			// AK2 §4a: register the Fabric Strategy so createSession routes through
			// the Strategy Port (fail-loud registry throws if unset).
			setActiveStrategy(fabricStrategy);
		});

		afterEach(() => {
			// AK2 §4a: clear the Strategy registration after each test.
			clearActiveStrategy();
			if (fs.existsSync(tmpDir)) {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}
		});

		test("endSession updates routine_run outcome to success and back-populates sessionId", async ({
			db,
		}) => {
			await seedBase(db);
			// Arrange: seed the routine
			await db.insert(routines).values({
				id: "routine-end-fix",
				name: "End fix routine",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "active",
				triggerType: "calendar",
				active: true,
				stubTaskId: "task-aa2",
			});

			// Create a session via the lifecycle service (this is what provisionSession does)
			const ctx = await createSession(db, new EventBus(), {
				taskId: "task-aa2",
				agentId: "agent-aa2",
				agentRole: "builder",
				productId: "team-aa2",
				modelTier: "workhorse",
				sandboxBasePath: tmpDir,
			});

			// Simulate the trigger path: insert routine_run with outcome="running" and sessionId=NULL
			// This is the state the row is in when endSession fires (before back-population).
			await db.insert(routineRuns).values({
				id: "run-end-fix",
				routineId: "routine-end-fix",
				startedAt: new Date().toISOString(),
				outcome: "running",
				// sessionId intentionally NOT set — simulates the NULL state at hook-fire time
			});

			// Set routineId on the context (as provisionSession does)
			ctx.routineId = "routine-end-fix";

			// Act
			await endSession(db, new EventBus(), ctx, 0);

			// Assert: run row updated with success outcome and sessionId back-populated
			const [run] = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.id, "run-end-fix"))
				.limit(1);

			expect(run).toBeDefined();
			expect(run!.outcome).toBe("success");
			expect(run!.sessionId).toBe(ctx.sessionId);
			expect(run!.endedAt).not.toBeNull();
		});

		test("crashSession updates routine_run outcome to error and back-populates sessionId", async ({
			db,
		}) => {
			await seedBase(db);
			// Arrange
			await db.insert(routines).values({
				id: "routine-crash-fix",
				name: "Crash fix routine",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "active",
				triggerType: "calendar",
				active: true,
				stubTaskId: "task-aa2",
			});

			const ctx = await createSession(db, new EventBus(), {
				taskId: "task-aa2",
				agentId: "agent-aa2",
				agentRole: "builder",
				productId: "team-aa2",
				modelTier: "workhorse",
				sandboxBasePath: tmpDir,
			});

			// routine_run with sessionId=NULL (trigger-inserted state)
			await db.insert(routineRuns).values({
				id: "run-crash-fix",
				routineId: "routine-crash-fix",
				startedAt: new Date().toISOString(),
				outcome: "running",
			});

			ctx.routineId = "routine-crash-fix";

			// Act
			await crashSession(db, new EventBus(), ctx, 0);

			// Assert
			const [run] = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.id, "run-crash-fix"))
				.limit(1);

			expect(run).toBeDefined();
			expect(run!.outcome).toBe("error");
			expect(run!.sessionId).toBe(ctx.sessionId);
			expect(run!.endedAt).not.toBeNull();
		});

		test("no-ops when no running routine_run row exists for the routine", async ({ db }) => {
			await seedBase(db);
			// Arrange
			await db.insert(routines).values({
				id: "routine-noop-fix",
				name: "No-op routine",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "active",
				triggerType: "calendar",
				active: true,
				stubTaskId: "task-aa2",
			});

			const ctx = await createSession(db, new EventBus(), {
				taskId: "task-aa2",
				agentId: "agent-aa2",
				agentRole: "builder",
				productId: "team-aa2",
				modelTier: "workhorse",
				sandboxBasePath: tmpDir,
			});

			// No routine_run row inserted — pre-AA2 session scenario
			ctx.routineId = "routine-noop-fix";

			// Act: should not throw
			await endSession(db, new EventBus(), ctx, 0);

			// Assert: no routine_run rows exist for this routine
			const runs = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.routineId, "routine-noop-fix"));

			expect(runs).toHaveLength(0);
		});
	});

	describe("Schema: new columns on routines and routine_runs", () => {
		test("can insert and read routine with all new AA2 columns", async ({ db }) => {
			await seedBase(db);
			const now = new Date().toISOString();

			await db.insert(routines).values({
				id: "routine-schema-test",
				name: "Schema test",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "active",
				triggerType: "calendar",
				active: true,
				deletedAt: null,
				lastRunSummary: "Previous run succeeded.",
				costCapPerRunMinor: 9999,
				createdAt: now,
				stubTaskId: "task-aa2",
			});

			const [row] = await db
				.select()
				.from(routines)
				.where(eq(routines.id, "routine-schema-test"))
				.limit(1);

			expect(row).toBeDefined();
			expect(row!.deletedAt).toBeNull();
			expect(row!.lastRunSummary).toBe("Previous run succeeded.");
			expect(row!.costCapPerRunMinor).toBe(9999);
			expect(row!.createdAt).toBe(now);
			expect(row!.stubTaskId).toBe("task-aa2");
		});

		test("soft-delete filter (isNull(deletedAt)) works correctly", async ({ db }) => {
			await seedBase(db);
			const now = new Date().toISOString();

			await db.insert(routines).values([
				{
					id: "schema-active-r",
					name: "Active",
					ownerAgentId: "agent-aa2",
					teamId: "team-aa2",
					state: "active",
					triggerType: "calendar",
					active: true,
				},
				{
					id: "schema-deleted-r",
					name: "Deleted",
					ownerAgentId: "agent-aa2",
					teamId: "team-aa2",
					state: "paused",
					triggerType: "calendar",
					active: false,
					deletedAt: now,
				},
			]);

			const visible = await db.select().from(routines).where(isNull(routines.deletedAt));

			const ids = visible.map((r) => r.id);
			expect(ids).toContain("schema-active-r");
			expect(ids).not.toContain("schema-deleted-r");
		});

		test("can insert and read routine_run with sessionId and summary", async ({ db }) => {
			await seedBase(db);
			await db.insert(routines).values({
				id: "routine-run-schema",
				name: "Run schema",
				ownerAgentId: "agent-aa2",
				teamId: "team-aa2",
				state: "active",
				triggerType: "calendar",
				active: true,
			});

			await db.insert(sessions).values({
				id: "session-run-schema",
				taskId: "task-aa2",
				agentId: "agent-aa2",
				modelTier: "workhorse",
				startedAt: new Date().toISOString(),
				state: "active",
				routineId: "routine-run-schema",
			});

			await db.insert(routineRuns).values({
				id: "run-schema-test",
				routineId: "routine-run-schema",
				startedAt: new Date().toISOString(),
				outcome: "running",
				sessionId: "session-run-schema",
				summary: "Test summary",
			});

			const [row] = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.id, "run-schema-test"))
				.limit(1);

			expect(row).toBeDefined();
			expect(row!.sessionId).toBe("session-run-schema");
			expect(row!.summary).toBe("Test summary");
			expect(row!.outcome).toBe("running");
		});
	});
});
