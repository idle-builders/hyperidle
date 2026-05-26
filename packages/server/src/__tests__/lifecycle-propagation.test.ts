/**
 * L20 — Lifecycle Propagation Engine: Vitest tests.
 *
 * These tests are written in the RED phase. The implementation does not exist yet.
 * All tests are expected to FAIL until lifecycle-propagation.ts is created.
 *
 * @lore L20: messages.senderId references agents.id (FK). Any test that
 * exercises review-thread creation must seed a "system:propagation" agent row,
 * or the insert will fail with a FK constraint violation (F6 from arch review).
 */

import {
	bets,
	createTestDb,
	type HyperIdleDb,
	messages,
	notificationQueue,
	products,
	propagationLog,
	sessions,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { registerLifecyclePropagation, retryFailedPropagations } from "@hyperidle/fabric";
import { EventBus, type PropagationAppliedEvent } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SYSTEM_PROPAGATION_ID = "system:propagation";

function seedBase(db: HyperIdleDb): void {
	const now = new Date().toISOString();
	db.insert(products)
		.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: now })
		.run();
	db.insert(teams)
		.values({ id: "team-1", productId: "prod-1", capacity: 5, activeBets: 1, formedAt: now })
		.run();
	db.insert(bets)
		.values({
			id: "bet-1",
			productId: "prod-1",
			teamId: "team-1",
			pitch: "Test bet",
			status: "in_progress",
			createdAt: now,
		})
		.run();
	db.insert(users)
		.values({
			id: "agent-1",
			name: "Builder Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		})
		.run();
	// F6: Seed the system propagation agent so review-thread messages can insert
	db.insert(users)
		.values({
			id: SYSTEM_PROPAGATION_ID,
			name: "Propagation System",
			role: "system",
			status: "active",
			createdAt: now,
		})
		.run();
}

function seedTask(db: HyperIdleDb, id: string, state: string, betId = "bet-1"): void {
	const now = new Date().toISOString();
	db.insert(tasks)
		.values({
			id,
			betId,
			productId: "prod-1",
			teamId: "team-1",
			title: `Task ${id}`,
			state,
			createdAt: now,
			updatedAt: now,
		})
		.run();
}

function seedSession(
	db: HyperIdleDb,
	id: string,
	taskId: string,
	state: string,
	outcome?: string,
): void {
	db.insert(sessions)
		.values({
			id,
			taskId,
			agentId: "agent-1",
			modelTier: "capable",
			startedAt: new Date().toISOString(),
			state,
			outcome: outcome ?? null,
		})
		.run();
}

// ─── Session -> Task propagation ─────────────────────────────────────────────

describe("registerLifecyclePropagation — session -> task", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let unsubscribe: () => void;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		seedBase(db);
	});

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	it("transitions task to review when session ends with outcome=completed and task is in_progress with no other active sessions", () => {
		// Arrange
		seedTask(db, "task-1", "in_progress");
		seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus);

		// Act: emit session_ended with outcome=completed
		eventBus.emit({
			type: "session_ended",
			streamId: "session-1",
			sessionId: "session-1",
			agentId: "agent-1",
			taskId: "task-1",
			timestamp: Date.now(),
			outcome: "completed",
		});

		// Assert: task is now in review
		const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		expect(task?.state).toBe("review");
	});

	it("logs propagation_log entry with status=applied when transition succeeds", () => {
		// Arrange
		seedTask(db, "task-1", "in_progress");
		seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus);

		// Act
		eventBus.emit({
			type: "session_ended",
			streamId: "session-1",
			sessionId: "session-1",
			agentId: "agent-1",
			taskId: "task-1",
			timestamp: Date.now(),
			outcome: "completed",
		});

		// Assert: propagation_log has an applied entry
		const logs = db
			.select()
			.from(propagationLog)
			.where(and(eq(propagationLog.sourceId, "session-1"), eq(propagationLog.status, "applied")))
			.all();
		expect(logs).toHaveLength(1);
		expect(logs[0].sourceLevel).toBe("session");
		expect(logs[0].targetLevel).toBe("task");
		expect(logs[0].targetId).toBe("task-1");
		expect(logs[0].targetTransition).toBe("in_progress -> review");
	});

	it("does NOT transition task when session ends with outcome=crashed (F2: crashed stays in_progress)", () => {
		// Arrange
		seedTask(db, "task-1", "in_progress");
		seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus);

		// Act
		eventBus.emit({
			type: "session_ended",
			streamId: "session-1",
			sessionId: "session-1",
			agentId: "agent-1",
			taskId: "task-1",
			timestamp: Date.now(),
			outcome: "crashed",
		});

		// Assert: task stays in_progress
		const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		expect(task?.state).toBe("in_progress");

		// And propagation_log records skipped
		const logs = db.select().from(propagationLog).where(eq(propagationLog.status, "skipped")).all();
		expect(logs.length).toBeGreaterThanOrEqual(1);
	});

	it("does NOT transition task when session ends with outcome=stopped (F2: stopped same as crashed)", () => {
		// Arrange
		seedTask(db, "task-1", "in_progress");
		seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus);

		// Act
		eventBus.emit({
			type: "session_ended",
			streamId: "session-1",
			sessionId: "session-1",
			agentId: "agent-1",
			taskId: "task-1",
			timestamp: Date.now(),
			outcome: "stopped",
		});

		// Assert: task stays in_progress
		const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		expect(task?.state).toBe("in_progress");
	});

	it("does NOT transition task when other sessions are still active", () => {
		// Arrange: two sessions, session-1 active, session-2 also active
		seedTask(db, "task-1", "in_progress");
		seedSession(db, "session-1", "task-1", "active");
		seedSession(db, "session-2", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus);

		// Act: session-1 ends completed, but session-2 still active
		eventBus.emit({
			type: "session_ended",
			streamId: "session-1",
			sessionId: "session-1",
			agentId: "agent-1",
			taskId: "task-1",
			timestamp: Date.now(),
			outcome: "completed",
		});

		// Assert: task still in_progress (session-2 is still running)
		const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		expect(task?.state).toBe("in_progress");
	});

	it("does NOT transition task when task is NOT in_progress (already moved)", () => {
		// Arrange: task is already in 'review'
		seedTask(db, "task-1", "review");
		seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus);

		// Act
		eventBus.emit({
			type: "session_ended",
			streamId: "session-1",
			sessionId: "session-1",
			agentId: "agent-1",
			taskId: "task-1",
			timestamp: Date.now(),
			outcome: "completed",
		});

		// Assert: task remains in review (not double-transitioned)
		const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		expect(task?.state).toBe("review");
	});

	it("handles concurrent race: InvalidTransitionError is caught and logged as skipped (F1, F4)", () => {
		// Arrange: task manually moved away from in_progress BEFORE propagation fires
		seedTask(db, "task-1", "in_progress");
		seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus);

		// Manually transition task to 'review' to simulate race
		db.update(tasks)
			.set({ state: "done", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, "task-1"))
			.run();

		// Act: propagation tries to move in_progress -> review but task is 'done'
		eventBus.emit({
			type: "session_ended",
			streamId: "session-1",
			sessionId: "session-1",
			agentId: "agent-1",
			taskId: "task-1",
			timestamp: Date.now(),
			outcome: "completed",
		});

		// Assert: no exception thrown; propagation_log has a skipped or failed entry
		const logs = db
			.select()
			.from(propagationLog)
			.where(eq(propagationLog.sourceId, "session-1"))
			.all();
		expect(logs.length).toBeGreaterThanOrEqual(1);
		const lastLog = logs[logs.length - 1];
		expect(["skipped", "failed"]).toContain(lastLog.status);
	});
});

