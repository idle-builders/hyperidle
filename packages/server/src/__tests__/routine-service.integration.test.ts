/**
 * AU13 red-phase: Routine service owns writes to `routines`, `routine_runs`.
 *
 * Written BEFORE `../routine-service.ts` exists. Asserts the mechanics from
 * `.pipeline/plans/AU13.md` §5.5:
 *   - insertRoutine: plain insert, plus `onConflictDoNothing` opt-in idempotency
 *     (builtin-routine-handlers.ts's per-team provisioning re-run is a no-op).
 *   - updateRoutineById: plain by-id field-set, patch values may be `SQL`
 *     fragments (session-lifecycle.ts's cost-accumulation coalesce write).
 *   - insertRoutineRun: plain insert.
 *   - updateRoutineRunById: plain by-id field-set; mutates only the addressed
 *     row (session-lifecycle.ts / routine-session-reaper.ts keep their own
 *     "find the running run" SELECT + early-return at the call site).
 *   - updateRoutineRunIfRunning: in-update guard predicate, no `.returning()`,
 *     silent no-op when outcome != "running" (agent-lifecycle-projectors.ts).
 */
import { type HyperIdleDb, routineRuns, routines, teams, users } from "@hyperidle/db";
import { eq, sql } from "drizzle-orm";
import { describe, expect } from "vitest";
import * as routine from "../routine-service.js";
import { test } from "../test-fixtures.js";

async function seedTeamAndAgent(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({
		id: "team-1",
		name: "Test Team",
		phase: "build",
		createdAt: new Date().toISOString(),
	});
	await db.insert(users).values({
		id: "agent-1",
		name: "Agent One",
		role: "builder",
		status: "idle",
		createdAt: new Date().toISOString(),
	});
}

describe("routine-service", () => {
	describe("insertRoutine", () => {
		test("inserts a readable row", async ({ db }) => {
			await seedTeamAndAgent(db);
			await routine.insertRoutine(db, {
				id: "routine-1",
				name: "Test routine",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
			});

			const [row] = await db.select().from(routines).where(eq(routines.id, "routine-1")).limit(1);
			expect(row?.name).toBe("Test routine");
		});

		test("onConflictDoNothing:true makes a re-insert of the same id a no-op, not a throw", async ({
			db,
		}) => {
			await seedTeamAndAgent(db);
			await routine.insertRoutine(
				db,
				{
					id: "routine-1",
					name: "First",
					teamId: "team-1",
					ownerAgentId: "agent-1",
					triggerType: "heartbeat",
				},
				{ onConflictDoNothing: true },
			);

			await routine.insertRoutine(
				db,
				{
					id: "routine-1",
					name: "Second",
					teamId: "team-1",
					ownerAgentId: "agent-1",
					triggerType: "heartbeat",
				},
				{ onConflictDoNothing: true },
			);

			const [row] = await db.select().from(routines).where(eq(routines.id, "routine-1")).limit(1);
			// Original row untouched — the second insert was a no-op.
			expect(row?.name).toBe("First");
		});
	});

	describe("updateRoutineById", () => {
		test("patches only the addressed row", async ({ db }) => {
			await seedTeamAndAgent(db);
			await routine.insertRoutine(db, {
				id: "routine-1",
				name: "R1",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
			});
			await routine.insertRoutine(db, {
				id: "routine-2",
				name: "R2",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
			});

			await routine.updateRoutineById(db, "routine-1", { lastRunAt: "2026-01-01T00:00:00.000Z" });

			const [updated] = await db
				.select()
				.from(routines)
				.where(eq(routines.id, "routine-1"))
				.limit(1);
			const [other] = await db.select().from(routines).where(eq(routines.id, "routine-2")).limit(1);
			expect(updated?.lastRunAt).toBe("2026-01-01T00:00:00.000Z");
			expect(other?.lastRunAt).toBeNull();
		});

		test("accepts an SQL fragment patch value (cost coalesce)", async ({ db }) => {
			await seedTeamAndAgent(db);
			await routine.insertRoutine(db, {
				id: "routine-1",
				name: "R1",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
				costActualMinor: 100,
			});

			await routine.updateRoutineById(db, "routine-1", {
				costActualMinor: sql`coalesce(${routines.costActualMinor}, 0) + ${50}`,
			});

			const [row] = await db.select().from(routines).where(eq(routines.id, "routine-1")).limit(1);
			expect(row?.costActualMinor).toBe(150);
		});
	});

	describe("insertRoutineRun / updateRoutineRunById", () => {
		test("insertRoutineRun inserts a readable row", async ({ db }) => {
			await seedTeamAndAgent(db);
			await routine.insertRoutine(db, {
				id: "routine-1",
				name: "R1",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
			});

			await routine.insertRoutineRun(db, {
				id: "run-1",
				routineId: "routine-1",
				startedAt: new Date().toISOString(),
				outcome: "running",
			});

			const [row] = await db.select().from(routineRuns).where(eq(routineRuns.id, "run-1")).limit(1);
			expect(row?.outcome).toBe("running");
		});

		test("updateRoutineRunById mutates only the addressed row", async ({ db }) => {
			await seedTeamAndAgent(db);
			await routine.insertRoutine(db, {
				id: "routine-1",
				name: "R1",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
			});
			await routine.insertRoutineRun(db, {
				id: "run-1",
				routineId: "routine-1",
				startedAt: new Date().toISOString(),
				outcome: "running",
			});
			await routine.insertRoutineRun(db, {
				id: "run-2",
				routineId: "routine-1",
				startedAt: new Date().toISOString(),
				outcome: "running",
			});

			await routine.updateRoutineRunById(db, "run-1", {
				outcome: "success",
				endedAt: new Date().toISOString(),
			});

			const [updated] = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.id, "run-1"))
				.limit(1);
			const [other] = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.id, "run-2"))
				.limit(1);
			expect(updated?.outcome).toBe("success");
			expect(other?.outcome).toBe("running");
		});
	});

	describe("updateRoutineRunIfRunning", () => {
		test("updates when outcome is currently running", async ({ db }) => {
			await seedTeamAndAgent(db);
			await routine.insertRoutine(db, {
				id: "routine-1",
				name: "R1",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
			});
			await routine.insertRoutineRun(db, {
				id: "run-1",
				routineId: "routine-1",
				startedAt: new Date().toISOString(),
				outcome: "running",
			});

			await routine.updateRoutineRunIfRunning(db, "run-1", {
				outcome: "success",
				endedAt: new Date().toISOString(),
			});

			const [row] = await db.select().from(routineRuns).where(eq(routineRuns.id, "run-1")).limit(1);
			expect(row?.outcome).toBe("success");
		});

		test("silently no-ops when outcome is not running", async ({ db }) => {
			await seedTeamAndAgent(db);
			await routine.insertRoutine(db, {
				id: "routine-1",
				name: "R1",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
			});
			await routine.insertRoutineRun(db, {
				id: "run-1",
				routineId: "routine-1",
				startedAt: new Date().toISOString(),
				outcome: "success",
			});

			await routine.updateRoutineRunIfRunning(db, "run-1", {
				outcome: "error",
				endedAt: new Date().toISOString(),
			});

			const [row] = await db.select().from(routineRuns).where(eq(routineRuns.id, "run-1")).limit(1);
			// Unchanged — the guard predicate missed (outcome was "success", not "running").
			expect(row?.outcome).toBe("success");
		});
	});
});
