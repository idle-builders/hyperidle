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

import { insertMessage, insertThread } from "@hyperidle/conversation";
import {
	bets,
	type HyperIdleDb,
	messages,
	propagationLog,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { insertNotification, listAll } from "@hyperidle/notifications";
import {
	type LifecyclePropagationDeps,
	registerLifecyclePropagation,
	retryFailedPropagations,
} from "@hyperidle/policy";
import { EventBus, type PropagationAppliedEvent } from "@hyperidle/shared";
import { getFirstUserByKind } from "@hyperidle/users";
import {
	getBetById,
	getTaskById,
	listTasks,
	transitionBetStatus,
	transitionTaskState,
} from "@hyperidle/work";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "../test-fixtures.js";

/**
 * @lore AU19 Increment 2a: `registerLifecyclePropagation`/
 * `retryFailedPropagations` now take injected `work`/`conversation`/
 * `users`/`notifications` ports (Mechanism C — `policy` never imports
 * another Service). This test builds the exact same production wiring
 * `server-factory.ts` uses — no behavior change.
 */
const lifecyclePropagationDeps: LifecyclePropagationDeps = {
	work: { getTaskById, transitionTaskState, getBetById, transitionBetStatus, listTasks },
	conversation: { insertMessage, insertThread },
	users: { getFirstUserByKind },
	notifications: { insert: insertNotification },
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SYSTEM_PROPAGATION_ID = "system:propagation";

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: now });

	await db
		.insert(teamMembers)
		.values({ id: "team-1", teamId: "prod-1", capacity: 5, activeBets: 1, formedAt: now });

	await db.insert(bets).values({
		id: "bet-1",
		teamId: "prod-1",
		description: "Test bet",
		status: "active",
		createdAt: now,
	});

	await db.insert(users).values({
		id: "agent-1",
		name: "Builder Agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});

	// F6: Seed the system propagation agent so review-thread messages can insert
	await db.insert(users).values({
		id: SYSTEM_PROPAGATION_ID,
		name: "Propagation System",
		role: "system",
		status: "active",
		createdAt: now,
	});
}

async function seedTask(
	db: HyperIdleDb,
	id: string,
	state: string,
	betId = "bet-1",
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(tasks).values({
		id,
		betId,
		teamId: "prod-1",
		title: `Task ${id}`,
		state,
		createdAt: now,
		updatedAt: now,
	});
}

async function seedSession(
	db: HyperIdleDb,
	id: string,
	taskId: string,
	state: string,
	outcome?: string,
): Promise<void> {
	await db.insert(sessions).values({
		id,
		taskId,
		agentId: "agent-1",
		modelTier: "capable",
		startedAt: new Date().toISOString(),
		state,
		outcome: outcome ?? null,
	});
}

// ─── Session -> Task propagation ─────────────────────────────────────────────

describe("registerLifecyclePropagation — session -> task", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	test("transitions task to review when session ends with outcome=completed and task is in_progress with no other active sessions", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);

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

		// Assert: task is now in review — use vi.waitFor because the handler is async fire-and-forget
		await vi.waitFor(async () => {
			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.state).toBe("review");
		});
	});

	test("logs propagation_log entry with status=applied when transition succeeds", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);

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

		// Assert: propagation_log has an applied entry — use vi.waitFor because the handler is async fire-and-forget
		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(and(eq(propagationLog.sourceId, "session-1"), eq(propagationLog.status, "applied")));
			expect(logs).toHaveLength(1);
			expect(logs[0]!.sourceLevel).toBe("session");
			expect(logs[0]!.targetLevel).toBe("task");
			expect(logs[0]!.targetId).toBe("task-1");
			expect(logs[0]!.targetTransition).toBe("in_progress -> review");
		});
	});

	test("does NOT transition task when session ends with outcome=crashed (F2: crashed stays in_progress)", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);

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

		// Assert: task stays in_progress — use vi.waitFor because the handler is async fire-and-forget
		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(eq(propagationLog.status, "skipped"));
			expect(logs.length).toBeGreaterThanOrEqual(1);
		});
		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
		expect(task?.state).toBe("in_progress");
	});

	test("does NOT transition task when session ends with outcome=stopped (F2: stopped same as crashed)", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);

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

		// Assert: task stays in_progress — wait for handler to complete (skipped log entry appears), then check state
		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(eq(propagationLog.status, "skipped"));
			expect(logs.length).toBeGreaterThanOrEqual(1);
		});
		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
		expect(task?.state).toBe("in_progress");
	});

	test("does NOT transition task when other sessions are still active", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange: two sessions, session-1 active, session-2 also active
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		await seedSession(db, "session-2", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);

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

		// Assert: task still in_progress (session-2 is still running) — wait for handler to finish
		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(eq(propagationLog.status, "skipped"));
			expect(logs.length).toBeGreaterThanOrEqual(1);
		});
		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
		expect(task?.state).toBe("in_progress");
	});

	test("does NOT transition task when task is NOT in_progress (already moved)", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange: task is already in 'review'
		await seedTask(db, "task-1", "review");
		await seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);

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

		// Assert: task remains in review (not double-transitioned) — wait for handler to finish
		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(eq(propagationLog.status, "skipped"));
			expect(logs.length).toBeGreaterThanOrEqual(1);
		});
		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
		expect(task?.state).toBe("review");
	});

	test("handles concurrent race: InvalidTransitionError is caught and logged as skipped (F1, F4)", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange: task manually moved away from in_progress BEFORE propagation fires
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);

		// Manually transition task to 'done' to simulate race
		await db
			.update(tasks)
			.set({ state: "done", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, "task-1"));

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

		// Assert: no exception thrown; propagation_log has a skipped or failed entry — use vi.waitFor
		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(eq(propagationLog.sourceId, "session-1"));
			expect(logs.length).toBeGreaterThanOrEqual(1);
			const lastLog = logs[logs.length - 1];
			expect(["skipped", "failed"]).toContain(lastLog!.status);
		});
	});
});

