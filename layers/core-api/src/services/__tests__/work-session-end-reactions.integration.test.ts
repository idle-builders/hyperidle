/**
 * `registerWorkSessionEndReactions` finalizes a task's dispatch-attempt row
 * on `agent_run_lifecycle_changed` (matched by `requestId`, idempotent via
 * `updateIfActive`'s status guard; a non-`task` sourceKind is a no-op), and
 * separately merges `session_ended`'s per-tier token counts onto the worked
 * task's own `tokensActualJson`.
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
import type {
	AgentRunLifecycleChangedEvent,
	SessionEndedEvent,
	SessionStartedEvent,
} from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";
import { buildCoreActions } from "../../actions/compose.js";
import { registerWorkSessionEndReactions } from "../work-session-end-reactions.js";
import { registerWorkSessionStartedReactions } from "../work-session-started-reactions.js";

/** Both reactions take `edit_task`'s bound `run`, not a bare `update()`. */
function editTaskFrom(
	agentOrchestration: AgentOrchestrationPort,
): Parameters<typeof registerWorkSessionEndReactions>[2] {
	const editTaskAction = buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
		reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
	}).find((a) => a.declaration.name === "edit_task");
	if (!editTaskAction) throw new Error("edit_task action not found");
	return editTaskAction.run as Parameters<typeof registerWorkSessionEndReactions>[2];
}

const NOW = new Date().toISOString();

