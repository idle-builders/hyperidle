/**
 * AU21 §9 Increment 10 (Decision H1, task-only — the `decomposition` half is
 * gone entirely via Increment 10a/Decision I) — RED.
 *
 * `registerWorkSessionEndReactions` (layers/core-api/src/services/
 * work-session-end-reactions.ts) does NOT YET EXIST — every test in this
 * file is RED via module resolution failure until the GREEN phase creates
 * it. This is the exact `routine-run-session-end-reactions.ts` pattern
 * (`registeredBuses` WeakSet idempotency guard, explicit
 * `register*(db, eventBus)` wiring convention) applied to `task`'s
 * post-session writeback.
 *
 * Per architecture.md §6 Decision H / §9 Increment 10: this subscriber reacts
 * to `agent_run_lifecycle_changed` ONLY — NOT `session_ended`. `session_ended`'s
 * `SessionOutcome` vocabulary ("completed"|"crashed"|"stopped"|"not_returned")
 * does not match `taskDispatchAttemptStore.updateIfActive`'s expected status
 * values ("completed"|"failed"|"cancelled"|"requested"|"running"), while
 * `AgentRunLifecycleChangedEvent.state` matches exactly and fires on every
 * terminal state including "completed" (`transition-run.ts`'s
 * `transitionAgentRunLifecycle`, `:115-124`).
 *
 * Target behavior:
 *   - `agent_run_lifecycle_changed` with `sourceKind:"task"` calls
 *     `taskDispatchAttemptStore.updateIfActive(tx, event.requestId, {status:
 *     event.state, sessionId})` — finalizing the `taskDispatchAttempts` row
 *     matched by `requestId` (NOT by its own `id`).
 *   - Idempotent: `updateIfActive`'s own `status IN ('requested','running')`
 *     guard means a duplicate/redelivered terminal event for an
 *     already-finalized row is a safe no-op — it can never move a row
 *     backwards or re-apply a stale `sessionId`.
 *   - A `sourceKind` other than `"task"` is a no-op (no `decomposition` case
 *     exists anymore — Decision I removed the entire mechanism).
 *
 * This is the literal replacement for `session-requests`'s own direct write
 * (`lifecycleProjectors.task` → `projectTask`, `service.ts:92-100`, calling
 * `deps.work.updateTaskDispatchAttemptIfActive` via raw cross-layer DI) — see
 * the companion RED test in `agent-lifecycle-projectors.integration.test.ts`
 * proving that path goes to zero calls once `lifecycleProjectors.task` flips
 * to `observeOnly`. Together: zero orchestration→core-api write for `task_run`
 * post-session finalize, the reaction lives entirely core-side, keyed off an
 * event orchestration already emits.
 *
 * AU21 §9 Increment 12 (Decision H3), Wave D (RED, added onto the file
 * above): `registerWorkSessionEndReactions` gains a SECOND, independent
 * subscription — `session_ended` — reacting to a task-sourced session's
 * accumulated per-tier token counts (`SessionEndedEvent.tokensByTier`,
 * additive payload growth — see the companion RED test in
 * `framework/domain-model/src/__tests__/session-ended-event-tokens-by-tier-payload.test.ts`)
 * by merging them into the owning bet's `bets.tokensActualJson`. This is the
 * literal replacement for `run-orchestration/provisioner.ts`'s deleted direct
 * `ports.work.updateBetById` write (`accumulateSessionTokensOnBet`,
 * `provisioner.ts:649-683`) — called at every one of the four session-end
 * branches (crash / budget_exhausted / not_returned / normal completion),
 * always AFTER that branch's own `session_ended`-emitting `transitionRun`
 * call, so `session_ended` is a clean always-fires-before hook for this
 * writeback. See the `describe("registerWorkSessionEndReactions — Wave D
 * session_ended bet-token writeback")` block below — every test in it is RED
 * today because the production reaction does not yet subscribe to
 * `session_ended` at all for this purpose.
 */