// ─── Task -> Bet propagation ──────────────────────────────────────────────────

describe("registerLifecyclePropagation — task -> bet", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	test("transitions bet to review when all tasks on bet are terminal (done)", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange: two tasks both done
		await seedTask(db, "task-1", "done");
		await seedTask(db, "task-2", "in_progress");
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);

		// Manually move task-2 to done (bypass state machine for direct DB test)
		// then fire task_state_changed event
		await db
			.update(tasks)
			.set({ state: "done", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, "task-2"));

		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-2",
			taskId: "task-2",
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		});

		// Assert: bet is now completed (U1: review status removed, transitions to completed when all tasks done)
		await vi.waitFor(async () => {
			const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-1"));
			expect(bet?.status).toBe("completed");
		});
	});

	test("does NOT transition bet when some tasks are still open", async ({ db, eventBus }) => {
		await seedBase(db);
		// Arrange: one done, one still in_progress
		await seedTask(db, "task-1", "done");
		await seedTask(db, "task-2", "in_progress");
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);

		// Act: task-1 goes done (task-2 still open)
		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-1",
			taskId: "task-1",
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		});

		// Give handler time to run, then assert bet is still active
		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(eq(propagationLog.sourceId, "task-1"));
			expect(logs.length).toBeGreaterThanOrEqual(1);
		});
		// Assert: bet stays active (U1: in_progress merged into active)
		const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-1"));
		expect(bet?.status).toBe("active");
	});

	test("transitions bet to review when last task is killed (all remaining terminal)", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange: one done, one killed
		await seedTask(db, "task-1", "done");
		await seedTask(db, "task-2", "in_progress");
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);

		// Move task-2 to killed
		await db
			.update(tasks)
			.set({ state: "killed", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, "task-2"));

		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-2",
			taskId: "task-2",
			fromState: "in_progress",
			toState: "killed",
			timestamp: Date.now(),
		});

		// Assert: bet transitions to completed (U1: "review" removed)
		await vi.waitFor(async () => {
			const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-1"));
			expect(bet?.status).toBe("completed");
		});
	});

	test("creates a ship-confirmation review thread when bet transitions to review", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange
		await seedTask(db, "task-1", "done");
		await seedTask(db, "task-2", "in_progress");
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);

		// Move task-2 to done
		await db
			.update(tasks)
			.set({ state: "done", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, "task-2"));

		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-2",
			taskId: "task-2",
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		});

		// Assert: a review thread and ship-confirmation message exist — use vi.waitFor
		await vi.waitFor(async () => {
			const threadRows = await db
				.select()
				.from(threads)
				.where(and(eq(threads.hostKind, "bet"), eq(threads.hostId, "bet-1")));
			expect(threadRows.length).toBeGreaterThanOrEqual(1);

			const thread = threadRows[0];
			const allMessages = await db.select().from(messages).where(eq(messages.threadId, thread!.id));
			expect(allMessages.length).toBeGreaterThanOrEqual(1);
			const reviewMsg = allMessages.find((m) => m.type === "review");
			expect(reviewMsg).toBeDefined();
			if (!reviewMsg) return; // narrowing for TypeScript
			const payload = JSON.parse(reviewMsg.payload) as { kind: string };
			expect(payload.kind).toBe("ship_confirmation");
		});
	});

	test("handles concurrent race on bet: InvalidTransitionError caught and logged as skipped (F4)", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange: bet manually killed while propagation fires
		await seedTask(db, "task-1", "done");
		await seedTask(db, "task-2", "in_progress");
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);

		// Manually kill the bet (simulating concurrent human action)
		await db
			.update(bets)
			.set({ status: "killed", revisionLog: JSON.stringify([]) })
			.where(eq(bets.id, "bet-1"));

		// Also decrement activeBets on teamMembers (simulate full kill)
		// @lore U1: activeBets is on teamMembers (membership group), not teams (domain entity)
		await db.update(teamMembers).set({ activeBets: 0 }).where(eq(teamMembers.id, "team-1"));

		// Move task-2 to done and fire event (propagation will try review but bet is killed)
		await db
			.update(tasks)
			.set({ state: "done", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, "task-2"));

		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-2",
			taskId: "task-2",
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		});

		// Assert: no unhandled exception; propagation_log has a skipped entry for the bet — use vi.waitFor
		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(eq(propagationLog.targetId, "bet-1"));
			expect(logs.length).toBeGreaterThanOrEqual(1);
			const lastLog = logs[logs.length - 1];
			expect(["skipped", "failed"]).toContain(lastLog!.status);
		});
	});
});

