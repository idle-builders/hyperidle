/**
 * Rewritten so killing a task's runs goes through the same abort a direct
 * stop does — `requestRunStopForTasks` now calls the shared
 * `stopSessionRun` per active session: with no live runtime entry registered
 * (every case below — these tests never register one with the runtime),
 * `abort` answers `false` and the CAS-mark path fires, exactly as before,
 * but now via `session_ended`.
 *
 * The returned set is load-bearing, not a convenience: a 0-row CAS (an
 * already-stopped run) must return an empty set. A count would not tell the
 * caller WHICH runs were actually affected.
 */

import { type HyperIdleDb, sessions, tasks, teams, threads, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { requestRunStopForTasks } from "../request-run-stop-for-tasks.js";

/** No test in this file registers a live runtime entry — `abort` always answers false, the no-live-entry path. */
const noLiveEntry = async (): Promise<boolean> => false;

const NOW = "2026-08-04T10:00:00.000Z";

async function seed(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "team-1", name: "T", phase: "build", createdAt: NOW });
	await db
		.insert(users)
		.values({ id: "agent-1", name: "A", role: "builder", status: "active", createdAt: NOW });
	await db.insert(threads).values({
		id: "thr-bet-1",
		hostKind: "team",
		hostId: "team-1",
		initiatorId: "agent-1",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "bet-1",
		threadId: "thr-bet-1",
		parentTaskId: null,
		teamId: "team-1",
		title: "d",
		description: "d",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	for (const id of ["task-a", "task-b", "task-untouched"]) {
		await db.insert(threads).values({
			id: `thr-${id}`,
			hostKind: "team",
			hostId: "team-1",
			initiatorId: "agent-1",
			participants: "[]",
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id,
			threadId: `thr-${id}`,
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
		const eventBus = new EventBus();

		const stopped = await requestRunStopForTasks(db, eventBus, ["task-a", "task-b"], noLiveEntry);

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

	test("emits session_ended per stopped run on the no-live-entry path", async ({ db }) => {
		await seed(db);
		await seedRun(db, "run-a", "task-a", "active");
		const eventBus = new EventBus();
		const emitted: unknown[] = [];
		eventBus.on("session_ended", (event) => emitted.push(event));

		await requestRunStopForTasks(db, eventBus, ["task-a"], noLiveEntry);

		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toMatchObject({
			type: "session_ended",
			sessionId: "run-a",
			taskId: "task-a",
			outcome: "stopped",
		});
	});

	test("leaves runs on tasks outside the list alone", async ({ db }) => {
		await seed(db);
		await seedRun(db, "run-a", "task-a", "active");
		await seedRun(db, "run-other", "task-untouched", "active");
		const eventBus = new EventBus();

		const stopped = await requestRunStopForTasks(db, eventBus, ["task-a"], noLiveEntry);

		expect(stopped).toEqual([{ taskId: "task-a", sessionId: "run-a" }]);
		const [other] = await db.select().from(sessions).where(eq(sessions.id, "run-other"));
		expect(other?.state).toBe("active");
	});

	test("is idempotent — an already-stopped run is not in the returned set", async ({ db }) => {
		await seed(db);
		await seedRun(db, "run-a", "task-a", "active");
		const eventBus = new EventBus();

		const first = await requestRunStopForTasks(db, eventBus, ["task-a"], noLiveEntry);
		expect(first).toHaveLength(1);

		// The 0-row CAS: a re-kill of an already-stopped run returns empty.
		const second = await requestRunStopForTasks(db, eventBus, ["task-a"], noLiveEntry);
		expect(second).toHaveLength(0);
	});

	test("returns an empty set for an empty task list", async ({ db }) => {
		await seed(db);
		await seedRun(db, "run-a", "task-a", "active");
		const eventBus = new EventBus();

		expect(await requestRunStopForTasks(db, eventBus, [], noLiveEntry)).toEqual([]);
		const [row] = await db.select().from(sessions).where(eq(sessions.id, "run-a"));
		expect(row?.state).toBe("active");
	});

	test("the abort path stops nothing itself and emits nothing — teardown owns both", async ({
		db,
	}) => {
		await seed(db);
		await seedRun(db, "run-a", "task-a", "active");
		const eventBus = new EventBus();
		const emitted: unknown[] = [];
		eventBus.on("session_ended", (event) => emitted.push(event));
		const liveEntry = async (): Promise<boolean> => true;

		const stopped = await requestRunStopForTasks(db, eventBus, ["task-a"], liveEntry);

		expect(stopped).toEqual([{ taskId: "task-a", sessionId: "run-a" }]);
		expect(emitted).toHaveLength(0);
		const [row] = await db.select().from(sessions).where(eq(sessions.id, "run-a"));
		expect(row?.state).toBe("active");
	});
});
