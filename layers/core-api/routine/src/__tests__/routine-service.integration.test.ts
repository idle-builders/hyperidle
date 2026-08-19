/**
 * AU13 red-phase: Routine service owns reads AND writes to `routines`, `routine_runs`.
 *
 * Write-side coverage (plan §5.5, shipped PR #436):
 *   - insertRoutine: plain insert, plus `onConflictDoNothing` opt-in idempotency
 *     (builtin-routine-handlers.ts's per-team provisioning re-run is a no-op).
 *   - updateRoutine: plain by-id field-set.
 *   - insertRoutineRun: plain insert.
 *   - updateRoutineRun: by-id field-set; `opts.onlyIfRunning` adds a
 *     WHERE outcome='running' guard — silent no-op when predicate misses.
 *
 * Read-side coverage (reopened 2026-07-12, plan addendum §A3/§A5), written
 * BEFORE the read functions exist on `../routine-service.ts`:
 *   - get*ById collapses, list/filter fns, exact aggregate predicates
 *     including the soft-delete exclusion (countRoutinesByTeam must NOT
 *     count a soft-deleted routine), sum/avg exact-value assertions.
 *   - R5 tx-visibility: listRoutineRuns called with `tx` inside an
 *     open transaction must see an uncommitted row written earlier in the
 *     same `tx`.
 *
 * @lore AU19 Increment 1i: moved from `packages/server/src/__tests__/
 * routine-service.integration.test.ts` — only needs `{ db }` (no `{ app }`/
 * `{ eventBus }`), so it moves into the owning package's own
 * `src/__tests__/`, switching its fixture import to `@hyperidle/db/test-fixtures`
 * (same precedent as `org`'s `org-edges.integration.test.ts`/
 * `org-routing.integration.test.ts`, Increment 1c).
 *
 * @lore AU20 Am2: updated to use the collapsed public API (`getRoutine`,
 * `updateRoutine`, `updateRoutineRun`, `listRoutines(filter)`, `listRoutineRuns(filter)`,
 * `getRoutineRun`). AU21 Increment 14a: `sumRunCost` deleted along with the
 * rest of the cost feature.
 */
