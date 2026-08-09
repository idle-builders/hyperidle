/**
 * AU21 Increment 3, assistant_turn wave — architecture.md §6 Decision B /
 * §9 Increment 3: the REAL emit call site (`routes/threads.ts:1360`'s
 * `agentWorkIntentRecorder.record(...)` inside the "POST
 * /:id/messages" handler's `recordsAssistantIntent` branch) must resolve +
 * validate the assistant run AT EMIT TIME and bake the full request onto the
 * `agent_work_intents` row, instead of enqueuing a bare identity-only intent
 * for the drain to resolve later.
 *
 * GREEN (was RED when first written): both counts below now hold.
 *   1. The emitted intent's `bakedRequestJson` is populated at emit time.
 *   2. `resolveIntentInputInternal`'s old "assistant_turn" per-kind
 *      drain-time resolution (which used to read `conversation.getMessageById`/
 *      `users.getUserById`) is DELETED, not merely unreachable — AU21 §9
 *      Increment 9 removed the dead `conversation`/`users.getUserById` fields
 *      from `DurableAgentQueueDeps` entirely (confirmed zero real call sites
 *      left anywhere in `@hyperidle/session-requests`), so the type system
 *      itself now proves zero domain reads — a stronger guarantee than the
 *      throwing-spy wiring this test originally used.
 */

import { agentWorkIntents, type HyperIdleDb, threads, users } from "@hyperidle/db";
import { drainIntents } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
import { test } from "../../__testing__/test-fixtures.js";

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

		// `DurableAgentQueueDeps` no longer HAS a `conversation`/
		// `users.getUserById` field at all (AU21 §9 Increment 9 deleted the dead
		// composition) — the drain can only ever hand off from the baked
		// payload; there is no domain-read fallback left to wire a throwing spy
		// onto.
		const deps = { ...queueDeps(db), eventBus };

		await drainIntents(deps);

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, messageId));
		expect(intent?.status).toBe("handed_off");
		expect(intent?.requestId).toBeTruthy();
	});
});
