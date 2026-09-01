/**
 * AU26 H2 (§D-M.2) — RED. `requestRunStopForTasks` does not exist yet.
 *
 * `layers/core-api/work/bet-kill-cascade.ts` selected the active runs per
 * task and CAS-stopped each one itself, deliberately suppressing
 * `session_ended`. Killing a bet must stop its runs — that is a genuine core
 * need — but the write is `run-orchestration`'s, so it comes down here.
 *
 * The returned set is load-bearing, not a convenience: a 0-row CAS (an
 * already-stopped run) must return an empty set. A count would not tell the
 * caller WHICH runs were actually affected.
 */

import { type HyperIdleDb, sessions, tasks, teams, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { requestRunStopForTasks } from "../request-run-stop-for-tasks.js";

const NOW = "2026-08-04T10:00:00.000Z";

async function seed(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "team-1", name: "T", phase: "build", createdAt: NOW });
	await db
		.insert(users)
		.values({ id: "agent-1", name: "A", role: "builder", status: "active", createdAt: NOW });
	await db.insert(tasks).values({
		id: "bet-1",
		parentTaskId: null,
		teamId: "team-1",
		title: "d",
		description: "d",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	for (const id of ["task-a", "task-b", "task-untouched"]) {
		await db.insert(tasks).values({
			id,
			parentTaskId: "bet-1",
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

		const stopped = await requestRunStopForTasks(db, ["task-a", "task-b"]);

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

		const stopped = await requestRunStopForTasks(db, ["task-a"]);

		expect(stopped).toEqual([{ taskId: "task-a", sessionId: "run-a" }]);
		const [other] = await db.select().from(sessions).where(eq(sessions.id, "run-other"));
		expect(other?.state).toBe("active");
	});

	test("is idempotent — an already-stopped run is not in the returned set", async ({ db }) => {
		await seed(db);
		await seedRun(db, "run-a", "task-a", "active");

		const first = await requestRunStopForTasks(db, ["task-a"]);
		expect(first).toHaveLength(1);

		// The 0-row CAS: a re-kill of an already-stopped run returns empty.
		const second = await requestRunStopForTasks(db, ["task-a"]);
		expect(second).toHaveLength(0);
	});

	test("returns an empty set for an empty task list", async ({ db }) => {
		await seed(db);
		await seedRun(db, "run-a", "task-a", "active");

		expect(await requestRunStopForTasks(db, [])).toEqual([]);
		const [row] = await db.select().from(sessions).where(eq(sessions.id, "run-a"));
		expect(row?.state).toBe("active");
	});
});
