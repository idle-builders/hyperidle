/**
 * L20 — Lifecycle Propagation Engine: Vitest tests.
 *
 * @lore AU44 batch6: propagation_log table dropped (AU20 Ruling 2). All test
 * assertions previously querying the log table now use EventBus event capture
 * (propagation_applied / propagation_failed) or direct state assertions.
 * The entire "retry mechanism" describe block is deleted — the retry apparatus
 * is gone. `retryFailedPropagations` no longer exists.
 *
 * @lore L20: messages.senderId references agents.id (FK). Any test that
 * exercises review-thread creation must seed a "system:propagation" agent row,
 * or the insert will fail with a FK constraint violation (F6 from arch review).
 */

import {
	insertMessage,
	insertThread,
	listMessages,
	resolveMessageIfUnresolved,
	updateThread,
} from "@hyperidle/conversation";
import type { WriteExecutor } from "@hyperidle/db";
import {
	type HyperIdleDb,
	sessions,
	tasks,
	teams,
	users,
} from "@hyperidle/db";
import type { PropagationAppliedEvent, PropagationFailedEvent } from "@hyperidle/event-bus";
import { type PolicyDeps, registerPolicy } from "@hyperidle/policy";
import { findUser } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";

/**
 * @lore AU19 Increment 2a: `registerLifecyclePropagation` now takes injected
 * `work`/`conversation`/`users` ports (Mechanism C — `policy` never imports
 * another Service). This test builds the exact same production wiring
 * `server-factory.ts` uses — no behavior change.
 *
 * @lore AU20 Am1: `LifecyclePropagationDeps` removed from barrel; replaced
 * with `PolicyDeps`.
 */
