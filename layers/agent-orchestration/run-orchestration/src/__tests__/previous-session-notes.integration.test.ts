/**
 * `fetchPreviousSessionNotes` — most recent done session for the same task,
 * ordered by endedAt descending with nulls excluded.
 */
import { type HyperIdleDb, sessions, tasks, teams, threads, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { fetchPreviousSessionNotes } from "../session-store.js";

const AGENT_ID = "agent-prev-notes";
const TEAM_ID = "team-prev-notes";
const TASK_A = "task-prev-notes-a";
const TASK_B = "task-prev-notes-b";

async function seedWorld(db: HyperIdleDb): Promise<void> {
	const now = "2026-01-01T00:00:00.000Z";
	await db.insert(users).values({
		id: AGENT_ID,
		kind: "ai",
		name: "Notes agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});
	await db.insert(teams).values({ id: TEAM_ID, name: TEAM_ID, createdAt: now });
	for (const taskId of [TASK_A, TASK_B]) {
		await db.insert(threads).values({
			id: `thr-${taskId}`,
			hostKind: "team",
			hostId: TEAM_ID,
			initiatorId: AGENT_ID,
			participants: "[]",
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: taskId,
			threadId: `thr-${taskId}`,
			parentTaskId: null,
			teamId: TEAM_ID,
			title: `Task ${taskId}`,
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		});
	}
}

describe("fetchPreviousSessionNotes", () => {
	test("returns null when no done sessions exist for the task", async ({ db }) => {
		await seedWorld(db);
		const result = await fetchPreviousSessionNotes(db, TASK_A);
		expect(result).toBeNull();
	});

	test("returns the notes from the most recent done session of the same task", async ({ db }) => {
		await seedWorld(db);
		await db.insert(sessions).values([
			{
				id: "s-older",
				taskId: TASK_A,
				agentId: AGENT_ID,
				modelTier: "standard",
				startedAt: "2026-01-01T00:00:00.000Z",
				endedAt: "2026-01-01T01:00:00.000Z",
				state: "done",
				outcome: "completed",
				notes: "older notes",
			},
			{
				id: "s-newer",
				taskId: TASK_A,
				agentId: AGENT_ID,
				modelTier: "standard",
				startedAt: "2026-01-02T00:00:00.000Z",
				endedAt: "2026-01-02T01:00:00.000Z",
				state: "done",
				outcome: "completed",
				notes: "newer notes",
			},
		]);
		const result = await fetchPreviousSessionNotes(db, TASK_A);
		expect(result).toBe("newer notes");
	});

	test("ignores done sessions for a different task", async ({ db }) => {
		await seedWorld(db);
		await db.insert(sessions).values({
			id: "s-other-task",
			taskId: TASK_B,
			agentId: AGENT_ID,
			modelTier: "standard",
			startedAt: "2026-01-01T00:00:00.000Z",
			endedAt: "2026-01-01T01:00:00.000Z",
			state: "done",
			outcome: "completed",
			notes: "other task notes",
		});
		const result = await fetchPreviousSessionNotes(db, TASK_A);
		expect(result).toBeNull();
	});

	test("ignores non-done sessions for the same task", async ({ db }) => {
		await seedWorld(db);
		await db.insert(sessions).values({
			id: "s-active",
			taskId: TASK_A,
			agentId: AGENT_ID,
			modelTier: "standard",
			startedAt: "2026-01-01T00:00:00.000Z",
			state: "active",
			notes: "active notes",
		});
		const result = await fetchPreviousSessionNotes(db, TASK_A);
		expect(result).toBeNull();
	});

	test("ignores a done session with null endedAt", async ({ db }) => {
		await seedWorld(db);
		await db.insert(sessions).values([
			{
				id: "s-null-ended",
				taskId: TASK_A,
				agentId: AGENT_ID,
				modelTier: "standard",
				startedAt: "2026-01-01T00:00:00.000Z",
				endedAt: null,
				state: "done",
				outcome: "completed",
				notes: "notes with null endedAt",
			},
			{
				id: "s-with-ended",
				taskId: TASK_A,
				agentId: AGENT_ID,
				modelTier: "standard",
				startedAt: "2026-01-01T00:00:00.000Z",
				endedAt: "2026-01-01T01:00:00.000Z",
				state: "done",
				outcome: "completed",
				notes: "real ended notes",
			},
		]);
		const result = await fetchPreviousSessionNotes(db, TASK_A);
		expect(result).toBe("real ended notes");
	});
});