// ─── Re-entrant cascade (F4) ──────────────────────────────────────────────────

describe("registerLifecyclePropagation — re-entrant cascade", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	test("session_ended cascades: session->task review, then task->bet completed when task goes done (F4)", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange: one task in_progress, one active session
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);

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

		// Assert: task is in review — use vi.waitFor because handler is async fire-and-forget
		await vi.waitFor(async () => {
			const [taskAfterSession] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(taskAfterSession?.state).toBe("review");
		});

		// Verify hop 1 logged
		await vi.waitFor(async () => {
			const hop1Logs = await db
				.select()
				.from(propagationLog)
				.where(
					and(
						eq(propagationLog.sourceLevel, "session"),
						eq(propagationLog.targetLevel, "task"),
						eq(propagationLog.status, "applied"),
					),
				);
			expect(hop1Logs.length).toBeGreaterThanOrEqual(1);
		});

		// Act step 2: task manually moved to done -> bet should go to review
		await db
			.update(tasks)
			.set({ state: "done", updatedAt: new Date().toISOString() })
			.where(eq(tasks.id, "task-1"));

		eventBus.emit({
			type: "task_state_changed",
			streamId: "task-1",
			taskId: "task-1",
			fromState: "in_progress",
			toState: "done",
			timestamp: Date.now(),
		});

		// Assert: bet is now completed (U1: "review" status removed, task->bet propagation transitions to "completed")
		await vi.waitFor(async () => {
			const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-1"));
			expect(bet?.status).toBe("completed");
		});

		// Verify hop 2 logged separately
		await vi.waitFor(async () => {
			const hop2Logs = await db
				.select()
				.from(propagationLog)
				.where(
					and(
						eq(propagationLog.sourceLevel, "task"),
						eq(propagationLog.targetLevel, "bet"),
						eq(propagationLog.status, "applied"),
					),
				);
			expect(hop2Logs.length).toBeGreaterThanOrEqual(1);
		});
	});
});

