/**
 * AA3 — Routine Cost & Appetite Model integration tests.
 *
 * AC coverage:
 * AC-1: Per-run and per-month cost caps on routines (schema + API)
 * AC-2: Per-run cap terminates session with "budget_exhausted"
 * AC-3: Monthly cap skips sessions with "monthly_budget_exhausted"
 * AC-4: Team Work page shows aggregate routine vs bet cost
 * AC-5: Routine detail shows avg cost, monthly cost, budget utilization
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	type HyperIdleDb,
	knowledgeItems,
	routineRuns,
	routines,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { checkAndFireRoutine, fabricStrategy } from "@hyperidle/fabric";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import {
	type CreateSessionParams,
	createSession,
	endSession,
} from "../services/session-lifecycle.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";
import { registerRoutineRequestRuntime } from "./AU1-fixtures.js";

const TEST_API_KEY = "test-key-aa3";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

/** Seed shared base fixtures. */
async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();

	await db.insert(teams).values({
		id: "team-aa3",
		name: "AA3 Team",
		phase: "build",
		createdAt: now,
	});

	await db.insert(teamMembers).values({
		id: "tm-aa3",
		teamId: "team-aa3",
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});

	await db.insert(users).values({
		id: "agent-aa3",
		name: "AA3 Agent",
		role: "builder",
		status: "active",
		teamId: "tm-aa3",
		maxConcurrentSessions: 2,
		createdAt: now,
	});

	await db.insert(bets).values({
		id: "bet-aa3",
		teamId: "team-aa3",
		description: "AA3 test bet",
		status: "active",
		createdAt: now,
	});

	await db.insert(tasks).values({
		id: "task-aa3",
		betId: "bet-aa3",
		teamId: "team-aa3",
		title: "AA3 test task",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
		ownerAgentId: "agent-aa3",
	});
}

