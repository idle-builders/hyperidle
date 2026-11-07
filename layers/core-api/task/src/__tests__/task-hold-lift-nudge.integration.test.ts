/**
 * When a task's paused field moves to null (hold lifted) and the task has an
 * ownerAgentId, registerTaskLiveUpdates must push user:<ownerAgentId> so the
 * agent's runner wakes immediately without waiting for its 30 s sweep.
 */
import { type HyperIdleDb, tasks, teams, threads, users, userTeams } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus, objectEvent } from "@hyperidle/event-bus";
import { registerTaskLiveUpdates } from "../task-live-updates.js";

const TS = "2026-01-01T00:00:00.000Z";

async function seedWorld(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "team-1", name: "Team", createdAt: TS });
	await db.insert(users).values({
		id: "agent-1",
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: TS,
	});
	await db.insert(userTeams).values({ userId: "agent-1", teamId: "team-1" });
	await db.insert(threads).values({
		id: "thr-1",
		hostKind: "team",
		hostId: "team-1",
		initiatorId: "agent-1",
		participants: JSON.stringify(["agent-1"]),
		lastActiveAt: TS,
		createdAt: TS,
	});
	await db.insert(tasks).values({
		id: "task-1",
		teamId: "team-1",
		ownerAgentId: "agent-1",
		threadId: "thr-1",
		title: "Held task",
		state: "accepted",
		paused: "hold",
		createdAt: TS,
		updatedAt: TS,
	});
}

describe("registerTaskLiveUpdates — hold-lift nudge", () => {
	test("task.changed with paused→null pushes user:<ownerAgentId>", async ({ db }) => {
		await seedWorld(db);
		const eventBus = new EventBus();
		const pushed: string[] = [];
		const stop = registerTaskLiveUpdates(db, eventBus, (topic) => pushed.push(topic));

		eventBus.emit(
			objectEvent({
				id: "chg-1",
				object: "task",
				objectId: "task-1",
				kind: "changed",
				actor: "person-1",
				before: JSON.stringify({ id: "task-1", paused: "hold" }),
				after: JSON.stringify({ id: "task-1", paused: null }),
				at: TS,
			}),
		);

		// Give the async get() call time to resolve.
		await new Promise((r) => setTimeout(r, 50));
		stop();

		expect(pushed).toContain("user:agent-1");
	});

	test("task.changed without paused field does not push user:<ownerAgentId>", async ({ db }) => {
		await seedWorld(db);
		const eventBus = new EventBus();
		const pushed: string[] = [];
		const stop = registerTaskLiveUpdates(db, eventBus, (topic) => pushed.push(topic));

		eventBus.emit(
			objectEvent({
				id: "chg-2",
				object: "task",
				objectId: "task-1",
				kind: "changed",
				actor: "person-1",
				before: JSON.stringify({ id: "task-1", title: "Old" }),
				after: JSON.stringify({ id: "task-1", title: "New" }),
				at: TS,
			}),
		);

		await new Promise((r) => setTimeout(r, 50));
		stop();

		expect(pushed).not.toContain("user:agent-1");
	});
});
