/**
 * AU21 Increment 3, Wave 0 (RED) — the seven core-api reactions to a
 * terminal `agent_run_admission_failed` event (architecture.md §10's full
 * per-`kind` subscriber table, §9 Increment 3's "Build agent_run_admission_failed
 * + core-api subscribers ... now even though most families' resolvers don't
 * exist yet").
 *
 * Every one of these scenarios drives the REAL, already-existing
 * `resolveIntentInputInternal` branch for that kind (none of the seven
 * resolvers are migrated in this wave — including `routine_run`, which stays
 * untouched all the way through Increment 3 per the scope note) into its
 * existing `InvalidAgentWorkSourceError` — a genuine pre-handoff failure,
 * exactly the shape the drain already produces today. What's NEW, and what
 * this file proves is currently MISSING, is the core-api-side REACTION once
 * that failure is reported back on `agent_run_admission_failed` with
 * `terminal: true`, per architecture.md §10's table:
 *
 *   routine_run       -> routine finalizes the run to outcome="error"
 *   task_run          -> work marks the taskDispatchAttempts row failed
 *   session_start     -> work marks the explicitSessionStarts row failed (no retry)
 *   knowledge_action  -> a review-flagged item is created (no run-record mutation)
 *   thread_turn       -> the never-silent net's sibling case: one plain notice
 *                        posted into the thread the turn came from, sent as
 *                        the agent that could not be started (never wakes it)
 *
 * All seven are currently RED: the event isn't even emitted yet (see the
 * sibling `agent-run-admission-failed-emission.integration.test.ts`), so none
 * of these reactions can possibly have fired.
 *
 * @lore GREEN-phase wiring note: each reaction is registered as an
 * async-fire-and-forget `eventBus.on(...)` handler
 * (`registerAgentRunAdmissionReactions`) — the SAME pattern every other
 * EventBus reaction in this codebase uses (`EventHandler<T>` is strictly
 * `(event) => void`, so an async body can only be a detached promise; see
 * `lifecycle-propagation.ts`'s `@lore AF3 C9b`). `emit()` itself is
 * synchronous (guarantees the handler was CALLED), not that its internal
 * `await`s resolved before `drainIntents` returns. Every existing test in
 * this codebase asserting on such a reaction's effect wraps the assertion in
 * `vi.waitFor(...)` (see `lifecycle-propagation.integration.test.ts`) — these
 * seven do the same. The assertions themselves are unchanged from the
 * RED-phase author's report.
 */

import {
	agentWorkIntents,
	changes,
	documents,
	explicitSessionStarts,
	type HyperIdleDb,
	messages,
	routineRuns,
	routines,
	taskDispatchAttempts,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { ThreadView } from "@hyperidle/domain-model";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { and, eq, sql } from "drizzle-orm";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
import { afterEach, describe, expect, test, vi } from "../../__testing__/test-fixtures.js";

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
}

async function openThread(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	id: string,
	/** Override the route actor (`x-hyperidle-actor-id`) for a non-host-scoped thread. */
	actorId?: string,
): Promise<{ readonly status: number; readonly body: ActionEnvelope<ThreadView> }> {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (actorId !== undefined) headers["x-hyperidle-actor-id"] = actorId;
	const res = await app.request("/api/actions/open_thread", {
		method: "POST",
		headers,
		body: JSON.stringify({ id }),
	});
	return { status: res.status, body: (await res.json()) as ActionEnvelope<ThreadView> };
}

/**
 * `reactToAdmissionFailure` runs fire-and-forget internally — flush the
 * microtask queue so its `await`s have settled (same pattern as
 * `session-not-returned-notice.integration.test.ts`'s `flush`).
 */
