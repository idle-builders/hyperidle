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
import { expect, type ScopedIds, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import * as routine from "../routine-service.js";

async function seedTeamAndAgent(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	const createdAt = new Date().toISOString();
	await db.insert(teams).values({
		id: ids("team-1"),
		name: "Test Team",
		phase: "build",
		createdAt,
	});
	// The owner writes the membership row alongside the team.
	await db.insert(teamMembers).values({
		id: ids("team-1-members"),
		teamId: ids("team-1"),
		capacity: 5,
		activeBets: 0,
		formedAt: createdAt,
	});
	await db.insert(users).values({
		id: ids("agent-1"),
		name: "Agent One",
		role: "builder",
		status: "idle",
		createdAt: new Date().toISOString(),
	});
}

describe("routine-service", () => {
	describe("insertRoutine", () => {
		test("inserts a readable row", async ({ db, ids }) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(db, {
				id: ids("routine-1"),
				name: "Test routine",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});

			const [row] = await db
				.select()
				.from(routines)
				.where(eq(routines.id, ids("routine-1")))
				.limit(1);
			expect(row?.name).toBe("Test routine");
		});

		test("onConflictDoNothing:true makes a re-insert of the same id a no-op, not a throw", async ({
			db,
			ids,
		}) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(
				db,
				{
					id: ids("routine-1"),
					name: "First",
					teamId: ids("team-1"),
					ownerAgentId: ids("agent-1"),
					triggerType: "heartbeat",
				},
				{ onConflictDoNothing: true },
			);

			await routine.insertRoutine(
				db,
				{
					id: ids("routine-1"),
					name: "Second",
					teamId: ids("team-1"),
					ownerAgentId: ids("agent-1"),
					triggerType: "heartbeat",
				},
				{ onConflictDoNothing: true },
			);

			const [row] = await db
				.select()
				.from(routines)
				.where(eq(routines.id, ids("routine-1")))
				.limit(1);
			// Original row untouched — the second insert was a no-op.
			expect(row?.name).toBe("First");
		});
	});

	describe("updateRoutine", () => {
		test("patches only the addressed row", async ({ db, ids }) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(db, {
				id: ids("routine-1"),
				name: "R1",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});
			await routine.insertRoutine(db, {
				id: ids("routine-2"),
				name: "R2",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});

			await routine.updateRoutine(db, ids("routine-1"), { lastRunAt: "2026-01-01T00:00:00.000Z" });

			const [updated] = await db
				.select()
				.from(routines)
				.where(eq(routines.id, ids("routine-1")))
				.limit(1);
			const [other] = await db
				.select()
				.from(routines)
				.where(eq(routines.id, ids("routine-2")))
				.limit(1);
			expect(updated?.lastRunAt).toBe("2026-01-01T00:00:00.000Z");
			expect(other?.lastRunAt).toBeNull();
		});
	});

	describe("insertRoutineRun / updateRoutineRun", () => {
		test("insertRoutineRun inserts a readable row", async ({ db, ids }) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(db, {
				id: ids("routine-1"),
				name: "R1",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});

			await routine.insertRoutineRun(db, {
				id: ids("run-1"),
				routineId: ids("routine-1"),
				startedAt: new Date().toISOString(),
				outcome: "running",
			});

			const [row] = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.id, ids("run-1")))
				.limit(1);
			expect(row?.outcome).toBe("running");
		});

		test("updateRoutineRun mutates only the addressed row", async ({ db, ids }) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(db, {
				id: ids("routine-1"),
				name: "R1",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});
			await routine.insertRoutineRun(db, {
				id: ids("run-1"),
				routineId: ids("routine-1"),
				startedAt: new Date().toISOString(),
				outcome: "running",
			});
			await routine.insertRoutineRun(db, {
				id: ids("run-2"),
				routineId: ids("routine-1"),
				startedAt: new Date().toISOString(),
				outcome: "running",
			});

			await routine.updateRoutineRun(db, ids("run-1"), {
				outcome: "success",
				endedAt: new Date().toISOString(),
			});

			const [updated] = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.id, ids("run-1")))
				.limit(1);
			const [other] = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.id, ids("run-2")))
				.limit(1);
			expect(updated?.outcome).toBe("success");
			expect(other?.outcome).toBe("running");
		});
	});

	describe("updateRoutineRun with onlyIfRunning", () => {
		test("updates when outcome is currently running", async ({ db, ids }) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(db, {
				id: ids("routine-1"),
				name: "R1",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});
			await routine.insertRoutineRun(db, {
				id: ids("run-1"),
				routineId: ids("routine-1"),
				startedAt: new Date().toISOString(),
				outcome: "running",
			});

			await routine.updateRoutineRun(
				db,
				ids("run-1"),
				{
					outcome: "success",
					endedAt: new Date().toISOString(),
				},
				{ onlyIfRunning: true },
			);

			const [row] = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.id, ids("run-1")))
				.limit(1);
			expect(row?.outcome).toBe("success");
		});

		test("silently no-ops when outcome is not running", async ({ db, ids }) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(db, {
				id: ids("routine-1"),
				name: "R1",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});
			await routine.insertRoutineRun(db, {
				id: ids("run-1"),
				routineId: ids("routine-1"),
				startedAt: new Date().toISOString(),
				outcome: "success",
			});

			await routine.updateRoutineRun(
				db,
				ids("run-1"),
				{
					outcome: "error",
					endedAt: new Date().toISOString(),
				},
				{ onlyIfRunning: true },
			);

			const [row] = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.id, ids("run-1")))
				.limit(1);
			// Unchanged — the guard predicate missed (outcome was "success", not "running").
			expect(row?.outcome).toBe("success");
		});
	});

	// -------------------------------------------------------------------------
	// AU13 read-ownership addendum — reads
	// -------------------------------------------------------------------------

	describe("getRoutine", () => {
		test("returns the full row for an existing routine", async ({ db, ids }) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(db, {
				id: ids("routine-1"),
				name: "R1",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});

			const row = await routine.getRoutine(db, ids("routine-1"));
			expect(row?.name).toBe("R1");
		});

		test("returns undefined for a missing routine", async ({ db, ids }) => {
			const row = await routine.getRoutine(db, ids("nope"));
			expect(row).toBeUndefined();
		});
	});

	describe("listRoutines", () => {
		test("excludes soft-deleted routines by default", async ({ db, ids }) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(db, {
				id: ids("routine-1"),
				name: "Active",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});
			await routine.insertRoutine(db, {
				id: ids("routine-2"),
				name: "Deleted",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
				deletedAt: new Date().toISOString(),
			});

			// @lore AU38: scoped to this test's team — the soft-delete exclusion is
			// asserted over the rows this test arranged, not the whole table.
			const rows = await routine.listRoutines(db, { teamId: ids("team-1") });
			expect(rows.map((r) => r.id)).toEqual([ids("routine-1")]);
		});

		test("includeDeleted:true returns every row", async ({ db, ids }) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(db, {
				id: ids("routine-1"),
				name: "Active",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});
			await routine.insertRoutine(db, {
				id: ids("routine-2"),
				name: "Deleted",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
				deletedAt: new Date().toISOString(),
			});

			const rows = await routine.listRoutines(db, { includeDeleted: true, teamId: ids("team-1") });
			expect(rows).toHaveLength(2);
		});
	});

	describe("listRoutines / teamId filter", () => {
		test("scopes to team, excludes soft-deleted, orders by id", async ({ db, ids }) => {
			await seedTeamAndAgent(db, ids);
			const team2CreatedAt = new Date().toISOString();
			await db.insert(teams).values({
				id: ids("team-2"),
				name: "Other Team",
				phase: "build",
				createdAt: team2CreatedAt,
			});
			// The owner writes the membership row alongside the team.
			await db.insert(teamMembers).values({
				id: ids("team-2-members"),
				teamId: ids("team-2"),
				capacity: 5,
				activeBets: 0,
				formedAt: team2CreatedAt,
			});
			await routine.insertRoutine(db, {
				id: ids("routine-b"),
				name: "B",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});
			await routine.insertRoutine(db, {
				id: ids("routine-a"),
				name: "A",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});
			await routine.insertRoutine(db, {
				id: ids("routine-c"),
				name: "Deleted",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
				deletedAt: new Date().toISOString(),
			});
			await routine.insertRoutine(db, {
				id: ids("routine-other-team"),
				name: "Other",
				teamId: ids("team-2"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});

			const rows = await routine.listRoutines(db, { teamId: ids("team-1") });
			// @lore AU38: derived UUIDs don't sort in label order — the query
			// orders by id ASC, so the expected side is the id-sorted set.
			expect(rows.map((r) => r.id)).toEqual([ids("routine-a"), ids("routine-b")].sort());
		});
	});

	describe("listRoutines / active filter", () => {
		test("no opts returns every active routine", async ({ db, ids }) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(db, {
				id: ids("routine-1"),
				name: "R1",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
				active: true,
			});
			await routine.insertRoutine(db, {
				id: ids("routine-2"),
				name: "R2",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
				active: false,
			});

			const rows = await routine.listRoutines(db, { active: true, teamId: ids("team-1") });
			expect(rows.map((r) => r.id)).toEqual([ids("routine-1")]);
		});

		test("triggerType filters to active + matching triggerType", async ({ db, ids }) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(db, {
				id: ids("routine-event"),
				name: "Event",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "event",
				active: true,
			});
			await routine.insertRoutine(db, {
				id: ids("routine-heartbeat"),
				name: "Heartbeat",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
				active: true,
			});

			const rows = await routine.listRoutines(db, {
				active: true,
				triggerType: "event",
				teamId: ids("team-1"),
			});
			expect(rows.map((r) => r.id)).toEqual([ids("routine-event")]);
		});
	});

	describe("listRoutines / missingNextRunAt filter", () => {
		test("returns active schedulable routines with a null nextRunAt", async ({ db, ids }) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(db, {
				id: ids("routine-missing"),
				name: "Missing",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "calendar",
				active: true,
			});
			await routine.insertRoutine(db, {
				id: ids("routine-has-next"),
				name: "HasNext",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "calendar",
				active: true,
				nextRunAt: "2026-01-01T00:00:00.000Z",
			});
			await routine.insertRoutine(db, {
				id: ids("routine-event-type"),
				name: "EventType",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "event",
				active: true,
			});

			const rows = await routine.listRoutines(db, {
				active: true,
				missingNextRunAt: true,
				teamId: ids("team-1"),
			});
			expect(rows.map((r) => r.id)).toEqual([ids("routine-missing")]);
		});
	});

	describe("listRoutines / count via .length", () => {
		test("excludes soft-deleted routines from the count", async ({ db, ids }) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(db, {
				id: ids("routine-1"),
				name: "R1",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});
			await routine.insertRoutine(db, {
				id: ids("routine-2"),
				name: "R2 deleted",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
				deletedAt: new Date().toISOString(),
			});

			const count = (await routine.listRoutines(db, { teamId: ids("team-1") })).length;
			expect(count).toBe(1);
		});
	});

	describe("getRoutineRun", () => {
		test("returns the full row for an existing run", async ({ db, ids }) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(db, {
				id: ids("routine-1"),
				name: "R1",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});
			await routine.insertRoutineRun(db, {
				id: ids("run-1"),
				routineId: ids("routine-1"),
				startedAt: new Date().toISOString(),
				outcome: "running",
			});

			const row = await routine.getRoutineRun(db, ids("run-1"));
			expect(row?.routineId).toBe(ids("routine-1"));
		});
	});

	describe("listRoutineRuns / running filter", () => {
		test("finds the running run for a routine, undefined when none running", async ({
			db,
			ids,
		}) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(db, {
				id: ids("routine-1"),
				name: "R1",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});
			await routine.insertRoutineRun(db, {
				id: ids("run-1"),
				routineId: ids("routine-1"),
				startedAt: new Date().toISOString(),
				outcome: "success",
			});

			const [miss] = await routine.listRoutineRuns(db, {
				routineId: ids("routine-1"),
				running: true,
				limit: 1,
			});
			expect(miss).toBeUndefined();

			await routine.insertRoutineRun(db, {
				id: ids("run-2"),
				routineId: ids("routine-1"),
				startedAt: new Date().toISOString(),
				outcome: "running",
			});

			const [hit] = await routine.listRoutineRuns(db, {
				routineId: ids("routine-1"),
				running: true,
				limit: 1,
			});
			expect(hit?.id).toBe(ids("run-2"));
		});

		test("tx-scoped read sees an uncommitted running run written earlier in the same transaction", async ({
			db,
			ids,
		}) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(db, {
				id: ids("routine-1"),
				name: "R1",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});

			let sawInTx: { id: string } | undefined;
			await db.transaction(async (tx) => {
				await routine.insertRoutineRun(tx, {
					id: ids("run-tx"),
					routineId: ids("routine-1"),
					startedAt: new Date().toISOString(),
					outcome: "running",
				});
				// Not yet committed — a fn using the pooled `db` (not `tx`) would miss this.
				const [run] = await routine.listRoutineRuns(tx, {
					routineId: ids("routine-1"),
					running: true,
					limit: 1,
				});
				sawInTx = run ? { id: run.id } : undefined;
			});

			expect(sawInTx?.id).toBe(ids("run-tx"));
		});
	});

	describe("listRoutineRuns / limit + order", () => {
		test("limit + order:desc returns the most recent runs first", async ({ db, ids }) => {
			await seedTeamAndAgent(db, ids);
			await routine.insertRoutine(db, {
				id: ids("routine-1"),
				name: "R1",
				teamId: ids("team-1"),
				ownerAgentId: ids("agent-1"),
				triggerType: "heartbeat",
			});
			await routine.insertRoutineRun(db, {
				id: ids("run-1"),
				routineId: ids("routine-1"),
				startedAt: "2026-01-01T00:00:00.000Z",
				outcome: "success",
			});
			await routine.insertRoutineRun(db, {
				id: ids("run-2"),
				routineId: ids("routine-1"),
				startedAt: "2026-01-02T00:00:00.000Z",
				outcome: "success",
			});

			const latest1 = await routine.listRoutineRuns(db, {
				routineId: ids("routine-1"),
				limit: 1,
				order: "desc",
			});
			expect(latest1.map((r) => r.id)).toEqual([ids("run-2")]);

			const desc20 = await routine.listRoutineRuns(db, {
				routineId: ids("routine-1"),
				limit: 20,
				order: "desc",
			});
			expect(desc20.map((r) => r.id)).toEqual([ids("run-2"), ids("run-1")]);
		});
	});
});
