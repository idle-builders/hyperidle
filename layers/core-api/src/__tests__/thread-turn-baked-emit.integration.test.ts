/**
 * The wake rule (`@hyperidle/thread`'s `send_message` action) resolves and
 * validates the woken agent AT EMIT TIME and bakes the full request onto the
 * `agent_work_intents` row, instead of enqueuing a bare identity-only intent
 * for the drain to resolve later:
 *
 *   1. The emitted intent's `bakedRequestJson` is populated at emit time.
 *   2. The drain hands the intent off from its baked payload alone — zero
 *      domain reads (`DurableAgentQueueDeps` carries no `conversation`/
 *      `users.getUserById` field to read from).
 */

import { agentWorkIntents, type HyperIdleDb, threads, users } from "@hyperidle/db";
import { drainIntents } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { queueDeps } from "../__testing__/durable-agent-queue-test-deps.js";
import { test } from "../__testing__/test-fixtures.js";

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
}

async function call<T>(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	name: string,
	body: Record<string, unknown>,
): Promise<{ readonly status: number; readonly body: ActionEnvelope<T> }> {
	const res = await app.request(`/api/actions/${name}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return { status: res.status, body: (await res.json()) as ActionEnvelope<T> };
}

/**
 * A 2-member thread (human + agent) — `agentsToWake` wakes the other member
 * with no @-mention needed once the thread has exactly two members
 * (`actions/thread.ts`'s `agentsToWake`).
 */
async function seedTwoMemberThread(
	db: HyperIdleDb,
	options: { readonly threadId: string; readonly senderId: string; readonly agentId: string },
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values([
		{
			id: options.senderId,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
		{
			id: options.agentId,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		},
	]);
	await db.insert(threads).values({
		id: options.threadId,
		hostKind: "agent",
		hostId: options.agentId,
		initiatorId: options.senderId,
		participants: JSON.stringify([options.senderId, options.agentId]),
		pinned: true,
		lastActiveAt: now,
		createdAt: now,
	});
}

describe("the wake rule bakes the thread_turn request at emit time (send_message)", () => {
	test("posting a plain message in a two-member thread bakes the woken agent's request onto the recorded intent", async ({
		db,
		app,
	}) => {
		await seedTwoMemberThread(db, {
			threadId: "thread-bake-emit-1",
			senderId: "user-bake-emit-1",
			agentId: "agent-bake-emit-1",
		});

		const res = await call<{ message: { id: string } }>(app, "send_message", {
			threadId: "thread-bake-emit-1",
			text: "hello agent",
		});
		expect(res.status).toBe(200);
		const messageId = (res.body.data as { message: { id: string } }).message.id;

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, `${messageId}:agent-bake-emit-1`));
		expect(intent).toBeDefined();
		expect(intent?.kind).toBe("thread_turn");

		expect(intent?.bakedRequestJson).toBeTruthy();
		const baked = intent?.bakedRequestJson
			? (JSON.parse(intent.bakedRequestJson) as Record<string, unknown>)
			: undefined;
		expect(baked).toMatchObject({
			defaultAgentId: "agent-bake-emit-1",
			sourceKind: "assistant",
			sourceId: messageId,
			streamId: "thread:thread-bake-emit-1",
			userId: "user-bake-emit-1",
			sourceCorrelation: {
				threadId: "thread-bake-emit-1",
				messageId,
				userId: "user-bake-emit-1",
				agentId: "agent-bake-emit-1",
			},
		});
	});

	test("the drain hands off the real emitted thread_turn intent from its baked payload — zero conversation/users domain reads", async ({
		db,
		app,
		eventBus,
	}) => {
		await seedTwoMemberThread(db, {
			threadId: "thread-bake-emit-2",
			senderId: "user-bake-emit-2",
			agentId: "agent-bake-emit-2",
		});

		const res = await call<{ message: { id: string } }>(app, "send_message", {
			threadId: "thread-bake-emit-2",
			text: "hello agent",
		});
		expect(res.status).toBe(200);
		const messageId = (res.body.data as { message: { id: string } }).message.id;

		// `DurableAgentQueueDeps` no longer HAS a `conversation`/
		// `users.getUserById` field at all — the drain can only ever hand off
		// from the baked payload; there is no domain-read fallback left to wire
		// a throwing spy onto.
		const deps = { ...queueDeps(db), eventBus };

		await drainIntents(deps);

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, `${messageId}:agent-bake-emit-2`));
		expect(intent?.status).toBe("handed_off");
		expect(intent?.requestId).toBeTruthy();
	});
});
