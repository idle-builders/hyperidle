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

import { type HyperIdleDb, sessions, tasks, teams, users } from "@hyperidle/db";
import type { TaskState } from "@hyperidle/domain-model";
import type { SessionStartedEvent } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";
// NOT YET CREATED — this import failing to resolve is this file's primary RED signal.
import { registerWorkSessionStartedReactions } from "../work-session-started-reactions.js";

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
	await db.insert(tasks).values({
		id: rootTaskId,
		parentTaskId: null,
		teamId: teamId,
		title: "work-session-started-reactions bet",
		description: "work-session-started-reactions bet",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(tasks).values({
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
}): SessionStartedEvent {
	return {
		type: "session_started",
		streamId: input.sessionId,
		sessionId: input.sessionId,
		agentId: input.agentId,
		taskId: input.taskId,
		timestamp: Date.now(),
	};
}

async function readTaskState(db: HyperIdleDb, taskId: string): Promise<string | undefined> {
	const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
	return row?.state;
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
		registerWorkSessionStartedReactions(db, eventBus, agentOrchestration);

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
		registerWorkSessionStartedReactions(db, eventBus, agentOrchestration);

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
		registerWorkSessionStartedReactions(db, eventBus, agentOrchestration);

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
		registerWorkSessionStartedReactions(db, eventBus, agentOrchestration);

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
		registerWorkSessionStartedReactions(db, eventBus, agentOrchestration);

		// Must not throw for a null taskId.
		expect(() =>
			eventBus.emit(sessionStarted({ sessionId: "wssr-taskfree-session", agentId, taskId: null })),
		).not.toThrow();
		await new Promise((resolve) => setTimeout(resolve, 30));
	});
});