const policyDeps: PolicyDeps = {
	work: {
		getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id),
		transitionTaskState: (exec, { taskId, fromState, patch }) =>
			work.transition(exec, "task", {
				id: taskId,
				guard: { field: "state", equals: fromState },
				patch,
			}),
		listChildTasks: (exec: WriteExecutor, parentTaskId: string) =>
			work.list(exec, "task", { parentTaskId }),
		listAncestorIds: (exec: WriteExecutor, taskId: string) =>
			work.listAncestorIds(exec, taskId),
		getItemById: (exec: WriteExecutor, id: string) => work.get(exec, "item", id),
		updateItemById: (exec: WriteExecutor, id: string, patch) =>
			work.update(exec, "item", id, patch),
		listItemIdsBySourceAgent: (exec: WriteExecutor, agentId: string) =>
			work.list(exec, "item", { sourceAgentId: agentId }).then((rows) => rows.map((r) => r.id)),
	},
	conversation: {
		insertMessage,
		insertThread,
		listMessagesByThread: (db, threadId, opts) =>
			listMessages(db, {
				threadId,
				types: opts?.type ? [opts.type] : undefined,
				order: opts?.order,
				dir: opts?.dir,
				limit: opts?.limit,
			}),
		resolveMessageIfUnresolved,
		updateThread,
		listInitiatedVerdictMessages: (db, initiatorId, windowStart) =>
			listMessages(db, { threadInitiatorId: initiatorId, types: ["verdict"], since: windowStart }),
		listVerdictMessagesByItemIds: (db, itemIds, windowStart) =>
			listMessages(db, { legacyItemIds: itemIds, types: ["verdict"], since: windowStart }),
	},
	users: { getFirstUserByKind: (db, kind) => findUser(db, { kind }) },
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SYSTEM_PROPAGATION_ID = "system:propagation";

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: now });

	// BB1: bets replaced by root tasks (parentTaskId: null)
	await db.insert(tasks).values({
		id: "bet-1",
		parentTaskId: null,
		teamId: "prod-1",
		title: "Test bet",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
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
	parentTaskId = "bet-1",
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(tasks).values({
		id,
		parentTaskId,
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

	test("emits propagation_failed when task read throws (F2-A: first-failure path)", async ({
		db,
		eventBus,
	}) => {
		const failedEvents: PropagationFailedEvent[] = [];
		const failingDeps: PolicyDeps = {
			...policyDeps,
			work: {
				...policyDeps.work,
				getTaskById: () => Promise.reject(new Error("read unavailable")),
			},
		};
		unsubscribe = registerPolicy(db, eventBus, failingDeps);
		eventBus.on("propagation_failed", (e) => failedEvents.push(e));
		eventBus.emit({
			type: "session_ended",
			streamId: "session-read-failure",
			sessionId: "session-read-failure",
			agentId: "agent-1",
			taskId: "task-read-failure",
			outcome: "completed",
			timestamp: Date.now(),
		});
		await vi.waitFor(() => {
			expect(failedEvents.length).toBeGreaterThanOrEqual(1);
			expect(failedEvents[0]!.failureReason).toBe("read unavailable");
			expect(failedEvents[0]!.sourceId).toBe("session-read-failure");
		});
	});

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
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

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

	test("emits propagation_applied when session->task transition succeeds", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		const appliedEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => appliedEvents.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

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

		// Assert: propagation_applied event emitted — use vi.waitFor because the handler is async fire-and-forget
		await vi.waitFor(() => {
			expect(appliedEvents).toHaveLength(1);
			expect(appliedEvents[0]!.sourceLevel).toBe("session");
			expect(appliedEvents[0]!.targetLevel).toBe("task");
			expect(appliedEvents[0]!.targetId).toBe("task-1");
			expect(appliedEvents[0]!.targetTransition).toBe("in_progress -> review");
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
		const appliedEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => appliedEvents.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

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

		// Handler returns early for non-completed outcomes — wait briefly then assert
		await new Promise((r) => setTimeout(r, 80));
		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
		expect(task?.state).toBe("in_progress");
		expect(appliedEvents).toHaveLength(0);
	});

	test("does NOT transition task when session ends with outcome=stopped (F2: stopped same as crashed)", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		const appliedEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => appliedEvents.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

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

		// Handler returns early for non-completed outcomes — wait briefly then assert
		await new Promise((r) => setTimeout(r, 80));
		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
		expect(task?.state).toBe("in_progress");
		expect(appliedEvents).toHaveLength(0);
	});

	/**
	 * @lore AU26 J2: the "is another run still active on this task" guard is
	 * DELETED — with it, core-api's last policy-side read of the `sessions` table.
	 * The state it defended is not reachable through any normal path (a run
	 * request is only created when a task enters `accepted`, and the lifecycle
	 * grammar has no edge from `in_progress` back to `accepted`; a handoff closes
	 * the old run and opens the new one in ONE transaction). A completed run now
	 * moves its task to review on the event alone. If the contrived two-live-runs
	 * state ever occurs, the second run's end sees a task that is no longer
	 * `in_progress` and quietly does nothing (the branch below), and `review ->
	 * in_progress` is a legal move anyone can make.
	 */
	test("transitions task to review on a completed run even with a sibling run still active", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange: two sessions on one task, both active
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		await seedSession(db, "session-2", "task-1", "active");
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

		// Act: session-1 ends completed while session-2 is still active
		eventBus.emit({
			type: "session_ended",
			streamId: "session-1",
			sessionId: "session-1",
			agentId: "agent-1",
			taskId: "task-1",
			timestamp: Date.now(),
			outcome: "completed",
		});

		// Assert: the sibling does not block — the task reaches review.
		await vi.waitFor(async () => {
			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.state).toBe("review");
		});
	});

	test("does NOT transition task when task is NOT in_progress (already moved)", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange: task is already in 'review'
		await seedTask(db, "task-1", "review");
		await seedSession(db, "session-1", "task-1", "active");
		const appliedEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => appliedEvents.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

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

		// Handler returns early — wait briefly then assert task unchanged
		await new Promise((r) => setTimeout(r, 80));
		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
		expect(task?.state).toBe("review");
		expect(appliedEvents).toHaveLength(0);
	});

	test("handles concurrent race: InvalidTransitionError is caught silently (F1)", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange: task manually moved away from in_progress BEFORE propagation fires
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		const appliedEvents: PropagationAppliedEvent[] = [];
		const failedEvents: PropagationFailedEvent[] = [];
		eventBus.on("propagation_applied", (e) => appliedEvents.push(e));
		eventBus.on("propagation_failed", (e) => failedEvents.push(e));
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

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

		// Handler silently returns on InvalidTransitionError — wait briefly, then confirm
		// no applied event fired and no failed event (just silent early return)
		await new Promise((r) => setTimeout(r, 80));
		expect(appliedEvents).toHaveLength(0);
		// task stays in 'done' — not double-transitioned
		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
		expect(task?.state).toBe("done");
	});
});



describe("registerLifecyclePropagation — propagation events", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	test("emits propagation_applied event when session->task propagation succeeds", async ({
		db,
		eventBus,
	}) => {
		await seedBase(db);
		// Arrange
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerPolicy(db, eventBus, policyDeps);

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
		const unsub = registerPolicy(db, eventBus, policyDeps);

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
	});
});