// ─── Bet -> Product propagation ───────────────────────────────────────────────

describe("registerLifecyclePropagation — bet -> team", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	test("logs propagation_applied entry when bet transitions to completed", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);
		const propagationEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => propagationEvents.push(e));

		// Act: emit bet_state_changed to shipped
		eventBus.emit({
			type: "bet_state_changed",
			streamId: "prod-1",
			betId: "bet-1",
			fromState: "active",
			toState: "completed",
			timestamp: Date.now(),
		});

		// Assert: propagation_log records the event — use vi.waitFor because handler is async fire-and-forget
		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(and(eq(propagationLog.sourceId, "bet-1"), eq(propagationLog.sourceLevel, "bet")));
			expect(logs.length).toBeGreaterThanOrEqual(1);
			expect(logs[0]!.targetLevel).toBe("team"); // @lore U1: renamed from "product" to "team"
			expect(logs[0]!.status).toBe("applied");
		});
	});

	test("emits propagation_applied event when bet transitions to completed", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);
		const propagationEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => propagationEvents.push(e));

		// Act
		eventBus.emit({
			type: "bet_state_changed",
			streamId: "prod-1",
			betId: "bet-1",
			fromState: "active",
			toState: "completed",
			timestamp: Date.now(),
		});

		// Assert: propagation_applied event emitted — use vi.waitFor because handler is async fire-and-forget
		await vi.waitFor(async () => {
			expect(propagationEvents).toHaveLength(1);
		});
		expect(propagationEvents[0]!.sourceId).toBe("bet-1");
		expect(propagationEvents[0]!.targetLevel).toBe("team"); // @lore U1: renamed from "product" to "team"
	});

	test("logs propagation entry when bet transitions to killed", async ({ db, eventBus }) => {
		await seedBase(db);
		// Arrange
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);

		// Act: emit bet_state_changed to killed
		eventBus.emit({
			type: "bet_state_changed",
			streamId: "prod-1",
			betId: "bet-1",
			fromState: "active",
			toState: "killed",
			timestamp: Date.now(),
		});

		// Assert: propagation_log records the event — use vi.waitFor because the handler is async fire-and-forget
		await vi.waitFor(async () => {
			const logs = await db
				.select()
				.from(propagationLog)
				.where(and(eq(propagationLog.sourceId, "bet-1"), eq(propagationLog.sourceLevel, "bet")));
			expect(logs.length).toBeGreaterThanOrEqual(1);
		});
	});
});

// ─── Retry mechanism ──────────────────────────────────────────────────────────