async function flush(): Promise<void> {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

/**
 * @lore AU44: The original vehicle for terminal failures (unbaked intent →
 * INVALID_WORK_SOURCE via resolveIntentInputInternal) is gone — bakedRequest is
 * now required and the unbaked drain path was removed. Each test now uses a
 * BAKED intent + a Postgres trigger that rejects the agent_session_requests
 * insert, forcing a MAX_ATTEMPTS_EXCEEDED terminal failure. The subscriber
 * reactions are unchanged — they fire on any terminal agent_run_admission_failed
 * regardless of failureCode.
 *
 * @lore pool-trigger-leak: the service test pool shares one PGlite instance per
 * worker (isolate:false). truncateAllTables clears data but not DDL. The trigger
 * must be explicitly dropped after each test that installs it — via afterEach —
 * or it leaks into subsequent test files running on the same worker.
 */
let TriggerDb: HyperIdleDb | null = null;
afterEach(async () => {
	if (TriggerDb) {
		await TriggerDb.execute(
			sql`drop trigger if exists au44_reject_session_request_write_sub on agent_session_requests`,
		);
		TriggerDb = null;
	}
});

async function rejectSessionRequestWrites(db: HyperIdleDb): Promise<void> {
	TriggerDb = db;
	await db.execute(
		sql`drop trigger if exists au44_reject_session_request_write_sub on agent_session_requests`,
	);
	await db.execute(sql`
		create or replace function au44_reject_session_request_write_sub() returns trigger as $$
		begin raise exception 'AU44 injected agent_session_requests write failure (subscriber vehicle)'; end;
		$$ language plpgsql
	`);
	await db.execute(sql`
		create trigger au44_reject_session_request_write_sub
		before insert on agent_session_requests
		for each row execute function au44_reject_session_request_write_sub()
	`);
}

const NOW = new Date().toISOString();

async function seedTeam(db: HyperIdleDb, id: string): Promise<{ teamId: string }> {
	const teamId = `${id}-team`;
	await db.insert(teams).values({ id: teamId, name: id, phase: "build", createdAt: NOW });
	return { teamId };
}

async function seedAgent(
	db: HyperIdleDb,
	id: string,
	opts: { readonly teamId?: string; readonly status?: string } = {},
): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: opts.status ?? "active",
		teamId: opts.teamId,
		createdAt: NOW,
	});
}

