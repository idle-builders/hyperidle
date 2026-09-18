/**
 * AU21 §9 Increment 12 (Decision H3), Wave D — RED.
 *
 * `registerWorkSessionStartedReactions` (layers/core-api/src/services/
 * work-session-started-reactions.ts) does NOT YET EXIST — every test in this
 * file is RED via module resolution failure until the GREEN phase creates it.
 * Same shape as `work-session-end-reactions.ts` /
 * `routine-run-session-end-reactions.ts`: a per-eventBus-instance idempotency
 * guard (`registeredBuses` WeakSet) and an explicit `register*(db, eventBus)`
 * wiring convention — NOT auto-wired onto `test-fixtures.ts`'s `eventBus`
 * fixture.
 *
 * Per architecture.md §6 Decision H3 / §9 Increment 12: this subscriber
 * replaces `run-orchestration/provisioner.ts`'s direct
 * `ports.work.transitionTask(db, eventBus, taskId, "in_progress")` call
 * (`provisioner.ts:1077`, fired at launch when the task is not already
 * `in_progress`) with a reaction to the EXISTING `session_started` event
 * (emitted at `provisioner.ts:1191` after the sandbox/session row/context are
 * committed, and also emitted by `sessions-routes.ts`'s legacy bare-insert
 * path) — `session_started` already carries `taskId` (`SessionStartedEvent`,
 * `events.ts:120-131`), so no payload growth is needed for this half of Wave D
 * (unlike the `session_ended` token-writeback half).
 *
 * Target behavior:
 *   - `session_started` with a `taskId` whose task is currently `accepted` (or
 *     `blocked`, the other valid `canTransitionTaskState` source per
 *     `task-transition.ts`) transitions it to `in_progress` via
 *     `@hyperidle/work`'s real `transitionTask` state machine (the SAME
 *     function `run-orchestration-composition.ts`'s deleted `workAccessor`
 *     used to call, now invoked core-side).
 *   - `session_started` for a task ALREADY `in_progress` (a handoff
 *     re-dispatch launching a second session for a task already mid-flight,
 *     mirroring `provisioner.ts:1076`'s `state !== "in_progress"` launch
 *     guard, OR a duplicate/redelivered event) is a safe no-op — the reaction
 *     must swallow `TaskInvalidTransitionError` (accepted/blocked are the only
 *     valid `-> in_progress` sources; `in_progress -> in_progress` is not a
 *     member of `TASK_STATE_TRANSITIONS` and throws), never propagate it into
 *     the EventBus's handler-isolation logging path as an unexpected failure.
 *   - `session_started` with `taskId: null` (a task-free session — an
 *     `assistant_turn`/explicit non-task session request) is a
 *     no-op.
 *
 * This is the literal replacement for `run-orchestration`'s deleted direct
 * `ports.work.transitionTask` write — see the companion structural RED test
 * in `../../__tests__/work-composition-anti-regrowth.test.ts` proving the
 * `run-orchestration -> work` composition-bundle edge that carried this write
 * (and the `getTaskById`/`getBetById`/`updateTaskById`/`updateBetById` reads
 * that only ever supported it and the token-writeback below) is gone once
 * Wave D's GREEN deletes `workAccessor` wholesale.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import {
	agentSessionRequests,
	type HyperIdleDb,
	sessions,
	taskDispatchAttempts,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { TaskState } from "@hyperidle/domain-model";
import type { SessionStartedEvent } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";
import { buildCoreActions } from "../../actions/compose.js";
import { registerWorkSessionStartedReactions } from "../work-session-started-reactions.js";

/** §6 row 1: the reaction takes `edit_task`'s bound `run` now, not `agentOrchestration` directly. */
function editTaskFrom(
	agentOrchestration: AgentOrchestrationPort,
): Parameters<typeof registerWorkSessionStartedReactions>[2] {
	const editTaskAction = buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
		reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
	}).find((a) => a.declaration.name === "edit_task");
	if (!editTaskAction) throw new Error("edit_task action not found");
	return editTaskAction.run as Parameters<typeof registerWorkSessionStartedReactions>[2];
}

const NOW = new Date().toISOString();

