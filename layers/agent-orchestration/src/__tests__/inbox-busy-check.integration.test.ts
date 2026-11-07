/**
 * The inbox busy check respects `maxConcurrentSessions` from the agent's run config.
 * Default is 1 (hold back once one session is active); a higher limit allows that many
 * to run side by side before the row is held back.
 */

import type { InboxRowView, UserView } from "@hyperidle/domain-model";
import {
	agentRunConfig,
	agentSessionRequests,
	type RunnerDb,
	sessions,
} from "@hyperidle/runner-db";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";
import type { CoreDoor, DoorResult } from "../runner/core-door.js";
import { actOnInboxRow, type HeldAgent, type InboxWorkDeps, NotYet } from "../runner/inbox-work.js";

const TEAM_ID = "team-busycheck";
const AGENT_ID = "agent-busycheck";
const TASK_ID = "task-busycheck";
const THREAD_ID = "thread-busycheck";
const NOW = "2026-10-01T00:00:00.000Z";

function makeDoor(): CoreDoor {
	return {
		call<O>(_key: string, action: string, _input: unknown): Promise<DoorResult<O>> {
			if (action === "open_task") {
				return Promise.resolve({
					ok: true,
					data: {
						task: {
							id: TASK_ID,
							parentTaskId: null,
							teamId: TEAM_ID,
							ownerAgentId: null,
							title: "Busy check task",
							description: null,
							descriptionFormat: "plain",
							doneWhen: [],
							state: "ready",
							dependencies: null,
							threadId: THREAD_ID,
							notes: null,
							createdAt: NOW,
							updatedAt: NOW,
							outcomeVerdict: null,
							outcomeSummary: null,
							outcomeRecordedAt: null,
							outcomeRecordedBy: null,
							tokensActualJson: null,
							sourceDocumentId: null,
							completedAt: null,
							position: 0,
							reasons: [],
							paused: null,
							startedBy: null,
							need: null,
						},
						ancestors: [],
						children: [],
						openBelow: { input: 0, review: 0 },
						tokensActualRollup: null,
						threadId: THREAD_ID,
						attachments: [],
					} as O,
				});
			}
			if (action === "search_documents") {
				return Promise.resolve({ ok: true, data: [] as unknown as O });
			}
			return Promise.resolve({
				ok: false,
				problems: [{ code: "not_found", message: "not found" }],
			});
		},
	};
}

function makeAgent(): HeldAgent {
	const userView: UserView = {
		user: {
			id: AGENT_ID,
			kind: "ai",
			name: "Busy Check Agent",
			role: "builder",
			status: "active",
			avatarUrl: null,
			createdAt: NOW,
			agentCategory: "team",
			ownerUserId: null,
			health: null,
			discipline: null,
			what: null,
			hasKey: true,
			teams: [{ id: TEAM_ID, name: "Busy Check Team" }],
			edges: [],
		},
		documentIds: [],
		subscriptions: [],
		inbox: null,
	};
	return { key: "test-key", self: userView };
}

async function seedActiveSession(runnerDb: RunnerDb, sessionId: string): Promise<void> {
	await runnerDb.insert(sessions).values({
		id: sessionId,
		agentId: AGENT_ID,
		modelTier: "workhorse",
		startedAt: NOW,
		state: "active",
	});
}

async function countQueuedRequests(runnerDb: RunnerDb): Promise<number> {
	const rows = await runnerDb
		.select({ id: agentSessionRequests.id })
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.agentId, AGENT_ID));
	return rows.length;
}

const taskRunRow: InboxRowView = {
	id: "row-busycheck",
	reason: "task_run",
	change: null,
	subscriptionId: null,
	objectId: TASK_ID,
	createdAt: NOW,
	seenAt: null,
	readAt: null,
};

describe("inbox busy check", () => {
	test("holds back a task_run row when the agent has one active session and limit is 1", async ({
		runnerDb,
		eventBus,
	}) => {
		await seedActiveSession(runnerDb, "session-limit1-active");
		// No agentRunConfig row → default maxConcurrentSessions=1

		const deps: InboxWorkDeps = { db: runnerDb, eventBus, door: makeDoor() };
		await expect(actOnInboxRow(deps, makeAgent(), taskRunRow)).rejects.toBeInstanceOf(NotYet);
		expect(await countQueuedRequests(runnerDb)).toBe(0);
	});

	test("admits a task_run row when the agent has one active session and limit is 2", async ({
		runnerDb,
		eventBus,
	}) => {
		await runnerDb.insert(agentRunConfig).values({
			agentUserId: AGENT_ID,
			maxConcurrentSessions: 2,
		});
		await seedActiveSession(runnerDb, "session-limit2-active");

		const deps: InboxWorkDeps = { db: runnerDb, eventBus, door: makeDoor() };
		await actOnInboxRow(deps, makeAgent(), taskRunRow);
		expect(await countQueuedRequests(runnerDb)).toBe(1);
	});

	test("holds back a task_run row when active + pending equals the limit", async ({
		runnerDb,
		eventBus,
	}) => {
		await runnerDb.insert(agentRunConfig).values({
			agentUserId: AGENT_ID,
			maxConcurrentSessions: 2,
		});
		await seedActiveSession(runnerDb, "session-limit2-active2");
		// Seed a pending request so active(1) + pending(1) == 2 == limit
		await runnerDb.insert(agentSessionRequests).values({
			id: "pending-busycheck",
			sourceKind: "subscription",
			sourceId: "fire-pending",
			streamId: "subscription:fire-pending",
			agentId: AGENT_ID,
			teamId: TEAM_ID,
			promptMode: "subscription",
			idempotencyKey: "pending-busycheck",
			sourceCorrelationJson: JSON.stringify({ subscriptionId: "sub-pending", teamId: TEAM_ID }),
			payloadJson: JSON.stringify({}),
			status: "pending",
			createdAt: NOW,
			updatedAt: NOW,
		});

		const deps: InboxWorkDeps = { db: runnerDb, eventBus, door: makeDoor() };
		await expect(actOnInboxRow(deps, makeAgent(), taskRunRow)).rejects.toBeInstanceOf(NotYet);
		// Only the seeded pending row — no new one was added
		expect(await countQueuedRequests(runnerDb)).toBe(1);
	});
});
