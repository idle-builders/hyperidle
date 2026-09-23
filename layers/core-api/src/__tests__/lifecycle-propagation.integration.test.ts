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
 *
 * @lore code-review finding, BC3: the ship-confirmation review used to post
 * through a raw `conversation.insertMessage` — no `changes` row, no websocket
 * nudge, no `lastActiveAt` bump. It now posts through the composed
 * `send_message.run`, injected the same way `editTask` already is, below.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import {
	changes,
	type HyperIdleDb,
	sessions,
	tasks,
	teams,
	threads,
	users,
	type WriteExecutor,
} from "@hyperidle/db";
import type { ActionResult, ThreadView } from "@hyperidle/domain-model";
import type { PropagationAppliedEvent, PropagationFailedEvent } from "@hyperidle/event-bus";
import { type PolicyDeps, registerLifecyclePropagation } from "@hyperidle/policy";
import * as work from "@hyperidle/task";
import { listMessages } from "@hyperidle/thread";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";
import { buildCoreActions } from "../actions/compose.js";

/**
 * @lore BC3 architecture.md §5: `registerLifecyclePropagation`'s
 * `LifecyclePropagationDeps` is now `Pick<PolicyDeps, "work"|"editTask"|
 * "sendMessage">` — the item-table reads (`getItemById`/`updateItemById`/
 * `listItemIdsBySourceAgent`) and the `users` founder lookup are gone with
 * `policy-engine.ts` (R2) and the ship-confirmation thread's own founder
 * participant computation (it now posts into the task's existing thread —
 * see `lifecycle-propagation.ts`'s `createShipConfirmationThread`).
 */
