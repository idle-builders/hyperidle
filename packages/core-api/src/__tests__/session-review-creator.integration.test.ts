import { findThread, insertThread, updateThread } from "@hyperidle/conversation";
import type { WriteExecutor } from "@hyperidle/db";
import {
	bets,
	type HyperIdleDb,
	items,
	sessions,
	taskPlanningSignals,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { resolveReviewRecipients } from "@hyperidle/org";
import { type ReviewPorts, registerReviewSubscriptions } from "@hyperidle/review";
import type { ItemCreatedEvent, SessionEndedEvent } from "@hyperidle/shared";
import { findUser, listUsers } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { getTaskRiskTierByTaskId } from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, vi } from "vitest";
import { recordAgentWorkIntent } from "../services/session-requests-bindings.js";
import { test } from "../test-fixtures.js";

/**
 * @lore AU19 Increment 1j: `registerReviewSubscriptions` now takes injected
 * `work`/`conversation`/`users`/`org` ports (Mechanism C — `review` never
 * imports another Service). This test builds the exact same production
 * wiring `server-factory.ts` uses — no behavior change.
 *
 * @lore AU19 Increment 1k: `taskRiskTier` ADDED — wired to `work`'s real
 * `getTaskRiskTierByTaskId`, replacing the direct `taskStrategyFabric` table
 * seed/query this test used before AU3's half-done rename was finished.
 */
const reviewDeps: ReviewPorts = {
	work: {
		getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id),
		updateTaskById: (exec: WriteExecutor, id: string, patch) =>
			work.update(exec, "task", id, patch),
		createItem: (exec: WriteExecutor, values) => work.create(exec, "item", values),
		getRiskTierByTaskId: getTaskRiskTierByTaskId,
	},
	conversation: { insertThread, getThreadById: (db, id) => findThread(db, { id }), updateThread },
	users: {
		getUserById: (db, id) => findUser(db, { id }),
		listUsersByKind: (db, kind) => listUsers(db, { kind }),
	},
	org: { resolveReviewRecipients },
	intentRecorder: { record: recordAgentWorkIntent },
};

async function seedBase(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({
		id: "prod-1",
		name: "Test Product",
		phase: "build",
		createdAt: new Date().toISOString(),
	});

	await db.insert(teamMembers).values({
		id: "team-1",
		teamId: "prod-1",
		capacity: 3,
		activeBets: 0,
		formedAt: new Date().toISOString(),
	});

	await db.insert(bets).values({
		id: "bet-1",
		teamId: "prod-1",
		description: "Test bet",
		appetite: "small",
		status: "active",
		createdAt: new Date().toISOString(),
	});

	await db.insert(users).values({
		id: "agent-1",
		name: "Test Agent",
		role: "builder",
		status: "active",
		createdAt: new Date().toISOString(),
	});
}