// ─── Task -> Bet propagation ──────────────────────────────────────────────────

describe("registerLifecyclePropagation — task -> bet", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let unsubscribe: () => void;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		seedBase(db);
	});

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	it("transitions bet to review when all tasks on bet are terminal (done)", async () => {
		// Arrange: two tasks both done
		seedTask(db, "task-1", "done");
		seedTask(db, "task-2", "in_progress");
		unsubscribe = registerLifecyclePropagation(db, eventBus);

		// Manually move task-2 to done (bypass state machine for direct DB test)
		// then fire task_state_changed event
		db.update(tasks)
			.set({ state: "done", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, "task-2"))
			.run();

		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-2",
			taskId: "task-2",
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		});

		// Assert: bet is now in review
		const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
		expect(bet?.status).toBe("review");
	});

	it("does NOT transition bet when some tasks are still open", () => {
		// Arrange: one done, one still in_progress
		seedTask(db, "task-1", "done");
		seedTask(db, "task-2", "in_progress");
		unsubscribe = registerLifecyclePropagation(db, eventBus);

		// Act: task-1 goes done (task-2 still open)
		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-1",
			taskId: "task-1",
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		});

		// Assert: bet stays in_progress
		const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
		expect(bet?.status).toBe("in_progress");
	});

	it("transitions bet to review when last task is killed (all remaining terminal)", async () => {
		// Arrange: one done, one killed
		seedTask(db, "task-1", "done");
		seedTask(db, "task-2", "in_progress");
		unsubscribe = registerLifecyclePropagation(db, eventBus);

		// Move task-2 to killed
		db.update(tasks)
			.set({ state: "killed", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, "task-2"))
			.run();

		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-2",
			taskId: "task-2",
			fromState: "in_progress",
			toState: "killed",
			timestamp: Date.now(),
		});

		// Assert: bet transitions to review
		const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
		expect(bet?.status).toBe("review");
	});

	it("creates a ship-confirmation review thread when bet transitions to review", async () => {
		// Arrange
		seedTask(db, "task-1", "done");
		seedTask(db, "task-2", "in_progress");
		unsubscribe = registerLifecyclePropagation(db, eventBus);

		// Move task-2 to done
		db.update(tasks)
			.set({ state: "done", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, "task-2"))
			.run();

		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-2",
			taskId: "task-2",
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		});

		// Assert: a review thread exists with hostKind=bet, hostId=bet-1
		const allThreads = db
			.select()
			.from(threads)
			.where(and(eq(threads.hostKind, "bet"), eq(threads.hostId, "bet-1")))
			.all();
		expect(allThreads.length).toBeGreaterThanOrEqual(1);

		// Assert: a message of type review exists in the thread
		const thread = allThreads[0];
		const allMessages = db.select().from(messages).where(eq(messages.threadId, thread.id)).all();
		expect(allMessages.length).toBeGreaterThanOrEqual(1);
		const reviewMsg = allMessages.find((m) => m.type === "review");
		expect(reviewMsg).toBeDefined();
		if (!reviewMsg) return; // narrowing for TypeScript — expect above ensures this is reached
		const payload = JSON.parse(reviewMsg.payload) as { kind: string };
		expect(payload.kind).toBe("ship_confirmation");
	});

	it("handles concurrent race on bet: InvalidTransitionError caught and logged as skipped (F4)", async () => {
		// Arrange: bet manually killed while propagation fires
		seedTask(db, "task-1", "done");
		seedTask(db, "task-2", "in_progress");
		unsubscribe = registerLifecyclePropagation(db, eventBus);

		// Manually kill the bet (simulating concurrent human action)
		db.update(bets)
			.set({ status: "killed", revisionLog: JSON.stringify([]) })
			.where(eq(bets.id, "bet-1"))
			.run();
		// Also decrement activeBets on team (simulate full kill)
		db.update(teams).set({ activeBets: 0 }).where(eq(teams.id, "team-1")).run();

		// Move task-2 to done and fire event (propagation will try review but bet is killed)
		db.update(tasks)
			.set({ state: "done", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, "task-2"))
			.run();

		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-2",
			taskId: "task-2",
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		});

		// Assert: no unhandled exception; propagation_log has a skipped entry for the bet
		const logs = db.select().from(propagationLog).where(eq(propagationLog.targetId, "bet-1")).all();
		expect(logs.length).toBeGreaterThanOrEqual(1);
		const lastLog = logs[logs.length - 1];
		expect(["skipped", "failed"]).toContain(lastLog.status);
	});
});

