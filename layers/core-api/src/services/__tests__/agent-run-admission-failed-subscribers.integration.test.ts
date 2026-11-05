/**
 * `registerAgentRunAdmissionReactions`'s per-kind reaction to a terminal
 * `agent_run_admission_failed` event:
 *
 *   subscription  -> logged only; a subscription's wake carries no run
 *                    row to finalize
 *   task          -> work marks the taskDispatchAttempts row failed
 *   assistant     -> the never-silent net's sibling case: one plain notice
 *                    posted into the thread the turn came from, sent as
 *                    the agent that could not be started (never wakes it)
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import {
	changes,
	type HyperIdleDb,
	messages,
	taskDispatchAttempts,
	tasks,
	teams,
	threads,
	users,
	userTeams,
} from "@hyperidle/db";
import { SYSTEM_ACTOR_ID, type ThreadView } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "../../__testing__/test-fixtures.js";
import type { ActionContext } from "../../actions/action.js";
import { buildCoreActions } from "../../actions/compose.js";
import { applyFactoryCoreState } from "../../bootstrap/factory-state.js";

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
}

async function openThread(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	id: string,
): Promise<{ readonly status: number; readonly body: ActionEnvelope<ThreadView> }> {
	const res = await app.request("/api/actions/open_thread", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ id }),
	});
	return { status: res.status, body: (await res.json()) as ActionEnvelope<ThreadView> };
}

async function openThreadAs(
	actorId: string,
	id: string,
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
): Promise<{ readonly status: number; readonly body: ActionEnvelope<ThreadView> }> {
	const actions = buildCoreActions({
		agentOrchestration,
	});
	const openThreadAction = actions.find((a) => a.declaration.name === "open_thread");
	if (!openThreadAction) throw new Error("open_thread action not found");
	const ctx: ActionContext = { actor: actorId, db, eventBus, now: new Date().toISOString() };
	const result = await openThreadAction.run(ctx, { id });
	return result.ok
		? { status: 200, body: { ok: true, data: result.data as ThreadView } }
		: { status: 422, body: { ok: false } };
}

/**
 * `reactToAdmissionFailure` runs fire-and-forget internally — flush the
 * microtask queue so its `await`s have settled.
 */
async function flush(): Promise<void> {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

afterEach(() => {
	// no teardown needed — trigger-based setup removed
});

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
		createdAt: NOW,
	});
	if (opts.teamId) await db.insert(userTeams).values({ userId: id, teamId: opts.teamId });
}