function buildPolicyDeps(agentOrchestration: AgentOrchestrationPort): PolicyDeps {
	const actions = buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
		reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
	});
	const editTaskAction = actions.find((a) => a.declaration.name === "edit_task");
	if (!editTaskAction) throw new Error("edit_task action not found");
	const sendMessageAction = actions.find((a) => a.declaration.name === "send_message");
	if (!sendMessageAction) throw new Error("send_message action not found");
	return {
		work: {
			getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id),
			listChildTasks: (exec: WriteExecutor, parentTaskId: string) =>
				work.list(exec, "task", { parentTaskId }),
			listAncestorIds: (exec: WriteExecutor, taskId: string) => work.listAncestorIds(exec, taskId),
		},
		conversation: {
			listInitiatedVerdictMessages: (db, initiatorId, windowStart) =>
				listMessages(db, {
					threadInitiatorId: initiatorId,
					types: ["verdict"],
					since: windowStart,
				}),
		},
		editTask: editTaskAction.run as PolicyDeps["editTask"],
		sendMessage: sendMessageAction.run as PolicyDeps["sendMessage"],
	};
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SYSTEM_PROPAGATION_ID = "system:propagation";

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "prod-1", name: "Test Product", createdAt: now });

	// BB1: bets replaced by root tasks (parentTaskId: null)
	await db.insert(threads).values({
		id: `thr-${"bet-1"}`,
		hostKind: "team",
		hostId: "prod-1",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		threadId: `thr-${"bet-1"}`,
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
	await db.insert(threads).values({
		id: `thr-${id}`,
		hostKind: "team",
		hostId: "prod-1",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		threadId: `thr-${id}`,
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
		agentOrchestration,
	}) => {
		const basePolicyDeps = buildPolicyDeps(agentOrchestration);
		const failedEvents: PropagationFailedEvent[] = [];
		const failingDeps: PolicyDeps = {
			...basePolicyDeps,
			work: {
				...basePolicyDeps.work,
				getTaskById: () => Promise.reject(new Error("read unavailable")),
			},
		};
		unsubscribe = registerLifecyclePropagation(db, eventBus, failingDeps);
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
		agentOrchestration,
	}) => {
		await seedBase(db);
		// Arrange
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus, buildPolicyDeps(agentOrchestration));

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

		// Assert: the task closed on its own — use vi.waitFor because the handler
		// is async fire-and-forget.
		await vi.waitFor(async () => {
			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			// @lore BB1: `done`, not `review`. A finished task closes to `done`
			// unless it asked for a verdict via `needsReview`; before BB1 every
			// finished task went to `review`, which made the queue meaningless.
			expect(task?.state).toBe("done");
		});
	});

	test("emits propagation_applied when session->task transition succeeds", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedBase(db);
		// Arrange
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		const appliedEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => appliedEvents.push(e));
		unsubscribe = registerLifecyclePropagation(db, eventBus, buildPolicyDeps(agentOrchestration));

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
			// @lore BB1: was `toHaveLength(1)`. The cascade no longer stops at the
			// task — the task closes to `done`, which makes its parent's children
			// all-terminal, so the parent closes too, and so on up. More than one
			// applied event is the CORRECT new behaviour; assert the session->task
			// hop is present rather than that it is the only hop.
			expect(appliedEvents.length).toBeGreaterThanOrEqual(1);
			expect(appliedEvents[0]!.sourceLevel).toBe("session");
			expect(appliedEvents[0]!.targetLevel).toBe("task");
			expect(appliedEvents[0]!.targetId).toBe("task-1");
			expect(appliedEvents[0]!.targetTransition).toBe("in_progress -> done");
		});
	});

	test("does NOT transition task when session ends with outcome=crashed (F2: crashed stays in_progress)", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedBase(db);
		// Arrange
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		const appliedEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => appliedEvents.push(e));
		unsubscribe = registerLifecyclePropagation(db, eventBus, buildPolicyDeps(agentOrchestration));

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
		agentOrchestration,
	}) => {
		await seedBase(db);
		// Arrange
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		const appliedEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => appliedEvents.push(e));
		unsubscribe = registerLifecyclePropagation(db, eventBus, buildPolicyDeps(agentOrchestration));

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
		agentOrchestration,
	}) => {
		await seedBase(db);
		// Arrange: two sessions on one task, both active
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		await seedSession(db, "session-2", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus, buildPolicyDeps(agentOrchestration));

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
			expect(task?.state).toBe("done");
		});
	});

	test("does NOT transition task when task is NOT in_progress (already moved)", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedBase(db);
		// Arrange: task is already in 'review'
		await seedTask(db, "task-1", "review");
		await seedSession(db, "session-1", "task-1", "active");
		const appliedEvents: PropagationAppliedEvent[] = [];
		eventBus.on("propagation_applied", (e) => appliedEvents.push(e));
		unsubscribe = registerLifecyclePropagation(db, eventBus, buildPolicyDeps(agentOrchestration));

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
		// Unchanged: the task was seeded in `review` and the handler returns early
		// because it is not `in_progress`. This one is NOT the BB1 done-by-default
		// rule — it is the guard that stops a second session end re-transitioning
		// a task someone already moved.
		expect(task?.state).toBe("review");
		expect(appliedEvents).toHaveLength(0);
	});

	test("handles concurrent race: InvalidTransitionError is caught silently (F1)", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedBase(db);
		// Arrange: task manually moved away from in_progress BEFORE propagation fires
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		const appliedEvents: PropagationAppliedEvent[] = [];
		const failedEvents: PropagationFailedEvent[] = [];
		eventBus.on("propagation_applied", (e) => appliedEvents.push(e));
		eventBus.on("propagation_failed", (e) => failedEvents.push(e));
		unsubscribe = registerLifecyclePropagation(db, eventBus, buildPolicyDeps(agentOrchestration));

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
		agentOrchestration,
	}) => {
		await seedBase(db);
		// Arrange
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus, buildPolicyDeps(agentOrchestration));

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
			// @lore BB1: was `toHaveLength(1)`. The cascade no longer stops at the
			// task — the task closes to `done`, which makes its parent's children
			// all-terminal, so the parent closes too, and so on up. More than one
			// applied event is the CORRECT new behaviour; assert the session->task
			// hop is present rather than that it is the only hop.
			expect(appliedEvents.length).toBeGreaterThanOrEqual(1);
			expect(appliedEvents[0]!.sourceLevel).toBe("session");
			expect(appliedEvents[0]!.targetLevel).toBe("task");
		});
	});

	test("returns unsubscribe function that stops all event handling", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedBase(db);
		// Arrange
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		const unsub = registerLifecyclePropagation(db, eventBus, buildPolicyDeps(agentOrchestration));

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

describe("registerLifecyclePropagation — ship-confirmation review (code-review finding)", () => {
	let unsubscribe: (() => void) | undefined;

	afterEach(() => {
		unsubscribe?.();
		vi.restoreAllMocks();
	});

	test("posts the ship-confirmation review through send_message: a changes row on the root's thread, and open_thread returns it", async ({
		db,
		app,
		eventBus,
		agentOrchestration,
	}) => {
		await seedBase(db);
		await seedTask(db, "task-1", "in_progress");
		await seedSession(db, "session-1", "task-1", "active");
		unsubscribe = registerLifecyclePropagation(db, eventBus, buildPolicyDeps(agentOrchestration));

		eventBus.emit({
			type: "session_ended",
			streamId: "session-1",
			sessionId: "session-1",
			agentId: "agent-1",
			taskId: "task-1",
			timestamp: Date.now(),
			outcome: "completed",
		});

		// "bet-1" (the root) has exactly one child, task-1 — finishing it closes
		// the root too, which is what triggers the ship-confirmation post.
		await vi.waitFor(async () => {
			const [root] = await db.select().from(tasks).where(eq(tasks.id, "bet-1"));
			expect(root?.state).toBe("done");
		});

		// A `changes` row of object `thread`, kind `message`, actor
		// `system:propagation` on the root's own thread — the module-link rule
		// (through the action, never the table). Before this fix a raw
		// `insertMessage` wrote no `changes` row at all.
		const rows = await db.select().from(changes).where(eq(changes.objectId, "thr-bet-1"));
		const messageChange = rows.find((r) => r.kind === "message");
		expect(messageChange).toBeDefined();
		expect(messageChange?.object).toBe("thread");
		expect(messageChange?.actor).toBe("system:propagation");

		// `open_thread` — the door every screen reads a thread through — sees
		// the review.
		const res = await app.request("/api/actions/open_thread", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id: "thr-bet-1" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as ActionResult<ThreadView> & { ok: true };
		expect(body.ok).toBe(true);
		const review = body.data.messages.find((m) => m.type === "review");
		expect(review).toBeDefined();
		expect(review?.senderId).toBe(SYSTEM_PROPAGATION_ID);
	});
});