// ─── Re-entrant cascade (F4) ──────────────────────────────────────────────────

describe("registerLifecyclePropagation — re-entrant cascade", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let unsubscribe: () => void;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		seedBase(db);
	});

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	it("session_ended cascades: session->task review, then task->bet review when task goes done (F4)", () => {
		// Arrange: one task in_progress, one active session
		seedTask(db, "task-1", "in_progress");
		seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus);

		// Act step 1: session ends -> task moves to review
		eventBus.emit({
			type: "session_ended",
			streamId: "session-1",
			sessionId: "session-1",
			agentId: "agent-1",
			taskId: "task-1",
			timestamp: Date.now(),
			outcome: "completed",
		});

		// Assert: task is in review
		const taskAfterSession = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		expect(taskAfterSession?.state).toBe("review");

		// Verify hop 1 logged
		const hop1Logs = db
			.select()
			.from(propagationLog)
			.where(
				and(
					eq(propagationLog.sourceLevel, "session"),
					eq(propagationLog.targetLevel, "task"),
					eq(propagationLog.status, "applied"),
				),
			)
			.all();
		expect(hop1Logs.length).toBeGreaterThanOrEqual(1);

		// Act step 2: task manually moved to done -> bet should go to review
		db.update(tasks)
			.set({ state: "done", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, "task-1"))
			.run();

		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-1",
			taskId: "task-1",
			fromState: "review",
			toState: "done",
			timestamp: Date.now(),
		});

		// Assert: bet is now in review
		const bet = db.select().from(bets).where(eq(bets.id, "bet-1")).get();
		expect(bet?.status).toBe("review");

		// Verify hop 2 logged separately
		const hop2Logs = db
			.select()
			.from(propagationLog)
			.where(
				and(
					eq(propagationLog.sourceLevel, "task"),
					eq(propagationLog.targetLevel, "bet"),
					eq(propagationLog.status, "applied"),
				),
			)
			.all();
		expect(hop2Logs.length).toBeGreaterThanOrEqual(1);
	});
});