describe("registerLifecyclePropagation — retry mechanism", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	test("retryFailedPropagations: retries a pending_retry session->task row and transitions task to applied", async ({
		db,
	}) => {
		await seedBase(db);
		// Arrange: a real task in in_progress state and a real session that previously
		// ended completed but whose propagation was stored as pending_retry (simulating
		// a transient error on first attempt).
		const now = new Date().toISOString();
		await seedTask(db, "task-retry-1", "in_progress");
		// Seed the session row as ended+completed so the retry re-execution succeeds
		await db.insert(sessions).values({
			id: "session-retry-1",
			taskId: "task-retry-1",
			agentId: "agent-1",
			modelTier: "capable",
			startedAt: now,
			endedAt: now,
			state: "ended",
			outcome: "completed",
		});

		await db.insert(propagationLog).values({
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
		});

		const eventBus = new EventBus();

		// Act: call retryFailedPropagations
		await retryFailedPropagations(db, eventBus, lifecyclePropagationDeps);

		// Assert: the task was transitioned to review
		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-retry-1"));
		expect(task?.state).toBe("review");

		// Assert: a new applied log entry was written for the successful retry
		const appliedLogs = await db
			.select()
			.from(propagationLog)
			.where(
				and(eq(propagationLog.targetId, "task-retry-1"), eq(propagationLog.status, "applied")),
			);
		expect(appliedLogs.length).toBeGreaterThanOrEqual(1);
	});

	// ─── AF7 §7: in-place retry resolution (no double-log, CAS-guarded fail) ──────
	//
	// The OLD behavior appended a NEW `applied` row on a successful retry while
	// leaving the ORIGINAL `pending_retry` row stuck — so the heartbeat could never
	// drain (a residual `pending_retry` remained forever) and the propagation was
	// double-logged. The §7 rewrite resolves the ORIGINAL row IN PLACE. These
	// assertions use EXACT counts (not `>=`) so they FAIL against the old double-log
	// behavior: old → 2 rows for the target (1 stuck pending_retry + 1 new applied);
	// new → exactly 1 row, resolved in place, zero residual pending_retry.

	test("§7: a successful retry resolves the ORIGINAL row in place — zero residual pending_retry, exactly one row", async ({
		db,
	}) => {
		await seedBase(db);
		const now = new Date().toISOString();
		await seedTask(db, "task-inplace-1", "in_progress");
		await db.insert(sessions).values({
			id: "session-inplace-1",
			taskId: "task-inplace-1",
			agentId: "agent-1",
			modelTier: "capable",
			startedAt: now,
			endedAt: now,
			state: "ended",
			outcome: "completed",
		});
		await db.insert(propagationLog).values({
			id: "log-inplace-1",
			sourceLevel: "session",
			sourceId: "session-inplace-1",
			sourceEvent: "session_ended",
			targetLevel: "task",
			targetId: "task-inplace-1",
			targetTransition: null,
			status: "pending_retry",
			failureReason: "Transient DB error",
			attempts: 1,
			createdAt: now,
			appliedAt: null,
		});

		const eventBus = new EventBus();
		await retryFailedPropagations(db, eventBus, lifecyclePropagationDeps);

		// Exactly ONE propagation_log row for this target — the original, resolved in
		// place. The OLD behavior left 2 (stuck pending_retry + new applied).
		const allRows = await db
			.select()
			.from(propagationLog)
			.where(eq(propagationLog.targetId, "task-inplace-1"));
		expect(allRows).toHaveLength(1);
		// It is the SAME row (resolved in place), now applied with an appliedAt stamp.
		expect(allRows[0]!.id).toBe("log-inplace-1");
		expect(allRows[0]!.status).toBe("applied");
		expect(allRows[0]!.appliedAt).not.toBeNull();

		// ZERO residual pending_retry rows remain — the heartbeat fully drained.
		const residualPending = await db
			.select()
			.from(propagationLog)
			.where(eq(propagationLog.status, "pending_retry"));
		expect(residualPending).toHaveLength(0);

		// The task did transition (sanity).
		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-inplace-1"));
		expect(task?.state).toBe("review");
	});

	test("§7: exactly ONE propagation_applied event for a retry that retried once then succeeded (no double-emit)", async ({
		db,
	}) => {
		await seedBase(db);
		const now = new Date().toISOString();
		await seedTask(db, "task-emit-1", "in_progress");
		await db.insert(sessions).values({
			id: "session-emit-1",
			taskId: "task-emit-1",
			agentId: "agent-1",
			modelTier: "capable",
			startedAt: now,
			endedAt: now,
			state: "ended",
			outcome: "completed",
		});
		await db.insert(propagationLog).values({
			id: "log-emit-1",
			sourceLevel: "session",
			sourceId: "session-emit-1",
			sourceEvent: "session_ended",
			targetLevel: "task",
			targetId: "task-emit-1",
			targetTransition: null,
			status: "pending_retry",
			failureReason: "Transient DB error",
			attempts: 1,
			createdAt: now,
			appliedAt: null,
		});

		const eventBus = new EventBus();
		const appliedEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => appliedEvents.push(e));

		await retryFailedPropagations(db, eventBus, lifecyclePropagationDeps);

		// Exactly one propagation_applied for the single retry that landed — no
		// double-emit from a parallel-row re-log.
		expect(appliedEvents).toHaveLength(1);
		expect(appliedEvents[0]!.targetId).toBe("task-emit-1");
		expect(appliedEvents[0]!.sourceId).toBe("session-emit-1");
	});

	test("§7 CAS-guard: a retry that SUCCEEDS on its last allowed attempt is NOT marked failed", async ({
		db,
	}) => {
		await seedBase(db);
		const now = new Date().toISOString();
		// attempts = MAX_RETRY_ATTEMPTS - 1 (2): the heartbeat bumps to 3 and retries.
		// The retry SUCCEEDS, so the row must end `applied`, NEVER flipped to `failed`
		// by the terminal-fail branch (the CAS-guarded fail only fires for rows still
		// `pending_retry` at attempts >= MAX — a succeeded row no longer qualifies).
		await seedTask(db, "task-cas-1", "in_progress");
		await db.insert(sessions).values({
			id: "session-cas-1",
			taskId: "task-cas-1",
			agentId: "agent-1",
			modelTier: "capable",
			startedAt: now,
			endedAt: now,
			state: "ended",
			outcome: "completed",
		});
		await db.insert(propagationLog).values({
			id: "log-cas-1",
			sourceLevel: "session",
			sourceId: "session-cas-1",
			sourceEvent: "session_ended",
			targetLevel: "task",
			targetId: "task-cas-1",
			targetTransition: null,
			status: "pending_retry",
			failureReason: "Transient DB error",
			attempts: 2,
			createdAt: now,
			appliedAt: null,
		});

		const eventBus = new EventBus();
		await retryFailedPropagations(db, eventBus, lifecyclePropagationDeps);

		const [row] = await db.select().from(propagationLog).where(eq(propagationLog.id, "log-cas-1"));
		expect(row?.status).toBe("applied");
		expect(row?.status).not.toBe("failed");

		// No exhaustion notification — the row succeeded, it was not exhausted.
		const notifs = (await listAll(db)).filter((r) => r.eventType === "propagation_exhausted");
		expect(notifs).toHaveLength(0);
	});

	test("retryFailedPropagations: row with attempts=3 (at max) changes status to failed and creates notification", async ({
		db,
	}) => {
		await seedBase(db);
		// Arrange: insert a pending_retry row that is already at MAX_RETRY_ATTEMPTS (3)
		const now = new Date().toISOString();
		await db.insert(propagationLog).values({
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
		});

		const eventBus = new EventBus();

		// Act: call retryFailedPropagations
		await retryFailedPropagations(db, eventBus, lifecyclePropagationDeps);

		// Assert: the row is now marked failed
		const failedLogs = await db
			.select()
			.from(propagationLog)
			.where(eq(propagationLog.id, "log-exhausted-1"));
		expect(failedLogs).toHaveLength(1);
		expect(failedLogs[0]!.status).toBe("failed");
		expect(failedLogs[0]!.attempts).toBe(3);

		// Assert: a notification queue entry was created
		const notifs = (await listAll(db)).filter((r) => r.eventType === "propagation_exhausted");
		expect(notifs).toHaveLength(1);
		expect(notifs[0]!.severity).toBe("warning");
	});
});