/** Seed the owning-chain a `taskDispatchAttempts` row's FKs require: team -> (root task) -> task, plus an agent. */
async function seedTaskAndAgent(
	db: HyperIdleDb,
	id: string,
): Promise<{ readonly taskId: string; readonly agentId: string }> {
	const teamId = `${id}-team`;
	const rootId = `${id}-root`;
	const taskId = `${id}-task`;
	const agentId = `${id}-agent`;
	await db.insert(teams).values({ id: teamId, name: "Team", createdAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	// A root task (parentTaskId: null) needs its own thread first.
	await db.insert(threads).values({
		id: `thr-${rootId}`,
		hostKind: "team",
		hostId: teamId,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${rootId}`,
		id: rootId,
		parentTaskId: null,
		teamId,
		title: "work-session-end-reactions root",
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
		parentTaskId: rootId,
		teamId,
		ownerAgentId: agentId,
		title: "work-session-end-reactions task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	return { taskId, agentId };
}

/**
 * `taskDispatchAttempts.requestId` is a real FK into `agentSessionRequests`
 * (`onDelete: "restrict"`) — seed a real request row so the finalize UPDATE's
 * `requestId` match is against a genuine row, matching the real invariant.
 * `status: "pending"` (not `"running"`) — this row exists purely as a valid
 * FK target for `taskDispatchAttempts.requestId`; none of this file's tests
 * assert on `agentSessionRequests`' own status, so `"pending"` is the
 * simplest status satisfying `agent_session_requests_correlation_ck` without
 * an unrelated `sessionId`/`claimToken` requirement.
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

async function seedSession(db: HyperIdleDb, id: string, agentId: string): Promise<void> {
	await db.insert(sessions).values({
		id,
		agentId,
		modelTier: "fast",
		startedAt: NOW,
		state: "done",
	});
}

/**
 * Seeds the row the way `insertAttempt` really leaves it — `status:
 * "requested"`, no `requestId`, no `sessionId`. A test that needs the row
 * `running` with a real `requestId` primes it through a genuine
 * `session_started` event (`primeAttemptRunning` below) instead of
 * hand-setting the column, which would mask a real reaction defect.
 */
async function seedAttempt(
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

function sessionStarted(input: {
	readonly sessionId: string;
	readonly agentId: string;
	readonly taskId: string | null;
	readonly requestId: string;
}): SessionStartedEvent {
	return {
		type: "session_started",
		streamId: input.sessionId,
		sessionId: input.sessionId,
		agentId: input.agentId,
		taskId: input.taskId,
		timestamp: Date.now(),
		requestId: input.requestId,
	};
}

/**
 * Registers the started-reaction and emits a genuine `session_started`
 * carrying `requestId`, so `markRunning` (not the test) fills the attempt
 * row's `requestId`/`sessionId` and flips it to `running`. Requires
 * `sessionId` to already exist (a real FK target).
 */
async function primeAttemptRunning(
	db: HyperIdleDb,
	eventBus: Parameters<typeof registerWorkSessionStartedReactions>[1],
	editTask: Parameters<typeof registerWorkSessionStartedReactions>[2],
	options: {
		readonly attemptId: string;
		readonly taskId: string;
		readonly agentId: string;
		readonly requestId: string;
		readonly sessionId: string;
	},
): Promise<void> {
	registerWorkSessionStartedReactions(db, eventBus, editTask);
	eventBus.emit(
		sessionStarted({
			sessionId: options.sessionId,
			agentId: options.agentId,
			taskId: options.taskId,
			requestId: options.requestId,
		}),
	);
	await vi.waitFor(async () => {
		const [row] = await db
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.id, options.attemptId));
		expect(row?.status).toBe("running");
		expect(row?.requestId).toBe(options.requestId);
	});
}

function lifecycleChanged(input: {
	readonly requestId: string;
	readonly sourceKind: AgentRunLifecycleChangedEvent["sourceKind"];
	readonly sourceId: string;
	readonly state: AgentRunLifecycleChangedEvent["state"];
	readonly sessionId?: string;
}): AgentRunLifecycleChangedEvent {
	return {
		type: "agent_run_lifecycle_changed",
		streamId: `task:${input.sourceId}`,
		requestId: input.requestId,
		sourceKind: input.sourceKind,
		sourceId: input.sourceId,
		state: input.state,
		timestamp: Date.now(),
		...(input.sessionId ? { sessionId: input.sessionId } : {}),
	};
}

/**
 * A "this event is ignored" assertion has no completion signal of its own to
 * wait on. Instead of a blind sleep, drive one REAL, unrelated attempt
 * through the same registered reaction to a verified terminal state — by the
 * time that resolves, the ignored event's own (equally fire-and-forget)
 * handler invocation has long since had its turn on the microtask queue.
 */
async function settleIgnoredReaction(
	db: HyperIdleDb,
	eventBus: Parameters<typeof registerWorkSessionStartedReactions>[1],
	editTask: Parameters<typeof registerWorkSessionStartedReactions>[2],
	sentinelId: string,
): Promise<void> {
	const { taskId, agentId } = await seedTaskAndAgent(db, sentinelId);
	await seedSessionRequest(db, `${sentinelId}-req`, { taskId, agentId });
	await seedSession(db, `${sentinelId}-session`, agentId);
	await seedAttempt(db, { attemptId: `${sentinelId}-attempt`, taskId, agentId });
	await primeAttemptRunning(db, eventBus, editTask, {
		attemptId: `${sentinelId}-attempt`,
		taskId,
		agentId,
		requestId: `${sentinelId}-req`,
		sessionId: `${sentinelId}-session`,
	});
	eventBus.emit(
		lifecycleChanged({
			requestId: `${sentinelId}-req`,
			sourceKind: "task",
			sourceId: taskId,
			state: "completed",
		}),
	);
	await vi.waitFor(async () => {
		const [row] = await db
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.id, `${sentinelId}-attempt`));
		expect(row?.status).toBe("completed");
	});
}

describe("registerWorkSessionEndReactions", () => {
	test("agent_run_lifecycle_changed completed finalizes the task dispatch-attempt row (NEW event path, zero orchestration->work write)", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wser-completed");
		await seedSessionRequest(db, "wser-completed-req", { taskId, agentId });
		await seedSession(db, "wser-completed-session", agentId);
		await seedAttempt(db, { attemptId: "wser-completed-attempt", taskId, agentId });
		const editTask = editTaskFrom(agentOrchestration);
		await primeAttemptRunning(db, eventBus, editTask, {
			attemptId: "wser-completed-attempt",
			taskId,
			agentId,
			requestId: "wser-completed-req",
			sessionId: "wser-completed-session",
		});
		registerWorkSessionEndReactions(db, eventBus, editTask);

		eventBus.emit(
			lifecycleChanged({
				requestId: "wser-completed-req",
				sourceKind: "task",
				sourceId: taskId,
				state: "completed",
				sessionId: "wser-completed-session",
			}),
		);

		await vi.waitFor(async () => {
			const [row] = await db
				.select()
				.from(taskDispatchAttempts)
				.where(eq(taskDispatchAttempts.id, "wser-completed-attempt"));
			expect(row?.status).toBe("completed");
			expect(row?.sessionId).toBe("wser-completed-session");
		});
	});

	test("agent_run_lifecycle_changed failed finalizes the dispatch-attempt row to failed", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wser-failed");
		await seedSessionRequest(db, "wser-failed-req", { taskId, agentId });
		await seedSession(db, "wser-failed-session", agentId);
		await seedAttempt(db, { attemptId: "wser-failed-attempt", taskId, agentId });
		const editTask = editTaskFrom(agentOrchestration);
		await primeAttemptRunning(db, eventBus, editTask, {
			attemptId: "wser-failed-attempt",
			taskId,
			agentId,
			requestId: "wser-failed-req",
			sessionId: "wser-failed-session",
		});
		registerWorkSessionEndReactions(db, eventBus, editTask);

		eventBus.emit(
			lifecycleChanged({
				requestId: "wser-failed-req",
				sourceKind: "task",
				sourceId: taskId,
				state: "failed",
			}),
		);

		await vi.waitFor(async () => {
			const [row] = await db
				.select()
				.from(taskDispatchAttempts)
				.where(eq(taskDispatchAttempts.id, "wser-failed-attempt"));
			expect(row?.status).toBe("failed");
		});
	});

	test("agent_run_lifecycle_changed cancelled finalizes the dispatch-attempt row to cancelled", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wser-cancelled");
		await seedSessionRequest(db, "wser-cancelled-req", { taskId, agentId });
		await seedSession(db, "wser-cancelled-session", agentId);
		await seedAttempt(db, { attemptId: "wser-cancelled-attempt", taskId, agentId });
		const editTask = editTaskFrom(agentOrchestration);
		await primeAttemptRunning(db, eventBus, editTask, {
			attemptId: "wser-cancelled-attempt",
			taskId,
			agentId,
			requestId: "wser-cancelled-req",
			sessionId: "wser-cancelled-session",
		});
		registerWorkSessionEndReactions(db, eventBus, editTask);

		eventBus.emit(
			lifecycleChanged({
				requestId: "wser-cancelled-req",
				sourceKind: "task",
				sourceId: taskId,
				state: "cancelled",
			}),
		);

		await vi.waitFor(async () => {
			const [row] = await db
				.select()
				.from(taskDispatchAttempts)
				.where(eq(taskDispatchAttempts.id, "wser-cancelled-attempt"));
			expect(row?.status).toBe("cancelled");
		});
	});

	test("a duplicate/redelivered agent_run_lifecycle_changed event is a safe no-op (idempotency, updateIfActive's status IN ('requested','running') guard)", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wser-idempotent");
		await seedSessionRequest(db, "wser-idempotent-req", { taskId, agentId });
		await seedSession(db, "wser-idempotent-session-1", agentId);
		await seedSession(db, "wser-idempotent-session-2", agentId);
		await seedAttempt(db, { attemptId: "wser-idempotent-attempt", taskId, agentId });
		const editTask = editTaskFrom(agentOrchestration);
		await primeAttemptRunning(db, eventBus, editTask, {
			attemptId: "wser-idempotent-attempt",
			taskId,
			agentId,
			requestId: "wser-idempotent-req",
			sessionId: "wser-idempotent-session-1",
		});
		registerWorkSessionEndReactions(db, eventBus, editTask);

		eventBus.emit(
			lifecycleChanged({
				requestId: "wser-idempotent-req",
				sourceKind: "task",
				sourceId: taskId,
				state: "completed",
				sessionId: "wser-idempotent-session-1",
			}),
		);
		await vi.waitFor(async () => {
			const [row] = await db
				.select()
				.from(taskDispatchAttempts)
				.where(eq(taskDispatchAttempts.id, "wser-idempotent-attempt"));
			expect(row?.status).toBe("completed");
		});

		// Second, duplicate delivery — the row is no longer "requested"/"running",
		// so this must be a safe no-op: it must NOT move the row to "cancelled"
		// and must NOT overwrite sessionId with the redelivered event's value.
		eventBus.emit(
			lifecycleChanged({
				requestId: "wser-idempotent-req",
				sourceKind: "task",
				sourceId: taskId,
				state: "cancelled",
				sessionId: "wser-idempotent-session-2",
			}),
		);
		await settleIgnoredReaction(db, eventBus, editTask, "wser-idempotent-sentinel");

		const [row] = await db
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.id, "wser-idempotent-attempt"));
		expect(row?.status).toBe("completed");
		expect(row?.sessionId).toBe("wser-idempotent-session-1");
	});

	test("ignores an agent_run_lifecycle_changed event for a non-task source (no bet_decomposition case exists — Decision I)", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wser-ignore");
		await seedSessionRequest(db, "wser-ignore-req", { taskId, agentId });
		await seedSession(db, "wser-ignore-session", agentId);
		await seedAttempt(db, { attemptId: "wser-ignore-attempt", taskId, agentId });
		const editTask = editTaskFrom(agentOrchestration);
		await primeAttemptRunning(db, eventBus, editTask, {
			attemptId: "wser-ignore-attempt",
			taskId,
			agentId,
			requestId: "wser-ignore-req",
			sessionId: "wser-ignore-session",
		});
		registerWorkSessionEndReactions(db, eventBus, editTask);

		eventBus.emit(
			lifecycleChanged({
				requestId: "wser-ignore-req",
				sourceKind: "subscription",
				sourceId: "subscription-run-x",
				state: "completed",
			}),
		);

		// Unrelated sourceKind — drive a sentinel reaction to completion first,
		// then assert the attempt row this test cares about is untouched.
		await settleIgnoredReaction(db, eventBus, editTask, "wser-ignore-sentinel");
		const [row] = await db
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.id, "wser-ignore-attempt"));
		expect(row?.status).toBe("running");
	});
});

/**
 * Token writeback lands on the worked task's own `tasks.tokensActualJson`
 * (not an ancestor). Subtree totals are computed at read time by
 * `GET /api/tasks/:id/tree`.
 */
function sessionEnded(input: {
	readonly sessionId: string;
	readonly agentId: string;
	readonly taskId: string | null;
	readonly tokensByTier?: SessionEndedEvent["tokensByTier"];
}): SessionEndedEvent {
	return {
		type: "session_ended",
		streamId: input.sessionId,
		sessionId: input.sessionId,
		agentId: input.agentId,
		taskId: input.taskId,
		timestamp: Date.now(),
		outcome: "completed",
		...(input.tokensByTier ? { tokensByTier: input.tokensByTier } : {}),
	};
}

async function readTaskTokensActualJson(
	db: HyperIdleDb,
	taskId: string,
): Promise<{ byTier: Record<string, { prompt: number; completion: number }> } | undefined> {
	const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
	if (!row?.tokensActualJson) return undefined;
	return JSON.parse(row.tokensActualJson) as {
		byTier: Record<string, { prompt: number; completion: number }>;
	};
}

/**
 * Same rationale as `settleIgnoredReaction` above, for the session_ended
 * writeback: drive one real sentinel session_ended to a verified terminal
 * write before asserting an unrelated case stayed a no-op.
 */
async function settleIgnoredSessionEnded(
	db: HyperIdleDb,
	eventBus: Parameters<typeof registerWorkSessionEndReactions>[1],
	editTask: Parameters<typeof registerWorkSessionEndReactions>[2],
	sentinelId: string,
): Promise<void> {
	const { taskId, agentId } = await seedTaskAndAgent(db, sentinelId);
	await seedSession(db, `${sentinelId}-session`, agentId);
	registerWorkSessionEndReactions(db, eventBus, editTask);
	eventBus.emit(
		sessionEnded({
			sessionId: `${sentinelId}-session`,
			agentId,
			taskId,
			tokensByTier: { workhorse: { prompt: 1, completion: 1 } },
		}),
	);
	await vi.waitFor(async () => {
		const parsed = await readTaskTokensActualJson(db, taskId);
		expect(parsed?.byTier.workhorse).toEqual({ prompt: 1, completion: 1 });
	});
}

describe("registerWorkSessionEndReactions — session_ended task-token writeback", () => {
	test("session_ended with tokensByTier merges into the worked task's own tokensActualJson", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wser-tok-merge");
		await seedSession(db, "wser-tok-merge-session", agentId);
		registerWorkSessionEndReactions(db, eventBus, editTaskFrom(agentOrchestration));

		eventBus.emit(
			sessionEnded({
				sessionId: "wser-tok-merge-session",
				agentId,
				taskId,
				tokensByTier: { workhorse: { prompt: 100, completion: 200 } },
			}),
		);

		await vi.waitFor(async () => {
			const parsed = await readTaskTokensActualJson(db, taskId);
			expect(parsed?.byTier.workhorse).toEqual({ prompt: 100, completion: 200 });
		});
	});

	test("session_ended with tokensByTier ADDS onto existing tokensActualJson (read-modify-write merge)", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wser-tok-add");
		await db
			.update(tasks)
			.set({
				tokensActualJson: JSON.stringify({
					byTier: { workhorse: { prompt: 50, completion: 75 } },
				}),
			})
			.where(eq(tasks.id, taskId));
		await seedSession(db, "wser-tok-add-session", agentId);
		registerWorkSessionEndReactions(db, eventBus, editTaskFrom(agentOrchestration));

		eventBus.emit(
			sessionEnded({
				sessionId: "wser-tok-add-session",
				agentId,
				taskId,
				tokensByTier: { workhorse: { prompt: 10, completion: 20 } },
			}),
		);

		await vi.waitFor(async () => {
			const parsed = await readTaskTokensActualJson(db, taskId);
			expect(parsed?.byTier.workhorse).toEqual({ prompt: 60, completion: 95 });
		});
	});

	test("session_ended with no tokensByTier is a no-op", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wser-tok-empty");
		await seedSession(db, "wser-tok-empty-session", agentId);
		registerWorkSessionEndReactions(db, eventBus, editTaskFrom(agentOrchestration));

		eventBus.emit(sessionEnded({ sessionId: "wser-tok-empty-session", agentId, taskId }));

		await settleIgnoredSessionEnded(
			db,
			eventBus,
			editTaskFrom(agentOrchestration),
			"wser-tok-empty-sentinel",
		);
		expect(await readTaskTokensActualJson(db, taskId)).toBeUndefined();
	});

	test("session_ended with taskId: null is a no-op", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { agentId } = await seedTaskAndAgent(db, "wser-tok-notask");
		await seedSession(db, "wser-tok-notask-session", agentId);
		registerWorkSessionEndReactions(db, eventBus, editTaskFrom(agentOrchestration));

		expect(() =>
			eventBus.emit(
				sessionEnded({
					sessionId: "wser-tok-notask-session",
					agentId,
					taskId: null,
					tokensByTier: { workhorse: { prompt: 10, completion: 20 } },
				}),
			),
		).not.toThrow();
		await settleIgnoredSessionEnded(
			db,
			eventBus,
			editTaskFrom(agentOrchestration),
			"wser-tok-notask-sentinel",
		);
	});

	test("duplicate session_ended for the same session is idempotent (no double-apply)", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wser-tok-idem");
		await seedSession(db, "wser-tok-idem-session", agentId);
		registerWorkSessionEndReactions(db, eventBus, editTaskFrom(agentOrchestration));

		const event = sessionEnded({
			sessionId: "wser-tok-idem-session",
			agentId,
			taskId,
			tokensByTier: { workhorse: { prompt: 100, completion: 200 } },
		});

		eventBus.emit(event);
		await vi.waitFor(async () => {
			const parsed = await readTaskTokensActualJson(db, taskId);
			expect(parsed?.byTier.workhorse).toEqual({ prompt: 100, completion: 200 });
		});

		// Redelivery — must NOT double-apply
		eventBus.emit(event);
		await settleIgnoredSessionEnded(
			db,
			eventBus,
			editTaskFrom(agentOrchestration),
			"wser-tok-idem-sentinel",
		);

		const parsed = await readTaskTokensActualJson(db, taskId);
		expect(parsed?.byTier.workhorse).toEqual({ prompt: 100, completion: 200 });
	});
});