import { type HyperIdleDb, routineRuns, routines, teamMembers, teams, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import * as routine from "../routine-service.js";

async function seedTeamAndAgent(db: HyperIdleDb): Promise<void> {
	const createdAt = new Date().toISOString();
	await db.insert(teams).values({
		id: "team-1",
		name: "Test Team",
		phase: "build",
		createdAt,
	});
	// The owner writes the membership row alongside the team.
	await db.insert(teamMembers).values({
		id: "team-1-members",
		teamId: "team-1",
		capacity: 5,
		activeBets: 0,
		formedAt: createdAt,
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

	describe("updateRoutine", () => {
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

			await routine.updateRoutine(db, "routine-1", { lastRunAt: "2026-01-01T00:00:00.000Z" });

			const [updated] = await db
				.select()
				.from(routines)
				.where(eq(routines.id, "routine-1"))
				.limit(1);
			const [other] = await db.select().from(routines).where(eq(routines.id, "routine-2")).limit(1);
			expect(updated?.lastRunAt).toBe("2026-01-01T00:00:00.000Z");
			expect(other?.lastRunAt).toBeNull();
		});
	});

	describe("insertRoutineRun / updateRoutineRun", () => {
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

		test("updateRoutineRun mutates only the addressed row", async ({ db }) => {
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

			await routine.updateRoutineRun(db, "run-1", {
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

	describe("updateRoutineRun with onlyIfRunning", () => {
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

			await routine.updateRoutineRun(
				db,
				"run-1",
				{
					outcome: "success",
					endedAt: new Date().toISOString(),
				},
				{ onlyIfRunning: true },
			);

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

			await routine.updateRoutineRun(
				db,
				"run-1",
				{
					outcome: "error",
					endedAt: new Date().toISOString(),
				},
				{ onlyIfRunning: true },
			);

			const [row] = await db.select().from(routineRuns).where(eq(routineRuns.id, "run-1")).limit(1);
			// Unchanged — the guard predicate missed (outcome was "success", not "running").
			expect(row?.outcome).toBe("success");
		});
	});

	// -------------------------------------------------------------------------
	// AU13 read-ownership addendum — reads
	// -------------------------------------------------------------------------

	describe("getRoutine", () => {
		test("returns the full row for an existing routine", async ({ db }) => {
			await seedTeamAndAgent(db);
			await routine.insertRoutine(db, {
				id: "routine-1",
				name: "R1",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
			});

			const row = await routine.getRoutine(db, "routine-1");
			expect(row?.name).toBe("R1");
		});

		test("returns undefined for a missing routine", async ({ db }) => {
			const row = await routine.getRoutine(db, "nope");
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

	describe("listRoutines / teamId filter", () => {
		test("scopes to team, excludes soft-deleted, orders by id", async ({ db }) => {
			await seedTeamAndAgent(db);
			const team2CreatedAt = new Date().toISOString();
			await db.insert(teams).values({
				id: "team-2",
				name: "Other Team",
				phase: "build",
				createdAt: team2CreatedAt,
			});
			// The owner writes the membership row alongside the team.
			await db.insert(teamMembers).values({
				id: "team-2-members",
				teamId: "team-2",
				capacity: 5,
				activeBets: 0,
				formedAt: team2CreatedAt,
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

			const rows = await routine.listRoutines(db, { teamId: "team-1" });
			expect(rows.map((r) => r.id)).toEqual(["routine-a", "routine-b"]);
		});
	});

	describe("listRoutines / active filter", () => {
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

			const rows = await routine.listRoutines(db, { active: true });
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

			const rows = await routine.listRoutines(db, { active: true, triggerType: "event" });
			expect(rows.map((r) => r.id)).toEqual(["routine-event"]);
		});
	});

	describe("listRoutines / missingNextRunAt filter", () => {
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
			// AU44 B3: insertRoutine now computes nextRunAt owner-side.
			// Use heartbeat (intervalSeconds triggers a non-null nextRunAt)
			// so this routine is excluded from the missingNextRunAt filter.
			await routine.insertRoutine(db, {
				id: "routine-has-next",
				name: "HasNext",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "heartbeat",
				triggerConfig: JSON.stringify({ intervalSeconds: 3600 }),
				active: true,
			});
			await routine.insertRoutine(db, {
				id: "routine-event-type",
				name: "EventType",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				triggerType: "event",
				active: true,
			});

			const rows = await routine.listRoutines(db, { active: true, missingNextRunAt: true });
			expect(rows.map((r) => r.id)).toEqual(["routine-missing"]);
		});
	});

	describe("listRoutines / count via .length", () => {
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

			const count = (await routine.listRoutines(db, { teamId: "team-1" })).length;
			expect(count).toBe(1);
		});
	});

	describe("getRoutineRun", () => {
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

			const row = await routine.getRoutineRun(db, "run-1");
			expect(row?.routineId).toBe("routine-1");
		});
	});

	describe("listRoutineRuns / running filter", () => {
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

			const [miss] = await routine.listRoutineRuns(db, {
				routineId: "routine-1",
				running: true,
				limit: 1,
			});
			expect(miss).toBeUndefined();

			await routine.insertRoutineRun(db, {
				id: "run-2",
				routineId: "routine-1",
				startedAt: new Date().toISOString(),
				outcome: "running",
			});

			const [hit] = await routine.listRoutineRuns(db, {
				routineId: "routine-1",
				running: true,
				limit: 1,
			});
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
				const [run] = await routine.listRoutineRuns(tx, {
					routineId: "routine-1",
					running: true,
					limit: 1,
				});
				sawInTx = run ? { id: run.id } : undefined;
			});

			expect(sawInTx?.id).toBe("run-tx");
		});
	});

	describe("listRoutineRuns / limit (always desc)", () => {
		test("limit:1 returns the most recent run first", async ({ db }) => {
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

			const latest1 = await routine.listRoutineRuns(db, {
				routineId: "routine-1",
				limit: 1,
			});
			expect(latest1.map((r) => r.id)).toEqual(["run-2"]);

			const all = await routine.listRoutineRuns(db, {
				routineId: "routine-1",
				limit: 20,
			});
			expect(all.map((r) => r.id)).toEqual(["run-2", "run-1"]);
		});
	});
});
