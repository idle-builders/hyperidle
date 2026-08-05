/**
 * AU26 H2 (§D-M.2) — RED. `requestRunStopForTasks` does not exist yet.
 *
 * `layers/core-api/work/bet-kill-cascade.ts` selected the active runs per
 * task and CAS-stopped each one itself, deliberately suppressing
 * `session_ended`. Killing a bet must stop its runs — that is a genuine core
 * need — but the write is `run-orchestration`'s, so it comes down here.
 *
 * The returned set is load-bearing, not a convenience: `work` writes one
 * `propagation_log` hop per run it actually stopped, and a 0-row CAS (an
 * already-stopped run) must write NO phantom row. A count would not tell the
 * caller WHICH runs to log.
 */

import { bets, type HyperIdleDb, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { requestRunStopForTasks } from "../request-run-stop-for-tasks.js";

const NOW = "2026-08-04T10:00:00.000Z";

async function seed(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "team-1", name: "T", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "tm-1", teamId: "team-1", capacity: 3, activeBets: 0, formedAt: NOW });
	await db
		.insert(users)
		.values({ id: "agent-1", name: "A", role: "builder", status: "active", createdAt: NOW });
	await db.insert(bets).values({
		id: "bet-1",
		teamId: "team-1",
		description: "d",
		status: "active",
		createdAt: NOW,
	});
	for (const id of ["task-a", "task-b", "task-untouched"]) {
		await db.insert(tasks).values({
			id,
			betId: "bet-1",
			teamId: "team-1",
			title: id,
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
	}
}

async function seedRun(db: HyperIdleDb, id: string, taskId: string, state: string): Promise<void> {
	await db.insert(sessions).values({
		id,
		taskId,
		agentId: "agent-1",
		modelTier: "workhorse",
		startedAt: NOW,
		state,
	});
}

describe("requestRunStopForTasks", () => {
	test("stops the active runs of the named tasks and returns them", async ({ db }) => {
		await seed(db);
		await seedRun(db, "run-a", "task-a", "active");
		await seedRun(db, "run-b", "task-b", "active");

		const stopped = await requestRunStopForTasks(db, ["task-a", "task-b"], {
			reason: "bet_killed",
		});

		expect([...stopped].sort((x, y) => x.sessionId.localeCompare(y.sessionId))).toEqual([
			{ taskId: "task-a", sessionId: "run-a" },
			{ taskId: "task-b", sessionId: "run-b" },
		]);

		const rows = await db.select().from(sessions);
		for (const row of rows) {
			expect(row.state).toBe("stopped");
			expect(row.outcome).toBe("stopped");
			expect(row.endedAt).toBeTruthy();
		}
	});

	test("leaves runs on tasks outside the list alone", async ({ db }) => {
		await seed(db);
		await seedRun(db, "run-a", "task-a", "active");
		await seedRun(db, "run-other", "task-untouched", "active");

		const stopped = await requestRunStopForTasks(db, ["task-a"], { reason: "bet_killed" });

		expect(stopped).toEqual([{ taskId: "task-a", sessionId: "run-a" }]);
		const [other] = await db.select().from(sessions).where(eq(sessions.id, "run-other"));
		expect(other?.state).toBe("active");
	});

	test("is idempotent — an already-stopped run is not in the returned set", async ({ db }) => {
		await seed(db);
		await seedRun(db, "run-a", "task-a", "active");

		const first = await requestRunStopForTasks(db, ["task-a"], { reason: "bet_killed" });
		expect(first).toHaveLength(1);

		// The 0-row CAS: `work` must be able to see that nothing changed, so it
		// writes no phantom `propagation_log` row on a second kill.
		const second = await requestRunStopForTasks(db, ["task-a"], { reason: "bet_killed" });
		expect(second).toHaveLength(0);
	});

	test("returns an empty set for an empty task list", async ({ db }) => {
		await seed(db);
		await seedRun(db, "run-a", "task-a", "active");

		expect(await requestRunStopForTasks(db, [], { reason: "bet_killed" })).toEqual([]);
		const [row] = await db.select().from(sessions).where(eq(sessions.id, "run-a"));
		expect(row?.state).toBe("active");
	});
});
