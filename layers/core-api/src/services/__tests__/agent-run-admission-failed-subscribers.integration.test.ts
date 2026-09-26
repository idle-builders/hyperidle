/**
 * `registerAgentRunAdmissionReactions`'s per-kind reaction to a terminal
 * `agent_run_admission_failed` event:
 *
 *   subscription_run  -> logged only; a subscription's wake carries no run
 *                        row to finalize
 *   task_run          -> work marks the taskDispatchAttempts row failed
 *   thread_turn       -> the never-silent net's sibling case: one plain notice
 *                        posted into the thread the turn came from, sent as
 *                        the agent that could not be started (never wakes it)
 *
 * `session_start`/`knowledge_action` have no case here — see the note before
 * the `thread_turn` tests below.
 *
 * @lore each reaction is registered as an async-fire-and-forget
 * `eventBus.on(...)` handler — `EventHandler<T>` is strictly `(event) =>
 * void`, so an async body can only be a detached promise (the same pattern
 * `lifecycle-propagation.ts` uses). `emit()` itself is synchronous (the
 * handler was CALLED), not that its internal `await`s resolved before
 * `drainIntents` returns — every assertion below wraps in `vi.waitFor(...)`
 * for that reason.
 */

import {
	agentWorkIntents,
	changes,
	type HyperIdleDb,
	messages,
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
 * Every test drives a BAKED intent through a Postgres trigger that rejects
 * the `agent_session_requests` insert, forcing a MAX_ATTEMPTS_EXCEEDED
 * terminal failure — the subscriber reactions fire on any terminal
 * `agent_run_admission_failed`, regardless of failureCode.
 *
 * @lore the service test pool shares one PGlite instance per worker
 * (isolate:false); `truncateAllTables` clears data but not DDL, so the
 * trigger must be dropped after each test that installs it (via
 * `afterEach`) or it leaks into a sibling test file on the same worker.
 */
let TriggerDb: HyperIdleDb | null = null;
afterEach(async () => {
	if (TriggerDb) {
		await TriggerDb.execute(
			sql`drop trigger if exists reject_session_request_write_sub on agent_session_requests`,
		);
		TriggerDb = null;
	}
});

async function rejectSessionRequestWrites(db: HyperIdleDb): Promise<void> {
	TriggerDb = db;
	await db.execute(
		sql`drop trigger if exists reject_session_request_write_sub on agent_session_requests`,
	);
	await db.execute(sql`
		create or replace function reject_session_request_write_sub() returns trigger as $$
		begin raise exception 'injected agent_session_requests write failure (subscriber vehicle)'; end;
		$$ language plpgsql
	`);
	await db.execute(sql`
		create trigger reject_session_request_write_sub
		before insert on agent_session_requests
		for each row execute function reject_session_request_write_sub()
	`);
}

const NOW = new Date().toISOString();

async function seedTeam(db: HyperIdleDb, id: string): Promise<{ teamId: string }> {
	const teamId = `${id}-team`;
	await db.insert(teams).values({ id: teamId, name: id, createdAt: NOW });
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
	// `agent-run-admission-reactions.ts`'s `subscription_run` case is
	// logged-only, since a subscription's wake carries no run row to
	// finalize. This proves the drain reaches that case without throwing,
	// the only externally observable behavior left.
	test("subscription_run: a refused wake is logged, no run row to finalize", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeam(db, "sub-subscription");
		await seedAgent(db, "sub-subscription-owner", { teamId });

		const deps = { ...queueDeps(db), eventBus };
		await rejectSessionRequestWrites(db);
		await enqueueWorkIntent(db, {
			kind: "subscription_run",
			sourceKind: "subscription",
			sourceId: "sub-subscription:chg-1",
			idempotencyKey: "sub-subscription-run",
			bakedRequest: {
				defaultAgentId: "sub-subscription-owner",
				sourceKind: "subscription",
				sourceId: "sub-subscription:chg-1",
				streamId: "subscription:sub-subscription",
				teamId,
				sourceCorrelation: { subscriptionId: "sub-subscription", changeId: "chg-1", teamId },
			},
		});

		await expect(drainIntents(deps, { maxAttempts: 1 })).resolves.not.toThrow();
	});

	test("task_run: marks the taskDispatchAttempts row failed", async ({ db, eventBus }) => {
		const { teamId } = await seedTeam(db, "sub-task");
		// The dispatch attempt's agent is not runnable (paused) — forces
		// requireRunnableActor's InvalidAgentWorkSourceError at drain.
		await seedAgent(db, "sub-task-agent", { teamId, status: "paused" });
		await db.insert(threads).values({
			id: `thr-${"sub-task-bet"}`,
			hostKind: "team",
			hostId: teamId,
			initiatorId: "system:propagation",
			participants: "[]",
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			threadId: `thr-${"sub-task-bet"}`,
			id: "sub-task-bet",
			parentTaskId: null,
			teamId: teamId,
			title: "Subscriber test bet",
			description: "Subscriber test bet",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(threads).values({
			id: `thr-${"sub-task"}`,
			hostKind: "team",
			hostId: teamId,
			initiatorId: "system:propagation",
			participants: "[]",
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			threadId: `thr-${"sub-task"}`,
			id: "sub-task",
			parentTaskId: "sub-task-bet",
			teamId,
			title: "Subscriber test task",
			state: "accepted",
			createdAt: NOW,
			updatedAt: NOW,
		});
		const [attempt] = await db
			.insert(taskDispatchAttempts)
			.values({
				id: "sub-task-attempt",
				taskId: "sub-task",
				occasion: "accepted",
				agentId: "sub-task-agent",
				ordinal: 1,
				status: "requested",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.returning();

		const deps = { ...queueDeps(db), eventBus };
		// A baked intent + trigger forces terminal failure.
		await rejectSessionRequestWrites(db);
		await enqueueWorkIntent(db, {
			kind: "task_run",
			sourceKind: "task_dispatch_attempt",
			sourceId: attempt?.id ?? "",
			idempotencyKey: "sub-task-run",
			bakedRequest: {
				defaultAgentId: "sub-task-agent",
				sourceKind: "task",
				sourceId: "sub-task",
				streamId: "task:sub-task",
				taskId: "sub-task",
				teamId: "sub-task-team",
				sourceCorrelation: { taskId: "sub-task", teamId: "sub-task-team" },
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

	// session_start and knowledge_action have no reaction test here: no
	// production caller ever enqueues either kind (grepped the tree — only
	// the type declares them and the reaction switch handles them), so a
	// test built by hand-constructing that intent shape can never fail for
	// a reason production breaking would cause.

	test("thread_turn: failed admission posts one plain notice into the thread the turn came from", async ({
		db,
		eventBus,
		app,
	}) => {
		const { teamId } = await seedTeam(db, "sub-turn");
		await seedAgent(db, "sub-turn-agent", { teamId });
		await db.insert(users).values({
			id: "sub-turn-human",
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(threads).values({
			id: "sub-turn-thread",
			hostKind: "team",
			hostId: teamId,
			initiatorId: "sub-turn-human",
			participants: JSON.stringify(["sub-turn-human", "sub-turn-agent"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(messages).values({
			id: "sub-turn-message",
			senderId: "sub-turn-human",
			threadId: "sub-turn-thread",
			type: "plain",
			payload: JSON.stringify({ text: "@agent are you there?" }),
			clientKey: "sub-turn-message",
			createdAt: NOW,
		});

		const deps = { ...queueDeps(db), eventBus };
		// A baked intent + trigger forces terminal failure.
		await rejectSessionRequestWrites(db);
		await enqueueWorkIntent(db, {
			kind: "thread_turn",
			sourceKind: "thread_message",
			sourceId: "sub-turn-message:sub-turn-agent",
			idempotencyKey: "sub-turn-intent",
			bakedRequest: {
				defaultAgentId: "sub-turn-agent",
				sourceKind: "assistant",
				sourceId: "sub-turn-message",
				streamId: "assistant:sub-turn-message",
				userId: "sub-turn-human",
				sourceCorrelation: {
					threadId: "sub-turn-thread",
					messageId: "sub-turn-message",
					userId: "sub-turn-human",
					agentId: "sub-turn-agent",
				},
			},
		});
		await drainIntents(deps, { maxAttempts: 1 });

		await vi.waitFor(async () => {
			const opened = await openThread(app, "sub-turn-thread");
			expect(opened.status).toBe(200);
			expect(opened.body.data?.messages).toHaveLength(2);
		});
		const opened = await openThread(app, "sub-turn-thread");
		const notice = opened.body.data?.messages.find((m) => m.senderId === "sub-turn-agent");
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
					eq(changes.objectId, "sub-turn-thread"),
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
		const { teamId } = await seedTeam(db, "sub-turn2");
		await seedAgent(db, "sub-turn2-agent", { teamId });
		await db.insert(users).values({
			id: "sub-turn2-human",
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(threads).values({
			id: "sub-turn2-thread",
			hostKind: "team",
			hostId: teamId,
			initiatorId: "sub-turn2-human",
			participants: JSON.stringify(["sub-turn2-human", "sub-turn2-agent"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(messages).values({
			id: "sub-turn2-message",
			senderId: "sub-turn2-human",
			threadId: "sub-turn2-thread",
			type: "plain",
			payload: JSON.stringify({ text: "hello" }),
			clientKey: "sub-turn2-message",
			createdAt: NOW,
		});

		const event = {
			type: "agent_run_admission_failed" as const,
			streamId: "thread_turn:sub-turn2-message:sub-turn2-agent",
			intentId: "sub-turn2-intent",
			kind: "thread_turn" as const,
			sourceKind: "thread_message" as const,
			sourceId: "sub-turn2-message:sub-turn2-agent",
			failureCode: "PROVISIONING_FAILED" as const,
			terminal: true,
			timestamp: Date.now(),
		};
		eventBus.emit(event);
		await vi.waitFor(async () => {
			const opened = await openThread(app, "sub-turn2-thread");
			expect(opened.body.data?.messages).toHaveLength(2);
		});

		// The retry orchestration would report the SAME intent failing again —
		// the reaction's own `clientKey` (derived from `intentId`) must make a
		// second post a no-op, not a duplicate.
		eventBus.emit(event);
		await vi.waitFor(async () => {
			const opened = await openThread(app, "sub-turn2-thread");
			expect(opened.body.data?.messages).toHaveLength(2);
		});
	});

	test("thread_turn: two-member agent thread has no human — no notice, no wake, breaking the ping-pong", async ({
		db,
		eventBus,
		app,
	}) => {
		const { teamId } = await seedTeam(db, "sub-turn-pp");
		await seedAgent(db, "sub-turn-pp-a", { teamId });
		await seedAgent(db, "sub-turn-pp-b", { teamId });
		await db.insert(threads).values({
			id: "sub-turn-pp-thread",
			hostKind: "agent",
			hostId: "sub-turn-pp-b",
			initiatorId: "sub-turn-pp-b",
			// both members are agents — nobody in this thread is human
			participants: JSON.stringify(["sub-turn-pp-a", "sub-turn-pp-b"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(messages).values({
			id: "sub-turn-pp-message",
			senderId: "sub-turn-pp-b",
			threadId: "sub-turn-pp-thread",
			type: "plain",
			payload: JSON.stringify({ text: "are you there?" }),
			clientKey: "sub-turn-pp-message",
			createdAt: NOW,
		});

		const event = {
			type: "agent_run_admission_failed" as const,
			streamId: "thread_turn:sub-turn-pp-message:sub-turn-pp-a",
			intentId: "sub-turn-pp-intent",
			kind: "thread_turn" as const,
			sourceKind: "thread_message" as const,
			sourceId: "sub-turn-pp-message:sub-turn-pp-a",
			failureCode: "PROVISIONING_FAILED" as const,
			terminal: true,
			timestamp: Date.now(),
		};

		eventBus.emit(event);
		await flush();

		const opened = await openThread(app, "sub-turn-pp-thread", "sub-turn-pp-b");
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
		const { teamId } = await seedTeam(db, "sub-turn-refuse");
		await seedAgent(db, "sub-turn-refuse-agent", { teamId });
		await db.insert(users).values({
			id: "sub-turn-refuse-human",
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(threads).values({
			id: "sub-turn-refuse-thread",
			hostKind: "user",
			hostId: "sub-turn-refuse-human",
			initiatorId: "sub-turn-refuse-human",
			// the agent was removed from the thread before its admission failed
			participants: JSON.stringify(["sub-turn-refuse-human"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(messages).values({
			id: "sub-turn-refuse-message",
			senderId: "sub-turn-refuse-human",
			threadId: "sub-turn-refuse-thread",
			type: "plain",
			payload: JSON.stringify({ text: "@agent still there?" }),
			clientKey: "sub-turn-refuse-message",
			createdAt: NOW,
		});

		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const event = {
			type: "agent_run_admission_failed" as const,
			streamId: "thread_turn:sub-turn-refuse-message:sub-turn-refuse-agent",
			intentId: "sub-turn-refuse-intent",
			kind: "thread_turn" as const,
			sourceKind: "thread_message" as const,
			sourceId: "sub-turn-refuse-message:sub-turn-refuse-agent",
			failureCode: "PROVISIONING_FAILED" as const,
			terminal: true,
			timestamp: Date.now(),
		};

		expect(() => eventBus.emit(event)).not.toThrow();
		await flush();

		const posted = await db
			.select()
			.from(messages)
			.where(eq(messages.threadId, "sub-turn-refuse-thread"));
		expect(posted).toHaveLength(1); // only the original — the notice was refused
		expect(errorSpy).toHaveBeenCalledTimes(1);
		errorSpy.mockRestore();
	});

	test("thread_turn: source message is gone — nothing is posted, nothing throws, one log line", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeam(db, "sub-turn3");
		await seedAgent(db, "sub-turn3-agent", { teamId });

		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const event = {
			type: "agent_run_admission_failed" as const,
			streamId: "thread_turn:sub-turn3-missing:sub-turn3-agent",
			intentId: "sub-turn3-intent",
			kind: "thread_turn" as const,
			sourceKind: "thread_message" as const,
			sourceId: "sub-turn3-missing:sub-turn3-agent",
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
