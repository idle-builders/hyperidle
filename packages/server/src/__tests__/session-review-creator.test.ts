import {
	agents,
	bets,
	createTestDb,
	type HyperIdleDb,
	items,
	products,
	sessions,
	tasks,
	teams,
	threads,
} from "@hyperidle/db";
import type { ItemCreatedEvent, SessionEndedEvent } from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSessionReviewCreator } from "../services/session-review-creator.js";

describe("registerSessionReviewCreator", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();

		// Seed base data
		db.insert(products)
			.values({
				id: "prod-1",
				name: "Test Product",
				phase: "build",
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(teams)
			.values({
				id: "team-1",
				productId: "prod-1",
				capacity: 3,
				activeBets: 0,
				formedAt: new Date().toISOString(),
			})
			.run();
		db.insert(bets)
			.values({
				id: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				pitch: "Test bet",
				appetite: "small",
				status: "in_progress",
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(agents)
			.values({
				id: "agent-1",
				name: "Test Agent",
				role: "builder",
				status: "active",
				createdAt: new Date().toISOString(),
			})
			.run();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("creates review item for high-risk task on session_ended", () => {
		const unsubscribe = registerSessionReviewCreator(db, eventBus);

		// Create high-risk task with a thread
		db.insert(threads)
			.values({
				id: "thread-1",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(tasks)
			.values({
				id: "task-1",
				betId: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				title: "High risk task",
				state: "in_progress",
				riskTier: "high",
				threadId: "thread-1",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			})
			.run();
		db.insert(sessions)
			.values({
				id: "session-1",
				taskId: "task-1",
				agentId: "agent-1",
				modelTier: "capable",
				startedAt: new Date().toISOString(),
				state: "ended",
				outcome: "success",
			})
			.run();

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
			costDelta: 0,
			outcome: "completed",
		};
		eventBus.emit(event);

		// Verify item was created
		const createdItems = db.select().from(items).where(eq(items.threadId, "thread-1")).all();
		expect(createdItems).toHaveLength(1);
		expect(createdItems[0].kind).toBe("review");
		expect(createdItems[0].title).toBe("Session completed: success");

		// Verify event was emitted
		expect(emittedEvents).toHaveLength(1);
		expect(emittedEvents[0].kind).toBe("review");

		unsubscribe();
	});

	it("does not create review item for low-risk task", () => {
		const unsubscribe = registerSessionReviewCreator(db, eventBus);

		db.insert(tasks)
			.values({
				id: "task-low",
				betId: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				title: "Low risk task",
				state: "in_progress",
				riskTier: "low",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			})
			.run();
		db.insert(sessions)
			.values({
				id: "session-low",
				taskId: "task-low",
				agentId: "agent-1",
				modelTier: "capable",
				startedAt: new Date().toISOString(),
				state: "ended",
			})
			.run();

		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: "stream-1",
			sessionId: "session-low",
			agentId: "agent-1",
			taskId: "task-low",
			timestamp: Date.now(),
			costDelta: 0,
			outcome: "completed",
		};
		eventBus.emit(event);

		// No items created
		const allItems = db.select().from(items).all();
		expect(allItems).toHaveLength(0);

		unsubscribe();
	});

	it("auto-creates thread when task has no threadId", () => {
		const unsubscribe = registerSessionReviewCreator(db, eventBus);

		db.insert(tasks)
			.values({
				id: "task-no-thread",
				betId: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				title: "No thread task",
				state: "in_progress",
				riskTier: "medium",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			})
			.run();
		db.insert(sessions)
			.values({
				id: "session-no-thread",
				taskId: "task-no-thread",
				agentId: "agent-1",
				modelTier: "capable",
				startedAt: new Date().toISOString(),
				state: "ended",
				outcome: "partial",
			})
			.run();

		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: "stream-1",
			sessionId: "session-no-thread",
			agentId: "agent-1",
			taskId: "task-no-thread",
			timestamp: Date.now(),
			costDelta: 0,
			outcome: "completed",
		};
		eventBus.emit(event);

		// Verify thread was created
		const allThreads = db.select().from(threads).all();
		expect(allThreads).toHaveLength(1);
		expect(allThreads[0].kind).toBe("review");

		// Verify item was created in the new thread
		const allItems = db.select().from(items).all();
		expect(allItems).toHaveLength(1);
		expect(allItems[0].threadId).toBe(allThreads[0].id);
		expect(allItems[0].title).toBe("Session completed: partial");

		// Verify task was updated with new threadId
		const updatedTask = db.select().from(tasks).where(eq(tasks.id, "task-no-thread")).get();
		expect(updatedTask?.threadId).toBe(allThreads[0].id);

		unsubscribe();
	});

	it("returns an unsubscribe function that stops handling events", () => {
		const unsubscribe = registerSessionReviewCreator(db, eventBus);

		db.insert(tasks)
			.values({
				id: "task-unsub",
				betId: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				title: "Unsub task",
				state: "in_progress",
				riskTier: "high",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			})
			.run();
		db.insert(sessions)
			.values({
				id: "session-unsub",
				taskId: "task-unsub",
				agentId: "agent-1",
				modelTier: "capable",
				startedAt: new Date().toISOString(),
				state: "ended",
			})
			.run();

		// Unsubscribe before emitting
		unsubscribe();

		const event: SessionEndedEvent = {
			type: "session_ended",
			streamId: "stream-1",
			sessionId: "session-unsub",
			agentId: "agent-1",
			taskId: "task-unsub",
			timestamp: Date.now(),
			costDelta: 0,
			outcome: "completed",
		};
		eventBus.emit(event);

		// No items created
		const allItems = db.select().from(items).all();
		expect(allItems).toHaveLength(0);
	});
});