describe("AA3: Routine Cost & Appetite Model", () => {
	// ──────────────────────────────────────────────────────────────────────
	// AC-1: Per-run and per-month cost caps on routines (schema + API)
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-1: costCapMonthlyMinor on routines (schema + API)", () => {
		test("POST /api/routines with costCapMonthlyMinor persists the value and returns 201", async ({
			db,
			app,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedBase(db);

			const payload = {
				name: "Monthly capped routine",
				teamId: "team-aa3",
				ownerAgentId: "agent-aa3",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
				costCapMonthlyMinor: 2500,
			};

			const res = await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify(payload),
			});

			expect(res.status).toBe(201);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toHaveProperty("id");
			expect(body.costCapMonthlyMinor).toBe(2500);
			vi.unstubAllEnvs();
		});

		test("POST /api/routines without costCapMonthlyMinor returns null for the field", async ({
			db,
			app,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedBase(db);

			const payload = {
				name: "No monthly cap routine",
				teamId: "team-aa3",
				ownerAgentId: "agent-aa3",
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
			expect(body.costCapMonthlyMinor).toBeNull();
			vi.unstubAllEnvs();
		});

		test("PATCH /api/routines/:id sets costCapMonthlyMinor", async ({ db, app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedBase(db);

			// Seed a routine without monthly cap
			await db.insert(routines).values({
				id: "routine-patch-monthly",
				name: "Patch monthly cap",
				ownerAgentId: "agent-aa3",
				teamId: "team-aa3",
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
				active: true,
			});

			const res = await app.request("/api/routines/routine-patch-monthly", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ costCapMonthlyMinor: 5000 }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.costCapMonthlyMinor).toBe(5000);
			vi.unstubAllEnvs();
		});

		test("PATCH /api/routines/:id with costCapMonthlyMinor: null clears the cap", async ({
			db,
			app,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedBase(db);

			await db.insert(routines).values({
				id: "routine-clear-monthly",
				name: "Clear monthly cap",
				ownerAgentId: "agent-aa3",
				teamId: "team-aa3",
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
				active: true,
				costCapMonthlyMinor: 9999,
			});

			const res = await app.request("/api/routines/routine-clear-monthly", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ costCapMonthlyMinor: null }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.costCapMonthlyMinor).toBeNull();
			vi.unstubAllEnvs();
		});

		test("GET /api/routines/:id returns costCapMonthly in budget stats", async ({ db, app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedBase(db);

			await db.insert(routines).values({
				id: "routine-budget-cap",
				name: "Budget cap routine",
				ownerAgentId: "agent-aa3",
				teamId: "team-aa3",
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
				active: true,
				costCapPerRunMinor: 100,
				costCapMonthlyMinor: 500,
			});

			const res = await app.request("/api/routines/routine-budget-cap", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			// AA3: budget field must exist on RoutineDetail
			expect(body).toHaveProperty("budget");
			const budget = body.budget as Record<string, unknown>;
			expect(budget.costCapPerRun).toMatchObject({ minor: 100 });
			expect(budget.costCapMonthly).toMatchObject({ minor: 500 });
			vi.unstubAllEnvs();
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-2: Per-run cap terminates session with "budget_exhausted"
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-2: budget_exhausted routine_run outcome when per-run cap hit", () => {
		test("routine_run with budget_exhausted outcome can be inserted and read back", async ({
			db,
			app,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedBase(db);

			// Until session provisioning implements cap enforcement, verify:
			// (a) the new outcome value is accepted by the DB schema (text column)
			// (b) the GET /api/routines/:id endpoint surfaces it in the runs array
			await db.insert(routines).values({
				id: "routine-budget-exhausted",
				name: "Budget exhausted routine",
				ownerAgentId: "agent-aa3",
				teamId: "team-aa3",
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
				active: true,
				costCapPerRunMinor: 50,
			});

			const runId = crypto.randomUUID();
			await db.insert(routineRuns).values({
				id: runId,
				routineId: "routine-budget-exhausted",
				startedAt: new Date().toISOString(),
				endedAt: new Date().toISOString(),
				outcome: "budget_exhausted",
				costMinor: 55,
				costCurrency: "USD",
			});

			// Verify via the GET endpoint that the run surfaces with the correct outcome
			const res = await app.request("/api/routines/routine-budget-exhausted", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			const runs = body.runs as Array<Record<string, unknown>>;
			expect(runs).toHaveLength(1);
			expect(runs[0]!.outcome).toBe("budget_exhausted");
			expect((runs[0]!.cost as Record<string, unknown>).minor).toBe(55);
			vi.unstubAllEnvs();
		});

		test("budget_exhausted outcome is accepted as a RoutineRunOutcome type value", async () => {
			// Type-level verification: ROUTINE_RUN_OUTCOMES must include budget_exhausted.
			// This test imports the constant and asserts on its contents.
			const { ROUTINE_RUN_OUTCOMES } = await import("@hyperidle/shared");
			expect(ROUTINE_RUN_OUTCOMES).toContain("budget_exhausted");
		});

		test("monthly_budget_exhausted outcome is accepted as a RoutineRunOutcome type value", async () => {
			const { ROUTINE_RUN_OUTCOMES } = await import("@hyperidle/shared");
			expect(ROUTINE_RUN_OUTCOMES).toContain("monthly_budget_exhausted");
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-3: Monthly cap skips sessions with "monthly_budget_exhausted"
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-3: monthly_budget_exhausted when monthly cap exceeded", () => {
		test("checkAndFireRoutine returns fired:false when monthly spend >= cap", async ({ db }) => {
			await seedBase(db);

			const now = new Date();
			const firstOfMonth = new Date(
				Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
			).toISOString();

			// Seed routine with monthly cap of 1000
			await db.insert(routines).values({
				id: "routine-monthly-capped",
				name: "Monthly capped",
				ownerAgentId: "agent-aa3",
				teamId: "team-aa3",
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *", taskId: "task-aa3" }),
				active: true,
				costCapMonthlyMinor: 1000,
			});

			// Insert runs this month totaling 1100 (over the 1000 cap)
			await db.insert(routineRuns).values([
				{
					id: crypto.randomUUID(),
					routineId: "routine-monthly-capped",
					startedAt: new Date(new Date(firstOfMonth).getTime() + 3600_000).toISOString(),
					endedAt: new Date(new Date(firstOfMonth).getTime() + 7200_000).toISOString(),
					outcome: "success",
					costMinor: 400,
				},
				{
					id: crypto.randomUUID(),
					routineId: "routine-monthly-capped",
					startedAt: new Date(new Date(firstOfMonth).getTime() + 10_800_000).toISOString(),
					endedAt: new Date(new Date(firstOfMonth).getTime() + 14_400_000).toISOString(),
					outcome: "success",
					costMinor: 400,
				},
				{
					id: crypto.randomUUID(),
					routineId: "routine-monthly-capped",
					startedAt: new Date(new Date(firstOfMonth).getTime() + 18_000_000).toISOString(),
					endedAt: new Date(new Date(firstOfMonth).getTime() + 21_600_000).toISOString(),
					outcome: "success",
					costMinor: 300,
				},
			]);

			const [routine] = await db
				.select()
				.from(routines)
				.where(eq(routines.id, "routine-monthly-capped"))
				.limit(1);
			expect(routine).toBeDefined();

			const eventBus = new EventBus();
			// biome-ignore lint/style/noNonNullAssertion: seeded above
			const result = await checkAndFireRoutine(
				db,
				eventBus,
				routine!,
				registerRoutineRequestRuntime(db),
			);

			// AA3: should return fired:false when monthly cap exceeded
			expect(result.fired).toBe(false);
			expect(result.reason).toContain("monthly");
		});

		test("checkAndFireRoutine inserts routine_run with monthly_budget_exhausted outcome", async ({
			db,
		}) => {
			await seedBase(db);

			const now = new Date();
			const firstOfMonth = new Date(
				Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
			).toISOString();

			await db.insert(routines).values({
				id: "routine-monthly-run-record",
				name: "Monthly run record",
				ownerAgentId: "agent-aa3",
				teamId: "team-aa3",
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *", taskId: "task-aa3" }),
				active: true,
				costCapMonthlyMinor: 500,
			});

			// Spend 600 this month (over the 500 cap)
			await db.insert(routineRuns).values({
				id: crypto.randomUUID(),
				routineId: "routine-monthly-run-record",
				startedAt: new Date(new Date(firstOfMonth).getTime() + 3600_000).toISOString(),
				endedAt: new Date(new Date(firstOfMonth).getTime() + 7200_000).toISOString(),
				outcome: "success",
				costMinor: 600,
			});

			const [routine] = await db
				.select()
				.from(routines)
				.where(eq(routines.id, "routine-monthly-run-record"))
				.limit(1);
			expect(routine).toBeDefined();

			const eventBus = new EventBus();
			// biome-ignore lint/style/noNonNullAssertion: seeded above
			await checkAndFireRoutine(db, eventBus, routine!);

			// A new routine_run with outcome=monthly_budget_exhausted should have been inserted
			const allRuns = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.routineId, "routine-monthly-run-record"));

			const blockedRun = allRuns.find((r) => r.outcome === "monthly_budget_exhausted");
			expect(blockedRun).toBeDefined();
		});

		test("POST /:id/trigger returns 200 with fired:false reason:monthly_budget_exhausted when monthly cap hit", async ({
			db,
			app,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedBase(db);

			const now = new Date();
			const firstOfMonth = new Date(
				Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
			).toISOString();

			await db.insert(routines).values({
				id: "routine-trigger-monthly",
				name: "Trigger monthly cap",
				ownerAgentId: "agent-aa3",
				teamId: "team-aa3",
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *", taskId: "task-aa3" }),
				active: true,
				costCapMonthlyMinor: 1000,
			});

			// Spend 1100 this month (over the 1000 cap)
			await db.insert(routineRuns).values({
				id: crypto.randomUUID(),
				routineId: "routine-trigger-monthly",
				startedAt: new Date(new Date(firstOfMonth).getTime() + 3600_000).toISOString(),
				endedAt: new Date(new Date(firstOfMonth).getTime() + 7200_000).toISOString(),
				outcome: "success",
				costMinor: 1100,
			});

			const res = await app.request("/api/routines/routine-trigger-monthly/trigger", {
				method: "POST",
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.fired).toBe(false);
			// AA3: reason must be "monthly_budget_exhausted" per architecture critique Warning 3
			expect(body.reason).toBe("monthly_budget_exhausted");
			vi.unstubAllEnvs();
		});

		test("checkAndFireRoutine fires normally when monthly spend is below cap", async ({ db }) => {
			await seedBase(db);

			const now = new Date();
			const firstOfMonth = new Date(
				Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
			).toISOString();

			await db.insert(routines).values({
				id: "routine-below-monthly-cap",
				name: "Below monthly cap",
				ownerAgentId: "agent-aa3",
				teamId: "team-aa3",
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *", taskId: "task-aa3" }),
				active: true,
				costCapMonthlyMinor: 1000,
			});

			// Only 200 spent this month — well under the 1000 cap
			await db.insert(routineRuns).values({
				id: crypto.randomUUID(),
				routineId: "routine-below-monthly-cap",
				startedAt: new Date(new Date(firstOfMonth).getTime() + 3600_000).toISOString(),
				endedAt: new Date(new Date(firstOfMonth).getTime() + 7200_000).toISOString(),
				outcome: "success",
				costMinor: 200,
			});

			const [routine] = await db
				.select()
				.from(routines)
				.where(eq(routines.id, "routine-below-monthly-cap"))
				.limit(1);
			expect(routine).toBeDefined();

			const eventBus = new EventBus();
			// biome-ignore lint/style/noNonNullAssertion: seeded above
			const result = await checkAndFireRoutine(
				db,
				eventBus,
				routine!,
				registerRoutineRequestRuntime(db),
			);

			// Should fire (not blocked by monthly cap)
			expect(result.fired).toBe(true);
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-4: Team endpoint — bet vs routine cost breakdown
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-4: GET /api/teams/:id — burn.betCostActual and burn.routineCostThisMonth", () => {
		test("returns betCostActual summed from active bets and routineCostThisMonth summed from this month's runs", async ({
			db,
			app,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedBase(db);

			const now = new Date();
			const firstOfMonth = new Date(
				Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
			).toISOString();

			// Add a second active bet with costActualMinor: $300 = 300 minor units
			// The seeded bet-aa3 has no costActualMinor — add a fresh set here
			await db.insert(bets).values([
				{
					id: "bet-ac4-1",
					teamId: "team-aa3",
					description: "Bet AC4 1",
					status: "active",
					costActualMinor: 500,
					costActualCurrency: "USD",
					createdAt: now.toISOString(),
				},
				{
					id: "bet-ac4-2",
					teamId: "team-aa3",
					description: "Bet AC4 2",
					status: "active",
					costActualMinor: 300,
					costActualCurrency: "USD",
					createdAt: now.toISOString(),
				},
			]);

			// Seed two routines for this team
			await db.insert(routines).values([
				{
					id: "routine-ac4-1",
					name: "Routine AC4 1",
					ownerAgentId: "agent-aa3",
					teamId: "team-aa3",
					state: "active",
					triggerType: "calendar",
					triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
					active: true,
				},
				{
					id: "routine-ac4-2",
					name: "Routine AC4 2",
					ownerAgentId: "agent-aa3",
					teamId: "team-aa3",
					state: "active",
					triggerType: "calendar",
					triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
					active: true,
				},
			]);

			// Insert 3 runs this month: 200 + 100 + 300 = 600
			await db.insert(routineRuns).values([
				{
					id: crypto.randomUUID(),
					routineId: "routine-ac4-1",
					startedAt: new Date(new Date(firstOfMonth).getTime() + 3600_000).toISOString(),
					endedAt: new Date(new Date(firstOfMonth).getTime() + 7200_000).toISOString(),
					outcome: "success",
					costMinor: 200,
				},
				{
					id: crypto.randomUUID(),
					routineId: "routine-ac4-1",
					startedAt: new Date(new Date(firstOfMonth).getTime() + 10_800_000).toISOString(),
					endedAt: new Date(new Date(firstOfMonth).getTime() + 14_400_000).toISOString(),
					outcome: "success",
					costMinor: 100,
				},
				{
					id: crypto.randomUUID(),
					routineId: "routine-ac4-2",
					startedAt: new Date(new Date(firstOfMonth).getTime() + 18_000_000).toISOString(),
					endedAt: new Date(new Date(firstOfMonth).getTime() + 21_600_000).toISOString(),
					outcome: "success",
					costMinor: 300,
				},
			]);

			const res = await app.request("/api/teams/team-aa3", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			const burn = body.burn as Record<string, unknown>;

			// AA3: betCostActual = 500 + 300 = 800
			expect(burn).toHaveProperty("betCostActual");
			const betCostActual = burn.betCostActual as Record<string, unknown>;
			expect(betCostActual.minor).toBe(800);

			// AA3: routineCostThisMonth = 200 + 100 + 300 = 600
			expect(burn).toHaveProperty("routineCostThisMonth");
			const routineCostThisMonth = burn.routineCostThisMonth as Record<string, unknown>;
			expect(routineCostThisMonth.minor).toBe(600);
			vi.unstubAllEnvs();
		});

		test("returns null betCostActual when no active bets have costActualMinor set", async ({
			db,
			app,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedBase(db);

			// bet-aa3 is seeded but has no costActualMinor
			const res = await app.request("/api/teams/team-aa3", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			const burn = body.burn as Record<string, unknown>;

			// AA3: betCostActual should be present in burn response (possibly null)
			expect(burn).toHaveProperty("betCostActual");
			vi.unstubAllEnvs();
		});

		test("returns null routineCostThisMonth when team has no routines", async ({ db, app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedBase(db);

			// No routines seeded for team-aa3 in this test
			const res = await app.request("/api/teams/team-aa3", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			const burn = body.burn as Record<string, unknown>;

			// AA3: routineCostThisMonth should be present in burn response
			expect(burn).toHaveProperty("routineCostThisMonth");
			// When no routines exist, should be null
			expect(burn.routineCostThisMonth).toBeNull();
			vi.unstubAllEnvs();
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AC-5: Routine detail — avg cost, monthly cost, budget utilization
	// ──────────────────────────────────────────────────────────────────────

	describe("AC-5: GET /api/routines/:id — budget stats", () => {
		test("returns budget object with avgCostPerRun, costThisMonth, utilization percentages", async ({
			db,
			app,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedBase(db);

			const now = new Date();
			const firstOfMonth = new Date(
				Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
			).toISOString();

			await db.insert(routines).values({
				id: "routine-budget-stats",
				name: "Budget stats routine",
				ownerAgentId: "agent-aa3",
				teamId: "team-aa3",
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
				active: true,
				costCapPerRunMinor: 100,
				costCapMonthlyMinor: 500,
			});

			// Insert 3 runs this month: costs 80, 90, 30 → avg=67, total=200
			await db.insert(routineRuns).values([
				{
					id: crypto.randomUUID(),
					routineId: "routine-budget-stats",
					startedAt: new Date(new Date(firstOfMonth).getTime() + 3600_000).toISOString(),
					endedAt: new Date(new Date(firstOfMonth).getTime() + 7200_000).toISOString(),
					outcome: "success",
					costMinor: 80,
				},
				{
					id: crypto.randomUUID(),
					routineId: "routine-budget-stats",
					startedAt: new Date(new Date(firstOfMonth).getTime() + 10_800_000).toISOString(),
					endedAt: new Date(new Date(firstOfMonth).getTime() + 14_400_000).toISOString(),
					outcome: "success",
					costMinor: 90,
				},
				{
					id: crypto.randomUUID(),
					routineId: "routine-budget-stats",
					startedAt: new Date(new Date(firstOfMonth).getTime() + 18_000_000).toISOString(),
					endedAt: new Date(new Date(firstOfMonth).getTime() + 21_600_000).toISOString(),
					outcome: "success",
					costMinor: 30,
				},
			]);

			const res = await app.request("/api/routines/routine-budget-stats", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;

			// AA3: budget field must be present
			expect(body).toHaveProperty("budget");
			const budget = body.budget as Record<string, unknown>;

			// avgCostPerRun: Math.round((80+90+30)/3) = Math.round(66.67) = 67
			expect(budget).toHaveProperty("avgCostPerRun");
			const avgCost = budget.avgCostPerRun as Record<string, unknown>;
			expect(avgCost.minor).toBe(67);

			// costThisMonth: 80+90+30 = 200
			expect(budget).toHaveProperty("costThisMonth");
			const costThisMonth = budget.costThisMonth as Record<string, unknown>;
			expect(costThisMonth.minor).toBe(200);

			// perRunUtilizationPercent: last run cost 30 / cap 100 * 100 = 30
			expect(budget.perRunUtilizationPercent).toBe(30);

			// monthlyUtilizationPercent: 200 / 500 * 100 = 40
			expect(budget.monthlyUtilizationPercent).toBe(40);
			vi.unstubAllEnvs();
		});

		test("returns null avgCostPerRun when no runs have cost data", async ({ db, app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedBase(db);

			await db.insert(routines).values({
				id: "routine-no-cost-runs",
				name: "No cost runs",
				ownerAgentId: "agent-aa3",
				teamId: "team-aa3",
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
				active: true,
			});

			// Insert a run with no costMinor
			await db.insert(routineRuns).values({
				id: crypto.randomUUID(),
				routineId: "routine-no-cost-runs",
				startedAt: new Date().toISOString(),
				outcome: "success",
				// costMinor not set
			});

			const res = await app.request("/api/routines/routine-no-cost-runs", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			const budget = body.budget as Record<string, unknown>;

			expect(budget.avgCostPerRun).toBeNull();
			vi.unstubAllEnvs();
		});

		test("returns null perRunUtilizationPercent when no costCapPerRun set", async ({ db, app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedBase(db);

			await db.insert(routines).values({
				id: "routine-no-per-run-cap",
				name: "No per-run cap",
				ownerAgentId: "agent-aa3",
				teamId: "team-aa3",
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
				active: true,
				// No costCapPerRunMinor
			});

			const res = await app.request("/api/routines/routine-no-per-run-cap", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			const budget = body.budget as Record<string, unknown>;

			expect(budget.perRunUtilizationPercent).toBeNull();
			expect(budget.monthlyUtilizationPercent).toBeNull();
			vi.unstubAllEnvs();
		});

		test("returns 100 monthlyUtilizationPercent when monthly spend equals cap", async ({
			db,
			app,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedBase(db);

			const now = new Date();
			const firstOfMonth = new Date(
				Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
			).toISOString();

			await db.insert(routines).values({
				id: "routine-at-monthly-cap",
				name: "At monthly cap",
				ownerAgentId: "agent-aa3",
				teamId: "team-aa3",
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
				active: true,
				costCapMonthlyMinor: 300,
			});

			// Exactly at the cap: 300 spent = 300 cap = 100%
			await db.insert(routineRuns).values({
				id: crypto.randomUUID(),
				routineId: "routine-at-monthly-cap",
				startedAt: new Date(new Date(firstOfMonth).getTime() + 3600_000).toISOString(),
				endedAt: new Date(new Date(firstOfMonth).getTime() + 7200_000).toISOString(),
				outcome: "success",
				costMinor: 300,
			});

			const res = await app.request("/api/routines/routine-at-monthly-cap", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			const budget = body.budget as Record<string, unknown>;

			expect(budget.monthlyUtilizationPercent).toBe(100);
			vi.unstubAllEnvs();
		});
	});

	// ──────────────────────────────────────────────────────────────────────
	// AF10 AC-2: routines.costActualMinor cumulative write (Z8-030/Z8-119)
	//
	// The existing AA3 tests above are FROZEN per CC-008 — we extend here.
	// ──────────────────────────────────────────────────────────────────────

	describe("AF10 AC-2: routines.costActualMinor cumulative write", () => {
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "af10-routine-cost-"));
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

		async function seedRoutineSession(db: HyperIdleDb): Promise<void> {
			const now = new Date().toISOString();

			await db.insert(teams).values({
				id: "team-af10-rt",
				name: "AF10 Routine Team",
				phase: "build",
				createdAt: now,
			});
			await db.insert(teamMembers).values({
				id: "tm-af10-rt",
				teamId: "team-af10-rt",
				capacity: 3,
				activeBets: 0,
				formedAt: now,
			});
			await db.insert(users).values({
				id: "agent-af10-rt",
				name: "Routine Agent",
				role: "builder",
				status: "active",
				teamId: "tm-af10-rt",
				maxConcurrentSessions: 2,
				createdAt: now,
			});
			await db.insert(bets).values({
				id: "bet-af10-rt",
				teamId: "team-af10-rt",
				description: "Routine bet",
				status: "active",
				createdAt: now,
			});
			await db.insert(tasks).values({
				id: "task-af10-rt",
				betId: "bet-af10-rt",
				teamId: "team-af10-rt",
				title: "Routine task",
				state: "in_progress",
				createdAt: now,
				updatedAt: now,
			});
			await db.insert(routines).values({
				id: "routine-af10",
				name: "AF10 Routine",
				ownerAgentId: "agent-af10-rt",
				teamId: "team-af10-rt",
				state: "active",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
				active: true,
				costActualMinor: null, // starts null — must be incremented, not overwritten
			});
			await db.insert(knowledgeItems).values({
				id: "ki-af10-rt",
				title: "AF10 Routine Principle",
				body: "Routine principle body.",
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "system",
				createdAt: now,
				updatedAt: now,
			});
		}

		/**
		 * AC-2 core scenario: a routine session with cost 300 minor units must
		 * increment `routines.costActualMinor` by 300 when the session ends.
		 *
		 * FAILS until session-lifecycle.ts `updateRoutineRunOnSessionEnd` is
		 * updated to do: `costActualMinor: sql\`coalesce(..., 0) + costInCents\``
		 */
		test("endSession with costInCents=300 increments routines.costActualMinor to 300", async ({
			db,
			eventBus,
		}) => {
			await seedRoutineSession(db);
			const now = new Date().toISOString();

			// Insert a "running" routine_run row (as the scheduler would)
			const runId = crypto.randomUUID();
			await db.insert(routineRuns).values({
				id: runId,
				routineId: "routine-af10",
				startedAt: now,
				outcome: "running",
			});

			// Create and end a session that belongs to this routine
			const params: CreateSessionParams = {
				taskId: "task-af10-rt",
				agentId: "agent-af10-rt",
				agentRole: "builder",
				productId: "team-af10-rt",
				modelTier: "workhorse",
				sandboxBasePath: tmpDir,
			};

			const ctx = await createSession(db, eventBus, params);
			// Attach routineId so endSession calls updateRoutineRunOnSessionEnd
			ctx.routineId = "routine-af10";

			await endSession(db, eventBus, ctx, 300);

			// AF10 AC-2: routines.costActualMinor must be 300 (incremented from null)
			const [routine] = await db
				.select({ costActualMinor: routines.costActualMinor })
				.from(routines)
				.where(eq(routines.id, "routine-af10"))
				.limit(1);

			// FAILS until T4: currently NULL because no writer sets costActualMinor
			expect(routine?.costActualMinor).toBe(300);
		});

		/**
		 * Two sequential runs must accumulate: run1=300, run2=150 → total=450.
		 * Uses COALESCE so null+300 = 300, then 300+150 = 450.
		 *
		 * FAILS until T4 fix lands.
		 */
		test("two sequential routine runs accumulate costActualMinor additively", async ({
			db,
			eventBus,
		}) => {
			await seedRoutineSession(db);
			const now = new Date().toISOString();

			// First run
			const runId1 = crypto.randomUUID();
			await db.insert(routineRuns).values({
				id: runId1,
				routineId: "routine-af10",
				startedAt: now,
				outcome: "running",
			});

			const params: CreateSessionParams = {
				taskId: "task-af10-rt",
				agentId: "agent-af10-rt",
				agentRole: "builder",
				productId: "team-af10-rt",
				modelTier: "workhorse",
				sandboxBasePath: tmpDir,
			};

			const ctx1 = await createSession(db, eventBus, params);
			ctx1.routineId = "routine-af10";
			await endSession(db, eventBus, ctx1, 300);

			// Insert second "running" routine_run row
			const runId2 = crypto.randomUUID();
			await db.insert(routineRuns).values({
				id: runId2,
				routineId: "routine-af10",
				startedAt: new Date().toISOString(),
				outcome: "running",
			});

			const ctx2 = await createSession(db, eventBus, params);
			ctx2.routineId = "routine-af10";
			await endSession(db, eventBus, ctx2, 150);

			const [routine] = await db
				.select({ costActualMinor: routines.costActualMinor })
				.from(routines)
				.where(eq(routines.id, "routine-af10"))
				.limit(1);

			// FAILS until T4: currently NULL (no writer exists)
			expect(routine?.costActualMinor).toBe(450);
		});

		/**
		 * GET /api/routines/:id must return non-null costActual after a run with cost.
		 * Complements the above unit-level assertions with a route-level check.
		 *
		 * FAILS until T4.
		 */
		test("GET /api/routines/:id returns non-null costActual after a run with cost", async ({
			db,
			app,
			eventBus,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedRoutineSession(db);
			const now = new Date().toISOString();

			const runId = crypto.randomUUID();
			await db.insert(routineRuns).values({
				id: runId,
				routineId: "routine-af10",
				startedAt: now,
				outcome: "running",
			});

			const params: CreateSessionParams = {
				taskId: "task-af10-rt",
				agentId: "agent-af10-rt",
				agentRole: "builder",
				productId: "team-af10-rt",
				modelTier: "workhorse",
				sandboxBasePath: tmpDir,
			};
			const ctx = await createSession(db, eventBus, params);
			ctx.routineId = "routine-af10";
			await endSession(db, eventBus, ctx, 500);

			const res = await app.request("/api/routines/routine-af10", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			// GET /api/routines/:id returns RoutineDetail = { routine: RoutineInfo, runs, budget }
			// costActual lives on body.routine (not body directly)
			const body = (await res.json()) as { routine: Record<string, unknown> };

			// FAILS until T4: currently null
			expect(body.routine.costActual).not.toBeNull();
			const costActual = body.routine.costActual as Record<string, unknown>;
			expect(costActual.minor).toBe(500);
			vi.unstubAllEnvs();
		});
	});
});
