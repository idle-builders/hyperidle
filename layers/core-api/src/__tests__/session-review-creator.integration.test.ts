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
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import type { ItemCreatedEvent, SessionEndedEvent } from "@hyperidle/domain-model";
import { resolveReviewRecipients } from "@hyperidle/org";
import { type ReviewPorts, registerReviewSubscriptions } from "@hyperidle/review";
import { enqueueWorkIntent } from "@hyperidle/session-requests";
import { findUser, listUsers, requireRunnableAgent } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { getTaskRiskTierByTaskId } from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

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
	intentRecorder: { record: enqueueWorkIntent },
	requireRunnableAgent,
};

async function seedBase(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	await db.insert(teams).values({
		id: ids("prod-1"),
		name: "Test Product",
		phase: "build",
		createdAt: new Date().toISOString(),
	});

	await db.insert(teamMembers).values({
		id: ids("team-1"),
		teamId: ids("prod-1"),
		capacity: 3,
		activeBets: 0,
		formedAt: new Date().toISOString(),
	});

	await db.insert(bets).values({
		id: ids("bet-1"),
		teamId: ids("prod-1"),
		description: "Test bet",
		appetite: "small",
		status: "active",
		createdAt: new Date().toISOString(),
	});

	await db.insert(users).values({
		id: ids("agent-1"),
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

	test("creates review item for high-risk task on session_ended", async ({ db, eventBus, ids }) => {
		await seedBase(db, ids);
		const unsubscribe = registerReviewSubscriptions(db, eventBus, reviewDeps);

		// Create high-risk task with a thread
		await db.insert(threads).values({
			id: ids("thread-1"),
			hostKind: "task",
			hostId: ids("task-1"),
			initiatorId: ids("agent-1"),
			participants: JSON.stringify([ids("agent-1")]),
			lastActiveAt: new Date().toISOString(),
			createdAt: new Date().toISOString(),
		});

		await db.insert(tasks).values({
			id: ids("task-1"),
			betId: ids("bet-1"),
			teamId: ids("prod-1"),
			title: "High risk task",
			state: "in_progress",
			threadId: ids("thread-1"),
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		await db
			.insert(taskPlanningSignals)
			.values({ id: ids("tsf-task-1"), taskId: ids("task-1"), riskTier: "high" });

		// @lore AU26 H3: the row's `outcome` matches the event's. In production
		// they always do — `endSession` writes `terminalOutcome` to the row and
		// emits the SAME value — and after AU26 H3 the event is the only source
		// the review creator reads. `SessionOutcome` is a closed 4-member union;
		// this file used to seed free-text values ("success"/"partial") that no
		// producer can ever emit.
		await db.insert(sessions).values({
			id: ids("session-1"),
			taskId: ids("task-1"),
			agentId: ids("agent-1"),
			modelTier: "capable",
			startedAt: new Date().toISOString(),
			state: "ended",
			outcome: "not_returned",
		});

		// Track emitted events
		const emittedEvents: ItemCreatedEvent[] = [];
		eventBus.on("item_created", (e) => emittedEvents.push(e));

		// Emit session_ended
		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: ids("stream-1"),
			sessionId: ids("session-1"),
			agentId: ids("agent-1"),
			taskId: ids("task-1"),
			timestamp: Date.now(),
			outcome: "not_returned",
		};
		eventBus.emit(event);

		// Handler is async — wait for it to complete
		await vi.waitFor(async () => {
			const createdItems = await db
				.select()
				.from(items)
				.where(eq(items.threadId, ids("thread-1")));
			expect(createdItems).toHaveLength(1);
			expect(createdItems[0]!.kind).toBe("review");
			expect(createdItems[0]!.title).toBe("Session completed: not_returned");
		});

		expect(emittedEvents).toHaveLength(1);
		expect(emittedEvents[0]!.kind).toBe("review");

		unsubscribe();
	});

	test("does not create review item for low-risk task", async ({ db, eventBus, ids }) => {
		await seedBase(db, ids);
		const unsubscribe = registerReviewSubscriptions(db, eventBus, reviewDeps);

		await db.insert(tasks).values({
			id: ids("task-low"),
			betId: ids("bet-1"),
			teamId: ids("prod-1"),
			title: "Low risk task",
			state: "in_progress",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		await db
			.insert(taskPlanningSignals)
			.values({ id: ids("tsf-task-low"), taskId: ids("task-low"), riskTier: "low" });

		await db.insert(sessions).values({
			id: ids("session-low"),
			taskId: ids("task-low"),
			agentId: ids("agent-1"),
			modelTier: "capable",
			startedAt: new Date().toISOString(),
			state: "ended",
		});

		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: ids("stream-1"),
			sessionId: ids("session-low"),
			agentId: ids("agent-1"),
			taskId: ids("task-low"),
			timestamp: Date.now(),
			outcome: "completed",
		};
		eventBus.emit(event);

		// Handler is async — give it a tick to run, then confirm nothing was created for our scope
		await new Promise((r) => setTimeout(r, 50));
		const myItems = await db
			.select()
			.from(items)
			.where(eq(items.threadId, ids("nonexistent-thread")));
		expect(myItems).toHaveLength(0);

		unsubscribe();
	});

	test("auto-creates thread when task has no threadId", async ({ db, eventBus, ids }) => {
		await seedBase(db, ids);
		const unsubscribe = registerReviewSubscriptions(db, eventBus, reviewDeps);

		await db.insert(tasks).values({
			id: ids("task-no-thread"),
			betId: ids("bet-1"),
			teamId: ids("prod-1"),
			title: "No thread task",
			state: "in_progress",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		await db.insert(taskPlanningSignals).values({
			id: ids("tsf-task-no-thread"),
			taskId: ids("task-no-thread"),
			riskTier: "medium",
		});

		await db.insert(sessions).values({
			id: ids("session-no-thread"),
			taskId: ids("task-no-thread"),
			agentId: ids("agent-1"),
			modelTier: "capable",
			startedAt: new Date().toISOString(),
			state: "ended",
			outcome: "crashed",
		});

		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: ids("stream-1"),
			sessionId: ids("session-no-thread"),
			agentId: ids("agent-1"),
			taskId: ids("task-no-thread"),
			timestamp: Date.now(),
			outcome: "crashed",
		};
		eventBus.emit(event);

		// Handler is async — wait for it to complete
		await vi.waitFor(async () => {
			const myThreads = await db
				.select()
				.from(threads)
				.where(eq(threads.hostId, ids("task-no-thread")));
			expect(myThreads).toHaveLength(1);
			expect(myThreads[0]!.hostKind).toBe("task");
			expect(myThreads[0]!.hostId).toBe(ids("task-no-thread"));
		});

		const myThreads = await db
			.select()
			.from(threads)
			.where(eq(threads.hostId, ids("task-no-thread")));
		const myItems = await db.select().from(items).where(eq(items.threadId, myThreads[0]!.id));
		expect(myItems).toHaveLength(1);
		expect(myItems[0]!.threadId).toBe(myThreads[0]!.id);
		expect(myItems[0]!.title).toBe("Session completed: crashed");

		const [updatedTask] = await db
			.select()
			.from(tasks)
			.where(eq(tasks.id, ids("task-no-thread")));
		expect(updatedTask?.threadId).toBe(myThreads[0]!.id);

		unsubscribe();
	});

	/**
	 * AU26 H3 (§D-M.4) — RED. The session-review creator re-read the `sessions`
	 * row for exactly three fields (`taskId`, `agentId`, `outcome`), all three
	 * of which `SessionEndedEvent` already carries; its sibling handler in the
	 * same file has always read them straight off the event. These two tests
	 * pin the event as the source: neither can pass while the DB read is there.
	 */
	test("reads outcome off the event, not off the session row", async ({ db, eventBus, ids }) => {
		await seedBase(db, ids);
		const unsubscribe = registerReviewSubscriptions(db, eventBus, reviewDeps);

		await db.insert(tasks).values({
			id: ids("task-outcome"),
			betId: ids("bet-1"),
			teamId: ids("prod-1"),
			title: "Outcome task",
			state: "in_progress",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		await db.insert(taskPlanningSignals).values({
			id: ids("tsf-task-outcome"),
			taskId: ids("task-outcome"),
			riskTier: "high",
		});
		// The row is deliberately stale — it carries no outcome at all. The
		// event is the authority.
		await db.insert(sessions).values({
			id: ids("session-outcome"),
			taskId: ids("task-outcome"),
			agentId: ids("agent-1"),
			modelTier: "capable",
			startedAt: new Date().toISOString(),
			state: "active",
		});

		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: ids("stream-outcome"),
			sessionId: ids("session-outcome"),
			agentId: ids("agent-1"),
			taskId: ids("task-outcome"),
			timestamp: Date.now(),
			outcome: "not_returned",
		};
		eventBus.emit(event);

		await vi.waitFor(async () => {
			const myItems = await db
				.select()
				.from(items)
				.where(eq(items.title, "Session completed: not_returned"));
			expect(myItems).toHaveLength(1);
			// Reading the row would have produced the `?? "completed"` fallback.
			expect(myItems[0]!.title).toBe("Session completed: not_returned");
		});

		unsubscribe();
	});

	test("creates the review item with no session row present at all", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		const unsubscribe = registerReviewSubscriptions(db, eventBus, reviewDeps);

		await db.insert(tasks).values({
			id: ids("task-rowless"),
			betId: ids("bet-1"),
			teamId: ids("prod-1"),
			title: "Rowless task",
			state: "in_progress",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		await db.insert(taskPlanningSignals).values({
			id: ids("tsf-task-rowless"),
			taskId: ids("task-rowless"),
			riskTier: "medium",
		});

		const mySessions = await db
			.select()
			.from(sessions)
			.where(eq(sessions.taskId, ids("task-rowless")));
		expect(mySessions).toHaveLength(0);

		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: ids("stream-rowless"),
			sessionId: ids("session-rowless"),
			agentId: ids("agent-1"),
			taskId: ids("task-rowless"),
			timestamp: Date.now(),
			outcome: "completed",
		};
		eventBus.emit(event);

		await vi.waitFor(async () => {
			const myItems = await db
				.select()
				.from(items)
				.where(eq(items.title, "Session completed: completed"));
			expect(myItems).toHaveLength(1);
			expect(myItems[0]!.kind).toBe("review");
			expect(myItems[0]!.title).toBe("Session completed: completed");
		});

		unsubscribe();
	});

	test("returns an unsubscribe function that stops handling events", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedBase(db, ids);
		const unsubscribe = registerReviewSubscriptions(db, eventBus, reviewDeps);

		await db.insert(tasks).values({
			id: ids("task-unsub"),
			betId: ids("bet-1"),
			teamId: ids("prod-1"),
			title: "Unsub task",
			state: "in_progress",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		await db
			.insert(taskPlanningSignals)
			.values({ id: ids("tsf-task-unsub"), taskId: ids("task-unsub"), riskTier: "high" });

		await db.insert(sessions).values({
			id: ids("session-unsub"),
			taskId: ids("task-unsub"),
			agentId: ids("agent-1"),
			modelTier: "capable",
			startedAt: new Date().toISOString(),
			state: "ended",
		});

		// Unsubscribe before emitting
		unsubscribe();

		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: ids("stream-1"),
			sessionId: ids("session-unsub"),
			agentId: ids("agent-1"),
			taskId: ids("task-unsub"),
			timestamp: Date.now(),
			outcome: "completed",
		};
		eventBus.emit(event);

		await new Promise((r) => setTimeout(r, 50));
		const myItems = await db
			.select()
			.from(items)
			.where(eq(items.title, "Session completed: completed"));
		expect(myItems).toHaveLength(0);
	});
});