describe("agent_run_admission_failed — per-kind core-api reactions", () => {
	test("routine_run: finalizes the run to outcome=error (replacing failOrRelease's deleted direct write)", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeam(db, "w0-sub-routine");
		await seedAgent(db, "w0-sub-routine-owner", { teamId });
		await db.insert(routines).values({
			id: "w0-sub-routine",
			name: "Wave 0 subscriber routine",
			ownerAgentId: "w0-sub-routine-owner",
			triggerType: "manual",
			state: "active",
			active: false, // deactivated — forces InvalidAgentWorkSourceError at drain
		});
		const [run] = await db
			.insert(routineRuns)
			.values({
				id: "w0-sub-routine-run",
				routineId: "w0-sub-routine",
				startedAt: NOW,
				outcome: "running",
			})
			.returning();

		// AU21 §9 Increment 9: `DurableAgentQueueDeps.routine` (the surface
		// failOrRelease's OLD direct `updateRoutineRunIfRunning` write used) is
		// REMOVED entirely — confirmed zero real call sites anywhere in
		// `@hyperidle/session-requests`. There is no `deps.routine.*` path left
		// at all, so a passing assertion below can only come from a REAL
		// core-api subscriber reacting to the emitted event (which reaches the
		// `routineRuns` row through its own import, not through this deps
		// bundle) — a stronger guarantee than the no-op override this test
		// originally installed.
		const deps = { ...queueDeps(db), eventBus };
		// AU44: baked intent + trigger forces terminal failure without touching resolveIntentInputInternal.
		await rejectSessionRequestWrites(db);
		await enqueueWorkIntent(db, {
			kind: "routine_run",
			sourceKind: "routine_run",
			sourceId: run?.id ?? "",
			idempotencyKey: "w0-sub-routine-run",
			bakedRequest: {
				defaultAgentId: "w0-sub-routine-owner",
				sourceKind: "routine",
				sourceId: run?.id ?? "",
				streamId: `routine:${run?.id}`,
				teamId: "w0-sub-routine-team",
				sourceCorrelation: {
					routineId: "w0-sub-routine",
					routineRunId: run?.id ?? "",
					teamId: "w0-sub-routine-team",
				},
			},
		});
		await drainIntents(deps, { maxAttempts: 1 });

		await vi.waitFor(async () => {
			const [finalized] = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.id, run?.id ?? ""));
			expect(finalized?.outcome).toBe("error");
			expect(finalized?.endedAt).toBeTruthy();
		});
	});

	test("task_run: marks the taskDispatchAttempts row failed", async ({ db, eventBus }) => {
		const { teamId } = await seedTeam(db, "w0-sub-task");
		// The dispatch attempt's agent is not runnable (paused) — forces
		// requireRunnableActor's InvalidAgentWorkSourceError at drain.
		await seedAgent(db, "w0-sub-task-agent", { teamId, status: "paused" });
		await db.insert(threads).values({
			id: `thr-${"w0-sub-task-bet"}`,
			hostKind: "team",
			hostId: teamId,
			initiatorId: "system:propagation",
			participants: "[]",
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			threadId: `thr-${"w0-sub-task-bet"}`,
			id: "w0-sub-task-bet",
			parentTaskId: null,
			teamId: teamId,
			title: "Wave 0 subscriber bet",
			description: "Wave 0 subscriber bet",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(threads).values({
			id: `thr-${"w0-sub-task"}`,
			hostKind: "team",
			hostId: teamId,
			initiatorId: "system:propagation",
			participants: "[]",
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			threadId: `thr-${"w0-sub-task"}`,
			id: "w0-sub-task",
			parentTaskId: "w0-sub-task-bet",
			teamId,
			title: "Wave 0 subscriber task",
			state: "accepted",
			createdAt: NOW,
			updatedAt: NOW,
		});
		const [attempt] = await db
			.insert(taskDispatchAttempts)
			.values({
				id: "w0-sub-task-attempt",
				taskId: "w0-sub-task",
				occasion: "accepted",
				agentId: "w0-sub-task-agent",
				ordinal: 1,
				status: "requested",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.returning();

		const deps = { ...queueDeps(db), eventBus };
		// AU44: baked intent + trigger forces terminal failure.
		await rejectSessionRequestWrites(db);
		await enqueueWorkIntent(db, {
			kind: "task_run",
			sourceKind: "task_dispatch_attempt",
			sourceId: attempt?.id ?? "",
			idempotencyKey: "w0-sub-task-run",
			bakedRequest: {
				defaultAgentId: "w0-sub-task-agent",
				sourceKind: "task",
				sourceId: "w0-sub-task",
				streamId: "task:w0-sub-task",
				taskId: "w0-sub-task",
				teamId: "w0-sub-task-team",
				sourceCorrelation: { taskId: "w0-sub-task", teamId: "w0-sub-task-team" },
			},
		});
		await drainIntents(deps, { maxAttempts: 1 });

		await vi.waitFor(async () => {
			const [finalized] = await db
				.select()
				.from(taskDispatchAttempts)
				.where(eq(taskDispatchAttempts.id, attempt?.id ?? ""));
			expect(finalized?.status).toBe("failed");
		});
	});

	test("session_start: marks the explicitSessionStarts row failed, no automatic retry", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeam(db, "w0-sub-start");
		// The requested agent is not runnable — forces InvalidAgentWorkSourceError.
		await seedAgent(db, "w0-sub-start-agent", { teamId, status: "retired" });
		await db.insert(threads).values({
			id: `thr-${"w0-sub-start-bet"}`,
			hostKind: "team",
			hostId: teamId,
			initiatorId: "system:propagation",
			participants: "[]",
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			threadId: `thr-${"w0-sub-start-bet"}`,
			id: "w0-sub-start-bet",
			parentTaskId: null,
			teamId: teamId,
			title: "Wave 0 subscriber bet",
			description: "Wave 0 subscriber bet",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(threads).values({
			id: `thr-${"w0-sub-start-task"}`,
			hostKind: "team",
			hostId: teamId,
			initiatorId: "system:propagation",
			participants: "[]",
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			threadId: `thr-${"w0-sub-start-task"}`,
			id: "w0-sub-start-task",
			parentTaskId: "w0-sub-start-bet",
			teamId,
			title: "Wave 0 subscriber task",
			state: "accepted",
			createdAt: NOW,
			updatedAt: NOW,
		});
		const [start] = await db
			.insert(explicitSessionStarts)
			.values({
				id: "w0-sub-start",
				taskId: "w0-sub-start-task",
				requestedAgentId: "w0-sub-start-agent",
				requestedModelTier: "fast",
				requestedBy: "w0-sub-start-agent",
				idempotencyKey: "w0-sub-start-key",
				status: "requested",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.returning();

		const deps = { ...queueDeps(db), eventBus };
		// AU44: baked intent + trigger forces terminal failure.
		await rejectSessionRequestWrites(db);
		await enqueueWorkIntent(db, {
			kind: "session_start",
			sourceKind: "explicit_session_start",
			sourceId: start?.id ?? "",
			idempotencyKey: "w0-sub-start-intent",
			bakedRequest: {
				defaultAgentId: "w0-sub-start-agent",
				sourceKind: "task",
				sourceId: "w0-sub-start-task",
				streamId: "task:w0-sub-start-task",
				taskId: "w0-sub-start-task",
				teamId: "w0-sub-start-team",
				sourceCorrelation: { taskId: "w0-sub-start-task", teamId: "w0-sub-start-team" },
			},
		});
		await drainIntents(deps, { maxAttempts: 1 });

		await vi.waitFor(async () => {
			const [finalized] = await db
				.select()
				.from(explicitSessionStarts)
				.where(eq(explicitSessionStarts.id, start?.id ?? ""));
			expect(finalized?.status).toBe("failed");
			expect(finalized?.failureCode).toBeTruthy();
		});
	});

	test("knowledge_action: creates a review-flagged item, no run-record mutation", async ({
		db,
		eventBus,
	}) => {
		await seedAgent(db, "w0-sub-knowledge-agent");
		// `changes.actor` FKs to `users` — `flagStalledKnowledgeAction` creates the
		// document's thread as "system:propagation", so the row must exist.
		await db.insert(users).values({
			id: "system:propagation",
			kind: "ai",
			name: "Propagation System",
			role: "system",
			status: "active",
			createdAt: NOW,
		});
		const [item] = await db
			.insert(documents)
			.values({
				id: "w0-sub-knowledge-item",
				scopeKind: "factory",
				title: "Wave 0 subscriber item",
				body: "Body",
				format: "markdown",
				// archived — forces "Document is unavailable".
				status: "archived",
				updatedBy: "w0-sub-knowledge-agent",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.returning();

		const deps = { ...queueDeps(db), eventBus };
		// AU44: baked intent + trigger forces terminal failure.
		await rejectSessionRequestWrites(db);
		await enqueueWorkIntent(db, {
			kind: "knowledge_action",
			sourceKind: "knowledge_action",
			sourceId: `knowledge:${item?.id}`,
			idempotencyKey: "w0-sub-knowledge-action",
			bakedRequest: {
				defaultAgentId: "w0-sub-knowledge-agent",
				sourceKind: "knowledge",
				sourceId: "w0-sub-knowledge-item",
				streamId: "knowledge:w0-sub-knowledge-item",
				sourceCorrelation: { knowledgeItemId: "w0-sub-knowledge-item", action: "review" },
			},
		});
		await drainIntents(deps, { maxAttempts: 1 });

		// @lore BC3 architecture.md §5: `flagStalledKnowledgeAction` no longer
		// inserts an `items` row (the table is deleted) — it posts a `review`
		// message into the document's own thread (host kind
		// "document"), created on demand via `adjustThread`.
		await vi.waitFor(async () => {
			const allMessages = await db.select().from(messages).where(eq(messages.type, "review"));
			const flagged = allMessages.find((row) => row.payload.includes(`Document ${item?.id ?? ""}`));
			expect(flagged).toBeDefined();
		});
		// No durable "run" record exists for a knowledge action — nothing else to
		// assert about the document itself changing state.
		const [reloadedItem] = await db
			.select()
			.from(documents)
			.where(eq(documents.id, item?.id ?? ""));
		expect(reloadedItem?.status).toBe("archived");
	});

	test("thread_turn: failed admission posts one plain notice into the thread the turn came from", async ({
		db,
		eventBus,
		app,
	}) => {
		const { teamId } = await seedTeam(db, "w0-sub-turn");
		await seedAgent(db, "w0-sub-turn-agent", { teamId });
		await db.insert(users).values({
			id: "w0-sub-turn-human",
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(threads).values({
			id: "w0-sub-turn-thread",
			hostKind: "team",
			hostId: teamId,
			initiatorId: "w0-sub-turn-human",
			participants: JSON.stringify(["w0-sub-turn-human", "w0-sub-turn-agent"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(messages).values({
			id: "w0-sub-turn-message",
			senderId: "w0-sub-turn-human",
			threadId: "w0-sub-turn-thread",
			type: "plain",
			payload: JSON.stringify({ text: "@agent are you there?" }),
			clientKey: "w0-sub-turn-message",
			createdAt: NOW,
		});

		const deps = { ...queueDeps(db), eventBus };
		// AU44: baked intent + trigger forces terminal failure.
		await rejectSessionRequestWrites(db);
		await enqueueWorkIntent(db, {
			kind: "thread_turn",
			sourceKind: "thread_message",
			sourceId: "w0-sub-turn-message:w0-sub-turn-agent",
			idempotencyKey: "w0-sub-turn-intent",
			bakedRequest: {
				defaultAgentId: "w0-sub-turn-agent",
				sourceKind: "assistant",
				sourceId: "w0-sub-turn-message",
				streamId: "assistant:w0-sub-turn-message",
				userId: "w0-sub-turn-human",
				sourceCorrelation: {
					threadId: "w0-sub-turn-thread",
					messageId: "w0-sub-turn-message",
					userId: "w0-sub-turn-human",
					agentId: "w0-sub-turn-agent",
				},
			},
		});
		await drainIntents(deps, { maxAttempts: 1 });

		await vi.waitFor(async () => {
			const opened = await openThread(app, "w0-sub-turn-thread");
			expect(opened.status).toBe(200);
			expect(opened.body.data?.messages).toHaveLength(2);
		});
		const opened = await openThread(app, "w0-sub-turn-thread");
		const notice = opened.body.data?.messages.find((m) => m.senderId === "w0-sub-turn-agent");
		expect(notice).toBeDefined();
		const payload = notice?.payload as { text?: string };
		expect(payload.text).toBe(
			"Agent could not be started: it could not be started after repeated attempts.",
		);

		const changeRows = await db
			.select()
			.from(changes)
			.where(
				and(
					eq(changes.object, "thread"),
					eq(changes.objectId, "w0-sub-turn-thread"),
					eq(changes.kind, "message"),
				),
			);
		expect(changeRows).toHaveLength(1);

		// No new wake: the thread's `thread_turn` population is still exactly
		// the one intent whose admission failed — the notice never enqueued a
		// second one.
		const turnIntents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.kind, "thread_turn"));
		expect(turnIntents).toHaveLength(1);
	});

	test("thread_turn: a second failure for the same intent does not post a second notice", async ({
		db,
		eventBus,
		app,
	}) => {
		const { teamId } = await seedTeam(db, "w0-sub-turn2");
		await seedAgent(db, "w0-sub-turn2-agent", { teamId });
		await db.insert(users).values({
			id: "w0-sub-turn2-human",
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(threads).values({
			id: "w0-sub-turn2-thread",
			hostKind: "team",
			hostId: teamId,
			initiatorId: "w0-sub-turn2-human",
			participants: JSON.stringify(["w0-sub-turn2-human", "w0-sub-turn2-agent"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(messages).values({
			id: "w0-sub-turn2-message",
			senderId: "w0-sub-turn2-human",
			threadId: "w0-sub-turn2-thread",
			type: "plain",
			payload: JSON.stringify({ text: "hello" }),
			clientKey: "w0-sub-turn2-message",
			createdAt: NOW,
		});

		const event = {
			type: "agent_run_admission_failed" as const,
			streamId: "thread_turn:w0-sub-turn2-message:w0-sub-turn2-agent",
			intentId: "w0-sub-turn2-intent",
			kind: "thread_turn" as const,
			sourceKind: "thread_message" as const,
			sourceId: "w0-sub-turn2-message:w0-sub-turn2-agent",
			failureCode: "PROVISIONING_FAILED" as const,
			terminal: true,
			timestamp: Date.now(),
		};
		eventBus.emit(event);
		await vi.waitFor(async () => {
			const opened = await openThread(app, "w0-sub-turn2-thread");
			expect(opened.body.data?.messages).toHaveLength(2);
		});

		// The retry orchestration would report the SAME intent failing again —
		// the reaction's own `clientKey` (derived from `intentId`) must make a
		// second post a no-op, not a duplicate.
		eventBus.emit(event);
		await vi.waitFor(async () => {
			const opened = await openThread(app, "w0-sub-turn2-thread");
			expect(opened.body.data?.messages).toHaveLength(2);
		});
	});

	test("thread_turn: two-member agent thread has no human — no notice, no wake, breaking the ping-pong", async ({
		db,
		eventBus,
		app,
	}) => {
		const { teamId } = await seedTeam(db, "w0-sub-turn-pp");
		await seedAgent(db, "w0-sub-turn-pp-a", { teamId });
		await seedAgent(db, "w0-sub-turn-pp-b", { teamId });
		await db.insert(threads).values({
			id: "w0-sub-turn-pp-thread",
			hostKind: "agent",
			hostId: "w0-sub-turn-pp-b",
			initiatorId: "w0-sub-turn-pp-b",
			// both members are agents — nobody in this thread is human
			participants: JSON.stringify(["w0-sub-turn-pp-a", "w0-sub-turn-pp-b"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(messages).values({
			id: "w0-sub-turn-pp-message",
			senderId: "w0-sub-turn-pp-b",
			threadId: "w0-sub-turn-pp-thread",
			type: "plain",
			payload: JSON.stringify({ text: "are you there?" }),
			clientKey: "w0-sub-turn-pp-message",
			createdAt: NOW,
		});

		const event = {
			type: "agent_run_admission_failed" as const,
			streamId: "thread_turn:w0-sub-turn-pp-message:w0-sub-turn-pp-a",
			intentId: "w0-sub-turn-pp-intent",
			kind: "thread_turn" as const,
			sourceKind: "thread_message" as const,
			sourceId: "w0-sub-turn-pp-message:w0-sub-turn-pp-a",
			failureCode: "PROVISIONING_FAILED" as const,
			terminal: true,
			timestamp: Date.now(),
		};

		eventBus.emit(event);
		await flush();

		const opened = await openThread(app, "w0-sub-turn-pp-thread", "w0-sub-turn-pp-b");
		expect(opened.status).toBe(200);
		// Only the original message — no notice was posted as A (which would
		// have woken B, whose own failure would then have woken A again).
		expect(opened.body.data?.messages).toHaveLength(1);

		const turnIntents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.kind, "thread_turn"));
		expect(turnIntents).toHaveLength(0);
	});

	test("thread_turn: notice refused (agent no longer a member) — no throw, one error log line", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeam(db, "w0-sub-turn-refuse");
		await seedAgent(db, "w0-sub-turn-refuse-agent", { teamId });
		await db.insert(users).values({
			id: "w0-sub-turn-refuse-human",
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(threads).values({
			id: "w0-sub-turn-refuse-thread",
			hostKind: "user",
			hostId: "w0-sub-turn-refuse-human",
			initiatorId: "w0-sub-turn-refuse-human",
			// the agent was removed from the thread before its admission failed
			participants: JSON.stringify(["w0-sub-turn-refuse-human"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(messages).values({
			id: "w0-sub-turn-refuse-message",
			senderId: "w0-sub-turn-refuse-human",
			threadId: "w0-sub-turn-refuse-thread",
			type: "plain",
			payload: JSON.stringify({ text: "@agent still there?" }),
			clientKey: "w0-sub-turn-refuse-message",
			createdAt: NOW,
		});

		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const event = {
			type: "agent_run_admission_failed" as const,
			streamId: "thread_turn:w0-sub-turn-refuse-message:w0-sub-turn-refuse-agent",
			intentId: "w0-sub-turn-refuse-intent",
			kind: "thread_turn" as const,
			sourceKind: "thread_message" as const,
			sourceId: "w0-sub-turn-refuse-message:w0-sub-turn-refuse-agent",
			failureCode: "PROVISIONING_FAILED" as const,
			terminal: true,
			timestamp: Date.now(),
		};

		expect(() => eventBus.emit(event)).not.toThrow();
		await flush();

		const posted = await db
			.select()
			.from(messages)
			.where(eq(messages.threadId, "w0-sub-turn-refuse-thread"));
		expect(posted).toHaveLength(1); // only the original — the notice was refused
		expect(errorSpy).toHaveBeenCalledTimes(1);
		errorSpy.mockRestore();
	});

	test("thread_turn: source message is gone — nothing is posted, nothing throws, one log line", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeam(db, "w0-sub-turn3");
		await seedAgent(db, "w0-sub-turn3-agent", { teamId });

		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const event = {
			type: "agent_run_admission_failed" as const,
			streamId: "thread_turn:w0-sub-turn3-missing:w0-sub-turn3-agent",
			intentId: "w0-sub-turn3-intent",
			kind: "thread_turn" as const,
			sourceKind: "thread_message" as const,
			sourceId: "w0-sub-turn3-missing:w0-sub-turn3-agent",
			failureCode: "PROVISIONING_FAILED" as const,
			terminal: true,
			timestamp: Date.now(),
		};

		expect(() => eventBus.emit(event)).not.toThrow();
		await flush();

		const posted = await db.select().from(messages);
		expect(posted).toHaveLength(0);
		expect(errorSpy).toHaveBeenCalledTimes(1);
		errorSpy.mockRestore();
	});
});