// ─── Propagation log coverage ────────────────────────────────────────────────

describe("registerLifecyclePropagation — propagation log", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	test("creates a propagation_log entry for every propagation attempt", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);

		const initialLogs = await db.select().from(propagationLog);
		const initialLogCount = initialLogs.length;

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

		// Assert: at least one new log entry — use vi.waitFor because the handler is async fire-and-forget
		await vi.waitFor(async () => {
			const newLogs = await db.select().from(propagationLog);
			expect(newLogs.length).toBeGreaterThan(initialLogCount);
		});
	});

	test("emits propagation_applied event when session->task propagation succeeds", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);

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

		// Assert: propagation_applied event was emitted — use vi.waitFor because the handler is async fire-and-forget
		await vi.waitFor(() => {
			expect(appliedEvents).toHaveLength(1);
			expect(appliedEvents[0]!.sourceLevel).toBe("session");
			expect(appliedEvents[0]!.targetLevel).toBe("task");
		});
	});

	test("returns unsubscribe function that stops all event handling", async ({ db, eventBus }) => {
		await seedBase(db);
		// Arrange
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		const unsub = registerLifecyclePropagation(db, eventBus, lifecyclePropagationDeps);

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
		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
		expect(task?.state).toBe("in_progress");

		// No log entries created
		const logs = await db.select().from(propagationLog);
		expect(logs).toHaveLength(0);
	});
});
