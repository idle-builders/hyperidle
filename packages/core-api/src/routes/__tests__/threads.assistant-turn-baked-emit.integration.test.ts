/**
 * AU21 Increment 3, assistant_turn wave (RED) — architecture.md §6 Decision B /
 * §9 Increment 3: the REAL emit call site (`routes/threads.ts:1360`'s
 * `agentWorkIntentRecorder.record(...)` inside the "POST
 * /:id/messages" handler's `recordsAssistantIntent` branch) must resolve +
 * validate the assistant run AT EMIT TIME and bake the full request onto the
 * `agent_work_intents` row, instead of enqueuing a bare identity-only intent
 * for the drain to resolve later.
 *
 * Currently RED on two counts, both proven below:
 *   1. The emitted intent's `bakedRequestJson` is null today (the route does
 *      not yet call the new conversation resolver before recording).
 *   2. Because nothing is baked, the drain still falls through to
 *      `resolveIntentInputInternal`'s "assistant_turn" case at DRAIN time,
 *      which reads `conversation.getMessageById`/`users.getUserById` — a
 *      domain read this migration must delete. Proven by wiring THOSE deps to
 *      throw and asserting the real emitted intent still hands off (it must
 *      not, today).
 */

import { agentWorkIntents, type HyperIdleDb, threads, users } from "@hyperidle/db";
import { drainIntents } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { queueDeps } from "../../services/durable-agent-queue.js";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-au21-assistant-turn-emit";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedAssistantThread(
	db: HyperIdleDb,
	options: { readonly threadId: string; readonly senderId: string; readonly assistantId: string },
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
			id: options.assistantId,
			kind: "ai",
			name: "Assistant",
			role: "assistant",
			status: "active",
			createdAt: now,
		},
	]);
	await db.insert(threads).values({
		id: options.threadId,
		hostKind: "user",
		hostId: options.senderId,
		initiatorId: options.senderId,
		participants: JSON.stringify([options.senderId, options.assistantId]),
		pinned: true,
		lastActiveAt: now,
		createdAt: now,
	});
}

describe("assistant_turn is resolved and baked at emit time (POST /api/threads/:id/messages)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("posting a plain message on the assistant thread bakes the assistant_turn request onto the recorded intent", async ({
		db,
		app,
	}) => {
		await seedAssistantThread(db, {
			threadId: "thread-au21-emit-1",
			senderId: "user-au21-emit-1",
			assistantId: "ast-user-au21-emit-1",
		});

		const res = await app.request("/api/threads/thread-au21-emit-1/messages", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "hello assistant" },
				clientKey: "au21-emit-clientkey-001",
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { message: { id: string } };
		const messageId = body.message.id;

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, messageId));
		expect(intent).toBeDefined();
		expect(intent?.kind).toBe("assistant_turn");

		// RED today: `bakedRequestJson` is null — the route does not yet bake
		// the request at emit time.
		expect(intent?.bakedRequestJson).toBeTruthy();
		const baked = intent?.bakedRequestJson
			? (JSON.parse(intent.bakedRequestJson) as Record<string, unknown>)
			: undefined;
		expect(baked).toMatchObject({
			defaultAgentId: "ast-user-au21-emit-1",
			sourceKind: "assistant",
			sourceId: messageId,
			streamId: "thread:thread-au21-emit-1",
			userId: "user-au21-emit-1",
			sourceCorrelation: {
				threadId: "thread-au21-emit-1",
				messageId,
				userId: "user-au21-emit-1",
				assistantAgentId: "ast-user-au21-emit-1",
			},
		});
	});

	test("the drain hands off the real emitted assistant_turn intent from its baked payload — ZERO conversation/users domain reads", async ({
		db,
		app,
		eventBus,
	}) => {
		await seedAssistantThread(db, {
			threadId: "thread-au21-emit-2",
			senderId: "user-au21-emit-2",
			assistantId: "ast-user-au21-emit-2",
		});

		const res = await app.request("/api/threads/thread-au21-emit-2/messages", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "hello assistant" },
				clientKey: "au21-emit-clientkey-002",
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { message: { id: string } };
		const messageId = body.message.id;

		const base = queueDeps(db);
		const throwingGetMessageById = vi.fn(async () => {
			throw new Error("zero-domain-read violation: conversation.getMessageById was called");
		});
		const throwingGetUserById = vi.fn(async () => {
			throw new Error("zero-domain-read violation: users.getUserById was called");
		});
		const deps = {
			...base,
			eventBus,
			conversation: { ...base.conversation, getMessageById: throwingGetMessageById },
			users: { ...base.users, getUserById: throwingGetUserById },
		};

		await drainIntents(deps);

		// RED today: the route never baked a request, so the drain falls
		// through to the per-kind "assistant_turn" resolution, which calls
		// these domain reads — both throwing spies get invoked, and the
		// intent ends up `failed`, not `handed_off`.
		expect(throwingGetMessageById.mock.calls.length).toBe(0);
		expect(throwingGetUserById.mock.calls.length).toBe(0);

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, messageId));
		expect(intent?.status).toBe("handed_off");
		expect(intent?.requestId).toBeTruthy();
	});
});