// ─── Bet -> Product propagation ───────────────────────────────────────────────

describe("registerLifecyclePropagation — bet -> product", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let unsubscribe: () => void;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		seedBase(db);
	});

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	it("logs propagation_applied entry when bet transitions to shipped", () => {
		// Arrange
		unsubscribe = registerLifecyclePropagation(db, eventBus);
		const propagationEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => propagationEvents.push(e));

		// Act: emit bet_state_changed to shipped
		eventBus.emit({
			type: "bet_state_changed",
			streamId: "prod-1",
			betId: "bet-1",
			fromState: "review",
			toState: "shipped",
			timestamp: Date.now(),
		});

		// Assert: propagation_log records the event
		const logs = db
			.select()
			.from(propagationLog)
			.where(and(eq(propagationLog.sourceId, "bet-1"), eq(propagationLog.sourceLevel, "bet")))
			.all();
		expect(logs.length).toBeGreaterThanOrEqual(1);
		expect(logs[0].targetLevel).toBe("product");
		expect(logs[0].status).toBe("applied");
	});

	it("emits propagation_applied event when bet transitions to shipped", () => {
		// Arrange
		unsubscribe = registerLifecyclePropagation(db, eventBus);
		const propagationEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => propagationEvents.push(e));

		// Act
		eventBus.emit({
			type: "bet_state_changed",
			streamId: "prod-1",
			betId: "bet-1",
			fromState: "review",
			toState: "shipped",
			timestamp: Date.now(),
		});

		// Assert: propagation_applied event emitted
		expect(propagationEvents).toHaveLength(1);
		expect(propagationEvents[0].sourceId).toBe("bet-1");
		expect(propagationEvents[0].targetLevel).toBe("product");
	});

	it("logs propagation entry when bet transitions to killed", () => {
		// Arrange
		unsubscribe = registerLifecyclePropagation(db, eventBus);

		// Act: emit bet_state_changed to killed
		eventBus.emit({
			type: "bet_state_changed",
			streamId: "prod-1",
			betId: "bet-1",
			fromState: "in_progress",
			toState: "killed",
			timestamp: Date.now(),
		});

		// Assert: propagation_log records the event
		const logs = db
			.select()
			.from(propagationLog)
			.where(and(eq(propagationLog.sourceId, "bet-1"), eq(propagationLog.sourceLevel, "bet")))
			.all();
		expect(logs.length).toBeGreaterThanOrEqual(1);
	});
});

// ─── Retry mechanism ──────────────────────────────────────────────────────────

