/**
 * AU13 red-phase: Routine service owns reads AND writes to `routines`, `routine_runs`.
 *
 * Write-side coverage (plan §5.5, shipped PR #436):
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
 *
 * Read-side coverage (reopened 2026-07-12, plan addendum §A3/§A5), written
 * BEFORE the read functions exist on `../routine-service.ts`:
 *   - get*ById collapses, list/filter fns, exact aggregate predicates
 *     including the soft-delete exclusion (countRoutinesByTeam must NOT
 *     count a soft-deleted routine), sum/avg exact-value assertions.
 *   - R5 tx-visibility: findRunningRoutineRun called with `tx` inside an
 *     open transaction must see an uncommitted row written earlier in the
 *     same `tx`.
 *
 * @lore AU19 Increment 1i: moved from `packages/server/src/__tests__/
 * routine-service.integration.test.ts` — only needs `{ db }` (no `{ app }`/
 * `{ eventBus }`), so it moves into the owning package's own
 * `src/__tests__/`, switching its fixture import to `@hyperidle/db/test-fixtures`
 * (same precedent as `org`'s `org-edges.integration.test.ts`/
 * `org-routing.integration.test.ts`, Increment 1c).
 */
import { type HyperIdleDb, routineRuns, routines, teams, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { eq, sql } from "drizzle-orm";
import { describe } from "vitest";
import * as routine from "../routine-service.js";

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

	// -------------------------------------------------------------------------
	// AU13 read-ownership addendum — reads
	// -------------------------------------------------------------------------

	describe("getRoutineById", () => {
		test("returns the full row for an existing routine", async ({ db }) => {
			await seedTeamAndAgent(db);
			await routine.insertRoutine(db, {
				id: "routine-1",
				name: "R1",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
			});

			const row = await routine.getRoutineById(db, "routine-1");
			expect(row?.name).toBe("R1");
		});

		test("returns undefined for a missing routine", async ({ db }) => {
			const row = await routine.getRoutineById(db, "nope");
			expect(row).toBeUndefined();
		});
	});

	describe("listRoutines", () => {
		test("excludes soft-deleted routines by default", async ({ db }) => {
			await seedTeamAndAgent(db);
			await routine.insertRoutine(db, {
				id: "routine-1",
				name: "Active",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
			});
			await routine.insertRoutine(db, {
				id: "routine-2",
				name: "Deleted",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
				deletedAt: new Date().toISOString(),
			});

			const rows = await routine.listRoutines(db);
			expect(rows.map((r) => r.id)).toEqual(["routine-1"]);
		});

		test("includeDeleted:true returns every row", async ({ db }) => {
			await seedTeamAndAgent(db);
			await routine.insertRoutine(db, {
				id: "routine-1",
				name: "Active",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
			});
			await routine.insertRoutine(db, {
				id: "routine-2",
				name: "Deleted",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
				deletedAt: new Date().toISOString(),
			});

			const rows = await routine.listRoutines(db, { includeDeleted: true });
			expect(rows).toHaveLength(2);
		});
	});

	describe("listRoutinesByTeam", () => {
		test("scopes to team, excludes soft-deleted, orders by id", async ({ db }) => {
			await seedTeamAndAgent(db);
			await db.insert(teams).values({
				id: "team-2",
				name: "Other Team",
				phase: "build",
				createdAt: new Date().toISOString(),
			});
			await routine.insertRoutine(db, {
				id: "routine-b",
				name: "B",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
			});
			await routine.insertRoutine(db, {
				id: "routine-a",
				name: "A",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
			});
			await routine.insertRoutine(db, {
				id: "routine-c",
				name: "Deleted",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
				deletedAt: new Date().toISOString(),
			});
			await routine.insertRoutine(db, {
				id: "routine-other-team",
				name: "Other",
				teamId: "team-2",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
			});

			const rows = await routine.listRoutinesByTeam(db, "team-1");
			expect(rows.map((r) => r.id)).toEqual(["routine-a", "routine-b"]);
		});
	});

	describe("listActiveRoutines", () => {
		test("no opts returns every active routine", async ({ db }) => {
			await seedTeamAndAgent(db);
			await routine.insertRoutine(db, {
				id: "routine-1",
				name: "R1",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
				active: true,
			});
			await routine.insertRoutine(db, {
				id: "routine-2",
				name: "R2",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
				active: false,
			});

			const rows = await routine.listActiveRoutines(db);
			expect(rows.map((r) => r.id)).toEqual(["routine-1"]);
		});

		test("triggerType filters to active + matching triggerType", async ({ db }) => {
			await seedTeamAndAgent(db);
			await routine.insertRoutine(db, {
				id: "routine-event",
				name: "Event",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "event",
				active: true,
			});
			await routine.insertRoutine(db, {
				id: "routine-heartbeat",
				name: "Heartbeat",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
				active: true,
			});

			const rows = await routine.listActiveRoutines(db, { triggerType: "event" });
			expect(rows.map((r) => r.id)).toEqual(["routine-event"]);
		});
	});

	describe("listScheduledRoutinesMissingNextRunAt", () => {
		test("returns active schedulable routines with a null nextRunAt", async ({ db }) => {
			await seedTeamAndAgent(db);
			await routine.insertRoutine(db, {
				id: "routine-missing",
				name: "Missing",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "calendar",
				active: true,
			});
			await routine.insertRoutine(db, {
				id: "routine-has-next",
				name: "HasNext",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "calendar",
				active: true,
				nextRunAt: "2026-01-01T00:00:00.000Z",
			});
			await routine.insertRoutine(db, {
				id: "routine-event-type",
				name: "EventType",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "event",
				active: true,
			});

			const rows = await routine.listScheduledRoutinesMissingNextRunAt(db);
			expect(rows.map((r) => r.id)).toEqual(["routine-missing"]);
		});
	});

	describe("countRoutinesByTeam", () => {
		test("excludes soft-deleted routines from the count", async ({ db }) => {
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
				name: "R2 deleted",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
				deletedAt: new Date().toISOString(),
			});

			const count = await routine.countRoutinesByTeam(db, "team-1");
			expect(count).toBe(1);
		});
	});

	describe("getRoutineRunById", () => {
		test("returns the full row for an existing run", async ({ db }) => {
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

			const row = await routine.getRoutineRunById(db, "run-1");
			expect(row?.routineId).toBe("routine-1");
		});
	});

	describe("findRunningRoutineRun", () => {
		test("finds the running run for a routine, undefined when none running", async ({ db }) => {
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

			const miss = await routine.findRunningRoutineRun(db, "routine-1");
			expect(miss).toBeUndefined();

			await routine.insertRoutineRun(db, {
				id: "run-2",
				routineId: "routine-1",
				startedAt: new Date().toISOString(),
				outcome: "running",
			});

			const hit = await routine.findRunningRoutineRun(db, "routine-1");
			expect(hit?.id).toBe("run-2");
		});

		test("tx-scoped read sees an uncommitted running run written earlier in the same transaction", async ({
			db,
		}) => {
			await seedTeamAndAgent(db);
			await routine.insertRoutine(db, {
				id: "routine-1",
				name: "R1",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
			});

			let sawInTx: { id: string } | undefined;
			await db.transaction(async (tx) => {
				await routine.insertRoutineRun(tx, {
					id: "run-tx",
					routineId: "routine-1",
					startedAt: new Date().toISOString(),
					outcome: "running",
				});
				// Not yet committed — a fn using the pooled `db` (not `tx`) would miss this.
				sawInTx = await routine.findRunningRoutineRun(tx, "routine-1");
			});

			expect(sawInTx?.id).toBe("run-tx");
		});
	});

	describe("listRoutineRunsByRoutine", () => {
		test("limit + order:desc returns the most recent runs first", async ({ db }) => {
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
				startedAt: "2026-01-01T00:00:00.000Z",
				outcome: "success",
			});
			await routine.insertRoutineRun(db, {
				id: "run-2",
				routineId: "routine-1",
				startedAt: "2026-01-02T00:00:00.000Z",
				outcome: "success",
			});

			const latest1 = await routine.listRoutineRunsByRoutine(db, "routine-1", {
				limit: 1,
				order: "desc",
			});
			expect(latest1.map((r) => r.id)).toEqual(["run-2"]);

			const desc20 = await routine.listRoutineRunsByRoutine(db, "routine-1", {
				limit: 20,
				order: "desc",
			});
			expect(desc20.map((r) => r.id)).toEqual(["run-2", "run-1"]);
		});
	});

	describe("sumRoutineRunCostSince / avgRoutineRunCost / sumRoutineRunCostForRoutinesSince", () => {
		test("returns exact aggregate values", async ({ db }) => {
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
			await routine.insertRoutineRun(db, {
				id: "run-1",
				routineId: "routine-1",
				startedAt: "2026-01-05T00:00:00.000Z",
				outcome: "success",
				costMinor: 100,
			});
			await routine.insertRoutineRun(db, {
				id: "run-2",
				routineId: "routine-1",
				startedAt: "2026-01-10T00:00:00.000Z",
				outcome: "success",
				costMinor: 200,
			});
			await routine.insertRoutineRun(db, {
				id: "run-3",
				routineId: "routine-1",
				startedAt: "2025-12-01T00:00:00.000Z",
				outcome: "success",
				costMinor: 9999,
			});
			await routine.insertRoutineRun(db, {
				id: "run-4",
				routineId: "routine-2",
				startedAt: "2026-01-05T00:00:00.000Z",
				outcome: "success",
				costMinor: 50,
			});

			const since = "2026-01-01T00:00:00.000Z";
			const sum = await routine.sumRoutineRunCostSince(db, "routine-1", since);
			expect(sum).toBe(300);

			const avg = await routine.avgRoutineRunCost(db, "routine-1");
			// (100 + 200 + 9999) / 3 = 3433
			expect(avg).toBe(3433);

			const total = await routine.sumRoutineRunCostForRoutinesSince(
				db,
				["routine-1", "routine-2"],
				since,
			);
			expect(total).toBe(350);

			const emptyIds = await routine.sumRoutineRunCostForRoutinesSince(db, [], since);
			expect(emptyIds).toBe(0);
		});
	});
});