import {
	agentSessionRequests,
	bets,
	type HyperIdleDb,
	sessions,
	taskDispatchAttempts,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { AgentRunLifecycleChangedEvent, SessionEndedEvent } from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";
// NOT YET CREATED — this import failing to resolve is this file's primary RED signal.
import { registerWorkSessionEndReactions } from "../work-session-end-reactions.js";

const NOW = new Date().toISOString();

/** Seed the owning-chain a `taskDispatchAttempts` row's FKs require: team -> bet -> task, plus an agent. */
async function seedTaskAndAgent(
	db: HyperIdleDb,
	id: string,
): Promise<{ readonly taskId: string; readonly agentId: string; readonly betId: string }> {
	const teamId = `${id}-team`;
	const betId = `${id}-bet`;
	const taskId = `${id}-task`;
	const agentId = `${id}-agent`;
	await db.insert(teams).values({ id: teamId, name: "Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: `${id}-tm`, teamId, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "work-session-end-reactions bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "work-session-end-reactions task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	return { taskId, agentId, betId };
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

async function seedAttempt(
	db: HyperIdleDb,
	options: {
		readonly attemptId: string;
		readonly taskId: string;
		readonly agentId: string;
		readonly requestId: string;
		readonly status?: string;
	},
): Promise<void> {
	await db.insert(taskDispatchAttempts).values({
		id: options.attemptId,
		taskId: options.taskId,
		occasion: "accepted",
		agentId: options.agentId,
		ordinal: 1,
		status: options.status ?? "running",
		requestId: options.requestId,
		createdAt: NOW,
		updatedAt: NOW,
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

describe("registerWorkSessionEndReactions", () => {
	test("agent_run_lifecycle_changed completed finalizes the task dispatch-attempt row (NEW event path, zero orchestration->work write)", async ({
		db,
		eventBus,
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wser-completed");
		await seedSessionRequest(db, "wser-completed-req", { taskId, agentId });
		await seedSession(db, "wser-completed-session", agentId);
		await seedAttempt(db, {
			attemptId: "wser-completed-attempt",
			taskId,
			agentId,
			requestId: "wser-completed-req",
			status: "running",
		});
		registerWorkSessionEndReactions(db, eventBus);

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
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wser-failed");
		await seedSessionRequest(db, "wser-failed-req", { taskId, agentId });
		await seedAttempt(db, {
			attemptId: "wser-failed-attempt",
			taskId,
			agentId,
			requestId: "wser-failed-req",
			status: "running",
		});
		registerWorkSessionEndReactions(db, eventBus);

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
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wser-cancelled");
		await seedSessionRequest(db, "wser-cancelled-req", { taskId, agentId });
		await seedAttempt(db, {
			attemptId: "wser-cancelled-attempt",
			taskId,
			agentId,
			requestId: "wser-cancelled-req",
			status: "requested",
		});
		registerWorkSessionEndReactions(db, eventBus);

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
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wser-idempotent");
		await seedSessionRequest(db, "wser-idempotent-req", { taskId, agentId });
		await seedSession(db, "wser-idempotent-session-1", agentId);
		await seedSession(db, "wser-idempotent-session-2", agentId);
		await seedAttempt(db, {
			attemptId: "wser-idempotent-attempt",
			taskId,
			agentId,
			requestId: "wser-idempotent-req",
			status: "running",
		});
		registerWorkSessionEndReactions(db, eventBus);

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
		await new Promise((resolve) => setTimeout(resolve, 30));

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
	}) => {
		const { taskId, agentId } = await seedTaskAndAgent(db, "wser-ignore");
		await seedSessionRequest(db, "wser-ignore-req", { taskId, agentId });
		await seedAttempt(db, {
			attemptId: "wser-ignore-attempt",
			taskId,
			agentId,
			requestId: "wser-ignore-req",
			status: "running",
		});
		registerWorkSessionEndReactions(db, eventBus);

		eventBus.emit(
			lifecycleChanged({
				requestId: "wser-ignore-req",
				sourceKind: "routine",
				sourceId: "routine-run-x",
				state: "completed",
			}),
		);

		// Unrelated sourceKind — give the async reaction a beat, then assert the
		// attempt row this test cares about is untouched.
		await new Promise((resolve) => setTimeout(resolve, 30));
		const [row] = await db
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.id, "wser-ignore-attempt"));
		expect(row?.status).toBe("running");
	});
});

/**
 * AU21 §9 Increment 12 (Decision H3), Wave D — RED.
 *
 * `registerWorkSessionEndReactions` does not yet subscribe to `session_ended`
 * at all — every test below is RED via behavior absence (the bet's
 * `tokensActualJson` is never touched), not module-resolution failure (the
 * import above already resolves, since `registerWorkSessionEndReactions`
 * itself exists from Increment 10's GREEN).
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

async function readBetTokensActualJson(
	db: HyperIdleDb,
	betId: string,
): Promise<{ byTier: Record<string, { prompt: number; completion: number }> } | undefined> {
	const [row] = await db.select().from(bets).where(eq(bets.id, betId));
	if (!row?.tokensActualJson) return undefined;
	return JSON.parse(row.tokensActualJson) as {
		byTier: Record<string, { prompt: number; completion: number }>;
	};
}

describe("registerWorkSessionEndReactions — Wave D session_ended bet-token writeback", () => {
	test("session_ended with tokensByTier merges into the owning bet's tokensActualJson (NEW event path, zero orchestration->work write)", async ({
		db,
		eventBus,
	}) => {
		const { taskId, agentId, betId } = await seedTaskAndAgent(db, "wser-tok-merge");
		await seedSession(db, "wser-tok-merge-session", agentId);
		registerWorkSessionEndReactions(db, eventBus);

		eventBus.emit(
			sessionEnded({
				sessionId: "wser-tok-merge-session",
				agentId,
				taskId,
				tokensByTier: { workhorse: { prompt: 100, completion: 200 } },
			}),
		);

		await vi.waitFor(async () => {
			const parsed = await readBetTokensActualJson(db, betId);
			expect(parsed?.byTier.workhorse).toEqual({ prompt: 100, completion: 200 });
		});
	});

	test("session_ended with tokensByTier ADDS onto an existing tokensActualJson byTier entry (read-modify-write merge, matching accumulateSessionTokensOnBet exactly)", async ({
		db,
		eventBus,
	}) => {
		const { taskId, agentId, betId } = await seedTaskAndAgent(db, "wser-tok-add");
		await db
			.update(bets)
			.set({
				tokensActualJson: JSON.stringify({
					byTier: { workhorse: { prompt: 50, completion: 75 } },
				}),
			})
			.where(eq(bets.id, betId));
		await seedSession(db, "wser-tok-add-session", agentId);
		registerWorkSessionEndReactions(db, eventBus);

		eventBus.emit(
			sessionEnded({
				sessionId: "wser-tok-add-session",
				agentId,
				taskId,
				tokensByTier: { workhorse: { prompt: 10, completion: 20 } },
			}),
		);

		await vi.waitFor(async () => {
			const parsed = await readBetTokensActualJson(db, betId);
			expect(parsed?.byTier.workhorse).toEqual({ prompt: 60, completion: 95 });
		});
	});

	test("session_ended with no tokensByTier is a no-op (mirrors accumulateSessionTokensOnBet's empty-object early return)", async ({
		db,
		eventBus,
	}) => {
		const { taskId, agentId, betId } = await seedTaskAndAgent(db, "wser-tok-empty");
		await seedSession(db, "wser-tok-empty-session", agentId);
		registerWorkSessionEndReactions(db, eventBus);

		eventBus.emit(sessionEnded({ sessionId: "wser-tok-empty-session", agentId, taskId }));

		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(await readBetTokensActualJson(db, betId)).toBeUndefined();
	});

	test("session_ended with taskId: null (task-free session) is a no-op", async ({
		db,
		eventBus,
	}) => {
		const { agentId } = await seedTaskAndAgent(db, "wser-tok-notask");
		await seedSession(db, "wser-tok-notask-session", agentId);
		registerWorkSessionEndReactions(db, eventBus);

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
		await new Promise((resolve) => setTimeout(resolve, 30));
	});

	test("a duplicate/redelivered session_ended for the same session is a safe no-op (idempotency — must not double-apply the token merge)", async ({
		db,
		eventBus,
	}) => {
		const { taskId, agentId, betId } = await seedTaskAndAgent(db, "wser-tok-idem");
		await seedSession(db, "wser-tok-idem-session", agentId);
		registerWorkSessionEndReactions(db, eventBus);

		const event = sessionEnded({
			sessionId: "wser-tok-idem-session",
			agentId,
			taskId,
			tokensByTier: { workhorse: { prompt: 100, completion: 200 } },
		});

		eventBus.emit(event);
		await vi.waitFor(async () => {
			const parsed = await readBetTokensActualJson(db, betId);
			expect(parsed?.byTier.workhorse).toEqual({ prompt: 100, completion: 200 });
		});

		// Redelivery of the SAME event — a naive re-application would double the
		// tokens to {prompt:200, completion:400}. Must stay at the single
		// application's values.
		eventBus.emit(event);
		await new Promise((resolve) => setTimeout(resolve, 30));

		const parsed = await readBetTokensActualJson(db, betId);
		expect(parsed?.byTier.workhorse).toEqual({ prompt: 100, completion: 200 });
	});
});