describe("registerLifecyclePropagation — retry mechanism", () => {
	let db: HyperIdleDb;
	let unsubscribe: () => void;

	beforeEach(() => {
		db = createTestDb();
		seedBase(db);
	});

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	it("retryFailedPropagations: retries a pending_retry session->task row and transitions task to applied", () => {
		// Arrange: a real task in in_progress state and a real session that previously
		// ended completed but whose propagation was stored as pending_retry (simulating
		// a transient error on first attempt).
		const now = new Date().toISOString();
		seedTask(db, "task-retry-1", "in_progress");
		// Seed the session row as ended+completed so the retry re-execution succeeds
		db.insert(sessions)
			.values({
				id: "session-retry-1",
				taskId: "task-retry-1",
				agentId: "agent-1",
				modelTier: "capable",
				startedAt: now,
				endedAt: now,
				state: "ended",
				outcome: "completed",
			})
			.run();

		db.insert(propagationLog)
			.values({
				id: "log-retry-1",
				sourceLevel: "session",
				sourceId: "session-retry-1",
				sourceEvent: "session_ended",
				targetLevel: "task",
				targetId: "task-retry-1",
				targetTransition: null,
				status: "pending_retry",
				failureReason: "Transient DB error",
				attempts: 1,
				createdAt: now,
				appliedAt: null,
			})
			.run();

		const eventBus = new EventBus();

		// Act: call retryFailedPropagations
		retryFailedPropagations(db, eventBus);

		// Assert: the task was transitioned to review
		const task = db.select().from(tasks).where(eq(tasks.id, "task-retry-1")).get();
		expect(task?.state).toBe("review");

		// Assert: a new applied log entry was written for the successful retry
		const appliedLogs = db
			.select()
			.from(propagationLog)
			.where(and(eq(propagationLog.targetId, "task-retry-1"), eq(propagationLog.status, "applied")))
			.all();
		expect(appliedLogs.length).toBeGreaterThanOrEqual(1);
	});

	it("retryFailedPropagations: row with attempts=3 (at max) changes status to failed and creates notification", () => {
		// Arrange: insert a pending_retry row that is already at MAX_RETRY_ATTEMPTS (3)
		const now = new Date().toISOString();
		db.insert(propagationLog)
			.values({
				id: "log-exhausted-1",
				sourceLevel: "session",
				sourceId: "session-y",
				sourceEvent: "session_ended",
				targetLevel: "task",
				targetId: "task-y",
				targetTransition: null,
				status: "pending_retry",
				failureReason: "Transient DB error",
				attempts: 3,
				createdAt: now,
				appliedAt: null,
			})
			.run();

		const eventBus = new EventBus();

		// Act: call retryFailedPropagations
		retryFailedPropagations(db, eventBus);

		// Assert: the row is now marked failed
		const failedLogs = db
			.select()
			.from(propagationLog)
			.where(eq(propagationLog.id, "log-exhausted-1"))
			.all();
		expect(failedLogs).toHaveLength(1);
		expect(failedLogs[0].status).toBe("failed");
		expect(failedLogs[0].attempts).toBe(3);

		// Assert: a notification queue entry was created
		const notifs = db
			.select()
			.from(notificationQueue)
			.where(eq(notificationQueue.eventType, "propagation_exhausted"))
			.all();
		expect(notifs).toHaveLength(1);
		expect(notifs[0].severity).toBe("warning");
	});
});

// ─── Propagation log coverage ────────────────────────────────────────────────

describe("registerLifecyclePropagation — propagation log", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let unsubscribe: () => void;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		seedBase(db);
	});

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	it("creates a propagation_log entry for every propagation attempt", () => {
		// Arrange
		seedTask(db, "task-1", "in_progress");
		seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus);

		const initialLogCount = db.select().from(propagationLog).all().length;

		// Act
		eventBus.emit({
			type: "session_ended",
			streamId: "session-1",
			sessionId: "session-1",
			agentId: "agent-1",
			taskId: "task-1",
			timestamp: Date.now(),
			outcome: "completed",
		});

		// Assert: at least one new log entry
		const newLogCount = db.select().from(propagationLog).all().length;
		expect(newLogCount).toBeGreaterThan(initialLogCount);
	});

	it("emits propagation_applied event when session->task propagation succeeds", () => {
		// Arrange
		seedTask(db, "task-1", "in_progress");
		seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus);

		const appliedEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => appliedEvents.push(e));

		// Act
		eventBus.emit({
			type: "session_ended",
			streamId: "session-1",
			sessionId: "session-1",
			agentId: "agent-1",
			taskId: "task-1",
			timestamp: Date.now(),
			outcome: "completed",
		});

		// Assert: propagation_applied event was emitted
		expect(appliedEvents).toHaveLength(1);
		expect(appliedEvents[0].sourceLevel).toBe("session");
		expect(appliedEvents[0].targetLevel).toBe("task");
	});

	it("returns unsubscribe function that stops all event handling", () => {
		// Arrange
		seedTask(db, "task-1", "in_progress");
		seedSession(db, "session-1", "task-1", "active");
		const unsub = registerLifecyclePropagation(db, eventBus);

		// Unsubscribe
		unsub();

		// Act: emit after unsubscribing
		eventBus.emit({
			type: "session_ended",
			streamId: "session-1",
			sessionId: "session-1",
			agentId: "agent-1",
			taskId: "task-1",
			timestamp: Date.now(),
			outcome: "completed",
		});

		// Assert: no propagation happened (task stays in_progress)
		const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		expect(task?.state).toBe("in_progress");

		// No log entries created
		const logs = db.select().from(propagationLog).all();
		expect(logs).toHaveLength(0);
	});
});