describe("registerReviewSubscriptions", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("creates review item for high-risk task on session_ended", async ({ db, eventBus }) => {
		await seedBase(db);
		const unsubscribe = registerReviewSubscriptions(db, eventBus, reviewDeps);

		// Create high-risk task with a thread
		await db.insert(threads).values({
			id: "thread-1",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "agent-1",
			participants: JSON.stringify(["agent-1"]),
			lastActiveAt: new Date().toISOString(),
			createdAt: new Date().toISOString(),
		});

		await db.insert(tasks).values({
			id: "task-1",
			betId: "bet-1",
			teamId: "prod-1",
			title: "High risk task",
			state: "in_progress",
			threadId: "thread-1",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		await db
			.insert(taskPlanningSignals)
			.values({ id: "tsf-task-1", taskId: "task-1", riskTier: "high" });

		await db.insert(sessions).values({
			id: "session-1",
			taskId: "task-1",
			agentId: "agent-1",
			modelTier: "capable",
			startedAt: new Date().toISOString(),
			state: "ended",
			outcome: "success",
		});

		// Track emitted events
		const emittedEvents: ItemCreatedEvent[] = [];
		eventBus.on("item_created", (e) => emittedEvents.push(e));

		// Emit session_ended
		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: "stream-1",
			sessionId: "session-1",
			agentId: "agent-1",
			taskId: "task-1",
			timestamp: Date.now(),
			outcome: "completed",
		};
		eventBus.emit(event);

		// Handler is async — wait for it to complete
		await vi.waitFor(async () => {
			const createdItems = await db.select().from(items).where(eq(items.threadId, "thread-1"));
			expect(createdItems).toHaveLength(1);
			expect(createdItems[0]!.kind).toBe("review");
			expect(createdItems[0]!.title).toBe("Session completed: success");
		});

		expect(emittedEvents).toHaveLength(1);
		expect(emittedEvents[0]!.kind).toBe("review");

		unsubscribe();
	});

	test("does not create review item for low-risk task", async ({ db, eventBus }) => {
		await seedBase(db);
		const unsubscribe = registerReviewSubscriptions(db, eventBus, reviewDeps);

		await db.insert(tasks).values({
			id: "task-low",
			betId: "bet-1",
			teamId: "prod-1",
			title: "Low risk task",
			state: "in_progress",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		await db
			.insert(taskPlanningSignals)
			.values({ id: "tsf-task-low", taskId: "task-low", riskTier: "low" });

		await db.insert(sessions).values({
			id: "session-low",
			taskId: "task-low",
			agentId: "agent-1",
			modelTier: "capable",
			startedAt: new Date().toISOString(),
			state: "ended",
		});

		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: "stream-1",
			sessionId: "session-low",
			agentId: "agent-1",
			taskId: "task-low",
			timestamp: Date.now(),
			outcome: "completed",
		};
		eventBus.emit(event);

		// Handler is async — give it a tick to run, then confirm nothing was created
		await new Promise((r) => setTimeout(r, 50));
		const allItems = await db.select().from(items);
		expect(allItems).toHaveLength(0);

		unsubscribe();
	});

	test("auto-creates thread when task has no threadId", async ({ db, eventBus }) => {
		await seedBase(db);
		const unsubscribe = registerReviewSubscriptions(db, eventBus, reviewDeps);

		await db.insert(tasks).values({
			id: "task-no-thread",
			betId: "bet-1",
			teamId: "prod-1",
			title: "No thread task",
			state: "in_progress",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		await db
			.insert(taskPlanningSignals)
			.values({ id: "tsf-task-no-thread", taskId: "task-no-thread", riskTier: "medium" });

		await db.insert(sessions).values({
			id: "session-no-thread",
			taskId: "task-no-thread",
			agentId: "agent-1",
			modelTier: "capable",
			startedAt: new Date().toISOString(),
			state: "ended",
			outcome: "partial",
		});

		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: "stream-1",
			sessionId: "session-no-thread",
			agentId: "agent-1",
			taskId: "task-no-thread",
			timestamp: Date.now(),
			outcome: "completed",
		};
		eventBus.emit(event);

		// Handler is async — wait for it to complete
		await vi.waitFor(async () => {
			const allThreads = await db.select().from(threads);
			expect(allThreads).toHaveLength(1);
			expect(allThreads[0]!.hostKind).toBe("task");
			expect(allThreads[0]!.hostId).toBe("task-no-thread");
		});

		const allThreads = await db.select().from(threads);
		const allItems = await db.select().from(items);
		expect(allItems).toHaveLength(1);
		expect(allItems[0]!.threadId).toBe(allThreads[0]!.id);
		expect(allItems[0]!.title).toBe("Session completed: partial");

		const [updatedTask] = await db.select().from(tasks).where(eq(tasks.id, "task-no-thread"));
		expect(updatedTask?.threadId).toBe(allThreads[0]!.id);

		unsubscribe();
	});

	test("returns an unsubscribe function that stops handling events", async ({ db, eventBus }) => {
		await seedBase(db);
		const unsubscribe = registerReviewSubscriptions(db, eventBus, reviewDeps);

		await db.insert(tasks).values({
			id: "task-unsub",
			betId: "bet-1",
			teamId: "prod-1",
			title: "Unsub task",
			state: "in_progress",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		await db
			.insert(taskPlanningSignals)
			.values({ id: "tsf-task-unsub", taskId: "task-unsub", riskTier: "high" });

		await db.insert(sessions).values({
			id: "session-unsub",
			taskId: "task-unsub",
			agentId: "agent-1",
			modelTier: "capable",
			startedAt: new Date().toISOString(),
			state: "ended",
		});

		// Unsubscribe before emitting
		unsubscribe();

		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: "stream-1",
			sessionId: "session-unsub",
			agentId: "agent-1",
			taskId: "task-unsub",
			timestamp: Date.now(),
			outcome: "completed",
		};
		eventBus.emit(event);

		await new Promise((r) => setTimeout(r, 50));
		const allItems = await db.select().from(items);
		expect(allItems).toHaveLength(0);
	});
});