async function seedTaskAndAgent(
	db: HyperIdleDb,
	id: string,
	options: { readonly taskState: TaskState },
): Promise<{ readonly taskId: string; readonly agentId: string; readonly rootTaskId: string }> {
	const teamId = `${id}-team`;
	const rootTaskId = `${id}-bet`;
	const taskId = `${id}-task`;
	const agentId = `${id}-agent`;
	await db.insert(teams).values({ id: teamId, name: "Team", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(threads).values({
		id: `thr-${rootTaskId}`,
		hostKind: "team",
		hostId: teamId,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${rootTaskId}`,
		id: rootTaskId,
		parentTaskId: null,
		teamId: teamId,
		title: "work-session-started-reactions bet",
		description: "work-session-started-reactions bet",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(threads).values({
		id: `thr-${taskId}`,
		hostKind: "team",
		hostId: teamId,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${taskId}`,
		id: taskId,
		parentTaskId: rootTaskId,
		teamId,
		ownerAgentId: agentId,
		title: "work-session-started-reactions task",
		state: options.taskState,
		createdAt: NOW,
		updatedAt: NOW,
	});
	return { taskId, agentId, rootTaskId };
}

async function seedSession(
	db: HyperIdleDb,
	id: string,
	options: { readonly agentId: string; readonly taskId?: string },
): Promise<void> {
	await db.insert(sessions).values({
		id,
		agentId: options.agentId,
		taskId: options.taskId,
		modelTier: "fast",
		startedAt: NOW,
		state: "active",
	});
}

function sessionStarted(input: {
	readonly sessionId: string;
	readonly agentId: string;
	readonly taskId: string | null;
	readonly requestId?: string;
}): SessionStartedEvent {
	return {
		type: "session_started",
		streamId: input.sessionId,
		sessionId: input.sessionId,
		agentId: input.agentId,
		taskId: input.taskId,
		timestamp: Date.now(),
		...(input.requestId ? { requestId: input.requestId } : {}),
	};
}

async function readTaskState(db: HyperIdleDb, taskId: string): Promise<string | undefined> {
	const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
	return row?.state;
}

/**
 * §1's repair, seeded honestly: a `requested` dispatch attempt with NO
 * `requestId`/`sessionId` yet — the real shape an accept leaves behind
 * before any session exists (`insertAttempt` sets neither).
 */
async function seedRequestedAttempt(
	db: HyperIdleDb,
	options: { readonly attemptId: string; readonly taskId: string; readonly agentId: string },
): Promise<void> {
	await db.insert(taskDispatchAttempts).values({
		id: options.attemptId,
		taskId: options.taskId,
		occasion: "accepted",
		agentId: options.agentId,
		ordinal: 1,
		status: "requested",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

/**
 * `taskDispatchAttempts.requestId` is a real FK into `agentSessionRequests`
 * — seed a real row so the repair's UPDATE matches a genuine FK target,
 * mirroring `work-session-end-reactions.integration.test.ts`'s own fixture.
 */
async function seedSessionRequest(
	db: HyperIdleDb,
	id: string,
	options: { readonly taskId: string; readonly agentId: string },
): Promise<void> {
	await db.insert(agentSessionRequests).values({
		id,
		sourceKind: "task",
		sourceId: options.taskId,
		streamId: `task:${options.taskId}`,
		taskId: options.taskId,
		agentId: options.agentId,
		promptMode: "task",
		sourceCorrelationJson: "{}",
		idempotencyKey: id,
		status: "pending",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

async function readAttempt(
	db: HyperIdleDb,
	attemptId: string,
): Promise<{ readonly status: string; readonly sessionId: string | null } | undefined> {
	const [row] = await db
		.select()
		.from(taskDispatchAttempts)
		.where(eq(taskDispatchAttempts.id, attemptId));
	return row ? { status: row.status, sessionId: row.sessionId } : undefined;
}

describe("registerWorkSessionStartedReactions", () => {
	test("session_started transitions an accepted task to in_progress (NEW event path, zero orchestration->work write)", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wssr-accepted", {
			taskState: "accepted",
		});
		await seedSession(db, "wssr-accepted-session", { agentId, taskId });
		registerWorkSessionStartedReactions(db, eventBus, editTaskFrom(agentOrchestration));

		eventBus.emit(sessionStarted({ sessionId: "wssr-accepted-session", agentId, taskId }));

		await vi.waitFor(async () => {
			expect(await readTaskState(db, taskId)).toBe("in_progress");
		});
	});

	test("session_started transitions a blocked task to in_progress (the other valid canTransitionTaskState source)", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wssr-blocked", {
			taskState: "blocked",
		});
		await seedSession(db, "wssr-blocked-session", { agentId, taskId });
		registerWorkSessionStartedReactions(db, eventBus, editTaskFrom(agentOrchestration));

		eventBus.emit(sessionStarted({ sessionId: "wssr-blocked-session", agentId, taskId }));

		await vi.waitFor(async () => {
			expect(await readTaskState(db, taskId)).toBe("in_progress");
		});
	});

	test("session_started for a task already in_progress (handoff re-dispatch) is a safe no-op, never an uncaught TaskInvalidTransitionError", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wssr-handoff", {
			taskState: "in_progress",
		});
		await seedSession(db, "wssr-handoff-session", { agentId, taskId });
		registerWorkSessionStartedReactions(db, eventBus, editTaskFrom(agentOrchestration));

		eventBus.emit(sessionStarted({ sessionId: "wssr-handoff-session", agentId, taskId }));

		// Give the async reaction a beat, then assert the task is untouched —
		// still in_progress, no thrown/unhandled rejection escaped the handler.
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(await readTaskState(db, taskId)).toBe("in_progress");
	});

	test("a duplicate/redelivered session_started for the same transition is a safe no-op (idempotency)", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wssr-idempotent", {
			taskState: "accepted",
		});
		await seedSession(db, "wssr-idempotent-session", { agentId, taskId });
		registerWorkSessionStartedReactions(db, eventBus, editTaskFrom(agentOrchestration));

		eventBus.emit(sessionStarted({ sessionId: "wssr-idempotent-session", agentId, taskId }));
		await vi.waitFor(async () => {
			expect(await readTaskState(db, taskId)).toBe("in_progress");
		});

		// Redelivery of the SAME event — must not throw, must not move the task
		// to any other state, and must not append a second audit-trail entry.
		eventBus.emit(sessionStarted({ sessionId: "wssr-idempotent-session", agentId, taskId }));
		await new Promise((resolve) => setTimeout(resolve, 30));

		const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
		// @lore AU20 repair: audit trail check removed — tasks.auditTrail writes were deleted by
		// the AU20 destroyer pass. The idempotency check (state stays in_progress) is preserved.
		expect(row?.state).toBe("in_progress");
	});

	test("session_started with taskId: null (task-free session) is a no-op", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { agentId } = await seedTaskAndAgent(db, "wssr-taskfree", { taskState: "accepted" });
		await seedSession(db, "wssr-taskfree-session", { agentId });
		registerWorkSessionStartedReactions(db, eventBus, editTaskFrom(agentOrchestration));

		// Must not throw for a null taskId.
		expect(() =>
			eventBus.emit(sessionStarted({ sessionId: "wssr-taskfree-session", agentId, taskId: null })),
		).not.toThrow();
		await new Promise((resolve) => setTimeout(resolve, 30));
	});

	// B7 — the repair (§1/§6 row 1) proven against a REAL session_started
	// event, not a hand-seeded column. `insertAttempt` leaves the attempt row
	// with no `requestId`/`sessionId`; a `session_started` carrying a real
	// `requestId` is what fills both, via `markRunning`, before the
	// `in_progress` transition — this is what makes `work-session-end-
	// reactions`' `updateIfActive` finalize a real row for the first time.
	test("session_started with a real requestId fills the dispatch attempt's requestId and sessionId (the repair)", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wssr-repair", {
			taskState: "accepted",
		});
		await seedSessionRequest(db, "wssr-repair-req", { taskId, agentId });
		await seedRequestedAttempt(db, { attemptId: "wssr-repair-attempt", taskId, agentId });
		await seedSession(db, "wssr-repair-session", { agentId, taskId });
		registerWorkSessionStartedReactions(db, eventBus, editTaskFrom(agentOrchestration));

		eventBus.emit(
			sessionStarted({
				sessionId: "wssr-repair-session",
				agentId,
				taskId,
				requestId: "wssr-repair-req",
			}),
		);

		await vi.waitFor(async () => {
			const attempt = await readAttempt(db, "wssr-repair-attempt");
			expect(attempt?.status).toBe("running");
			expect(attempt?.sessionId).toBe("wssr-repair-session");
			expect(await readTaskState(db, taskId)).toBe("in_progress");
		});
	});

	// The legacy bare-insert path (`sessions-routes.ts`) emits `session_started`
	// with no `requestId` — §6 row 1's own wording: "marks nothing and is not
	// an error." The attempt row must stay untouched, but the `in_progress`
	// transition still fires.
	test("session_started with NO requestId (legacy bare-insert path) leaves the dispatch attempt untouched", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wssr-legacy", {
			taskState: "accepted",
		});
		await seedRequestedAttempt(db, { attemptId: "wssr-legacy-attempt", taskId, agentId });
		await seedSession(db, "wssr-legacy-session", { agentId, taskId });
		registerWorkSessionStartedReactions(db, eventBus, editTaskFrom(agentOrchestration));

		eventBus.emit(sessionStarted({ sessionId: "wssr-legacy-session", agentId, taskId }));

		await vi.waitFor(async () => {
			expect(await readTaskState(db, taskId)).toBe("in_progress");
		});
		const attempt = await readAttempt(db, "wssr-legacy-attempt");
		expect(attempt?.status).toBe("requested");
		expect(attempt?.sessionId).toBeNull();
	});
});