describe("agent_run_admission_failed — per-kind core-api reactions", () => {
	test("subscription: a refused wake is logged only, nothing is posted or finalized", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeam(db, "sub-subscription");
		await seedAgent(db, "sub-subscription-owner", { teamId });

		eventBus.emit({
			type: "agent_run_admission_failed" as const,
			streamId: "subscription:sub-subscription",
			agentId: "sub-subscription-owner",
			sourceKind: "subscription",
			sourceId: "sub-subscription:chg-1",
			threadId: null,
			taskId: null,
			failureCode: "PROVISIONING_FAILED" as const,
			timestamp: Date.now(),
		});

		await flush();

		// Nothing posted — subscription wakes have no one waiting.
		const posted = await db.select().from(messages);
		expect(posted).toHaveLength(0);
	});

	test("task: marks the taskDispatchAttempts row failed", async ({ db, eventBus }) => {
		const { teamId } = await seedTeam(db, "sub-task");
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

		eventBus.emit({
			type: "agent_run_admission_failed" as const,
			streamId: "task:sub-task",
			agentId: "sub-task-agent",
			sourceKind: "task",
			sourceId: attempt?.id ?? "",
			threadId: null,
			taskId: "sub-task",
			failureCode: "PROVISIONING_FAILED" as const,
			timestamp: Date.now(),
		});

		await vi.waitFor(async () => {
			const [finalized] = await db
				.select()
				.from(taskDispatchAttempts)
				.where(eq(taskDispatchAttempts.id, attempt?.id ?? ""));
			expect(finalized?.status).toBe("failed");
		});
	});

	test("assistant: failed admission posts one plain notice into the thread the turn came from", async ({
		db,
		eventBus,
		app,
		asPerson,
	}) => {
		await applyFactoryCoreState(db);
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
		await asPerson("sub-turn-human");
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

		eventBus.emit({
			type: "agent_run_admission_failed" as const,
			streamId: "assistant:sub-turn-message",
			agentId: "sub-turn-agent",
			sourceKind: "assistant",
			sourceId: "sub-turn-message",
			threadId: "sub-turn-thread",
			taskId: null,
			failureCode: "PROVISIONING_FAILED" as const,
			timestamp: Date.now(),
		});

		await vi.waitFor(async () => {
			const opened = await openThread(app, "sub-turn-thread");
			expect(opened.status).toBe(200);
			expect(opened.body.data?.messages).toHaveLength(2);
		});
		const opened = await openThread(app, "sub-turn-thread");
		const notice = opened.body.data?.messages.find((m) => m.senderId === SYSTEM_ACTOR_ID);
		expect(notice).toBeDefined();
		const payload = notice?.payload as { text?: string };
		expect(payload.text).toBe(
			"Agent could not start. No agent program is signed in on this computer. Sign in to one under [Agent programs](/people/me), then send your message again.",
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
	});

	test("assistant: a second failure for the same stream does not post a second notice", async ({
		db,
		eventBus,
		app,
		asPerson,
	}) => {
		await applyFactoryCoreState(db);
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
		await asPerson("sub-turn2-human");
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
			streamId: "assistant:sub-turn2-message:sub-turn2-agent",
			agentId: "sub-turn2-agent",
			sourceKind: "assistant" as const,
			sourceId: "sub-turn2-message",
			threadId: "sub-turn2-thread",
			taskId: null,
			failureCode: "PROVISIONING_FAILED" as const,
			timestamp: Date.now(),
		};
		eventBus.emit(event);
		await vi.waitFor(async () => {
			const opened = await openThread(app, "sub-turn2-thread");
			expect(opened.body.data?.messages).toHaveLength(2);
		});
		const first = await openThread(app, "sub-turn2-thread");
		const noProgram = first.body.data?.messages.find((m) => m.senderId === SYSTEM_ACTOR_ID);
		expect((noProgram?.payload as { text?: string } | undefined)?.text).toBe(
			"Agent could not start. No agent program is signed in on this computer. Sign in to one under [Agent programs](/people/me), then send your message again.",
		);

		// The same stream emitting again — the reaction's `clientKey` (derived
		// from streamId+sourceId+agentId) makes the second post a no-op.
		eventBus.emit(event);
		await vi.waitFor(async () => {
			const opened = await openThread(app, "sub-turn2-thread");
			expect(opened.body.data?.messages).toHaveLength(2);
		});
	});

	test("assistant: two-member agent thread has no human — no notice, no wake, breaking the ping-pong", async ({
		db,
		eventBus,
		agentOrchestration,
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
			streamId: "assistant:sub-turn-pp-message:sub-turn-pp-a",
			agentId: "sub-turn-pp-a",
			sourceKind: "assistant" as const,
			sourceId: "sub-turn-pp-message",
			threadId: "sub-turn-pp-thread",
			taskId: null,
			failureCode: "PROVISIONING_FAILED" as const,
			timestamp: Date.now(),
		};

		eventBus.emit(event);
		await flush();

		const opened = await openThreadAs(
			"sub-turn-pp-b",
			"sub-turn-pp-thread",
			db,
			eventBus,
			agentOrchestration,
		);
		expect(opened.status).toBe(200);
		// Only the original message — no notice was posted as A (which would
		// have woken B, whose own failure would then have woken A again).
		expect(opened.body.data?.messages).toHaveLength(1);
	});

	test("assistant: HyperIdle posts the notice into a direct thread it is not a member of, without waking the agent", async ({
		db,
		eventBus,
	}) => {
		await applyFactoryCoreState(db);
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
			participants: JSON.stringify(["sub-turn-refuse-human", "sub-turn-refuse-agent"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(messages).values({
			id: "sub-turn-refuse-message",
			senderId: "sub-turn-refuse-human",
			threadId: "sub-turn-refuse-thread",
			type: "plain",
			payload: JSON.stringify({ text: "still there?" }),
			clientKey: "sub-turn-refuse-message",
			createdAt: NOW,
		});

		eventBus.emit({
			type: "agent_run_admission_failed" as const,
			streamId: "assistant:sub-turn-refuse-message:sub-turn-refuse-agent",
			agentId: "sub-turn-refuse-agent",
			sourceKind: "assistant" as const,
			sourceId: "sub-turn-refuse-message",
			threadId: "sub-turn-refuse-thread",
			taskId: null,
			failureCode: "PROVISIONING_FAILED" as const,
			timestamp: Date.now(),
		});
		await vi.waitFor(async () => {
			const posted = await db
				.select()
				.from(messages)
				.where(eq(messages.threadId, "sub-turn-refuse-thread"));
			expect(posted).toHaveLength(2);
		});
		const [thread] = await db
			.select()
			.from(threads)
			.where(eq(threads.id, "sub-turn-refuse-thread"));
		// HyperIdle did not become a member.
		expect(JSON.parse(thread?.participants ?? "[]")).not.toContain(SYSTEM_ACTOR_ID);
	});

	test("assistant: source message is gone — nothing is posted, nothing throws, one log line", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeam(db, "sub-turn3");
		await seedAgent(db, "sub-turn3-agent", { teamId });

		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const event = {
			type: "agent_run_admission_failed" as const,
			streamId: "assistant:sub-turn3-missing:sub-turn3-agent",
			agentId: "sub-turn3-agent",
			sourceKind: "assistant" as const,
			sourceId: "sub-turn3-missing",
			threadId: "sub-turn3-missing-thread",
			taskId: null,
			failureCode: "PROVISIONING_FAILED" as const,
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
