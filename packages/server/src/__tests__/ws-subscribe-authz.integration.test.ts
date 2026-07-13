/**
 * L1a step9 — WsBroadcaster subscribe-authz unit tests.
 *
 * Adv-C1 / Plan §6.2 contract:
 *  - global topics (`conversations`, `work`) accept any authenticated identity.
 *  - `thread:<id>` topics require `senderId ∈ thread.participants`.
 *  - subscribe returns `forbidden` on a non-participant attempt; the WS
 *    handler then sends a structured forbidden ack and DOES NOT join the
 *    topic. Subsequent broadcasts must skip the would-be subscriber.
 */

import { sessions, threads as threadsTable, users } from "@hyperidle/db";
import type { ThreadMessageAppendedEvent } from "@hyperidle/shared";
import { describe, expect } from "vitest";
import {
	createDbSubscribeAuthorizer,
	WsBroadcaster,
	type WsClient,
} from "@hyperidle/core-app";
import { test } from "../test-fixtures.js";

function createMockClient(): WsClient & { messages: string[] } {
	const messages: string[] = [];
	return {
		messages,
		send(data: string) {
			messages.push(data);
		},
	};
}

describe("WsBroadcaster — subscribe authorization (L1 Adv-C1)", () => {
	test("participant subscribe to thread:<id> → ok", async ({ db, eventBus }) => {
		const broadcaster = new WsBroadcaster(eventBus, createDbSubscribeAuthorizer(db));
		broadcaster.start();

		// Seed a thread
		const now = new Date().toISOString();
		await db.insert(threadsTable).values({
			id: "thr-1",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "u-founder",
			participants: JSON.stringify(["u-founder", "agent-1"]),
			pinned: false,
			lastActiveAt: now,
			createdAt: now,
		});

		const client = createMockClient();
		broadcaster.addClient(client, "agent-1");

		const result = await broadcaster.subscribe(client, "thread:thr-1");
		expect(result).toBe("ok");

		broadcaster.stop();
	});

	test("non-participant subscribe to thread:<id> → forbidden, no events delivered", async ({
		db,
		eventBus,
	}) => {
		const broadcaster = new WsBroadcaster(eventBus, createDbSubscribeAuthorizer(db));
		broadcaster.start();

		const now = new Date().toISOString();
		await db.insert(threadsTable).values({
			id: "thr-1",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "u-founder",
			participants: JSON.stringify(["u-founder", "agent-1"]),
			pinned: false,
			lastActiveAt: now,
			createdAt: now,
		});

		const client = createMockClient();
		broadcaster.addClient(client, "agent-2");

		const result = await broadcaster.subscribe(client, "thread:thr-1");
		expect(result).toBe("forbidden");

		// Confirm that subsequent thread events do NOT reach the rejected client.
		const ev: ThreadMessageAppendedEvent = {
			type: "thread_message_appended",
			streamId: "thr-1",
			threadId: "thr-1",
			messageId: "m-1",
			messageType: "plain",
			senderId: "agent-1",
			timestamp: 1,
		};
		eventBus.emit(ev);

		expect(client.messages).toEqual([]);

		broadcaster.stop();
	});

	test("subscribe with no bound identity → forbidden for thread topics", async ({
		db,
		eventBus,
	}) => {
		const broadcaster = new WsBroadcaster(eventBus, createDbSubscribeAuthorizer(db));
		broadcaster.start();

		const now = new Date().toISOString();
		await db.insert(threadsTable).values({
			id: "thr-1",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "u-founder",
			participants: JSON.stringify(["u-founder", "agent-1"]),
			pinned: false,
			lastActiveAt: now,
			createdAt: now,
		});

		const client = createMockClient();
		broadcaster.addClient(client); // no senderId

		const result = await broadcaster.subscribe(client, "thread:thr-1");
		expect(result).toBe("forbidden");

		broadcaster.stop();
	});

	test("global topics (`conversations`, `work`) accept any identity", async ({ db, eventBus }) => {
		const broadcaster = new WsBroadcaster(eventBus, createDbSubscribeAuthorizer(db));
		broadcaster.start();

		const client = createMockClient();
		broadcaster.addClient(client, "agent-2");

		expect(await broadcaster.subscribe(client, "conversations")).toBe("ok");
		expect(await broadcaster.subscribe(client, "work")).toBe("ok");

		broadcaster.stop();
	});

	test("subscribe to a non-existent thread → forbidden", async ({ db, eventBus }) => {
		const broadcaster = new WsBroadcaster(eventBus, createDbSubscribeAuthorizer(db));
		broadcaster.start();

		const client = createMockClient();
		broadcaster.addClient(client, "agent-1");

		expect(await broadcaster.subscribe(client, "thread:does-not-exist")).toBe("forbidden");

		broadcaster.stop();
	});

	test("subscribe to malformed topic prefix → forbidden", async ({ db, eventBus }) => {
		const broadcaster = new WsBroadcaster(eventBus, createDbSubscribeAuthorizer(db));
		broadcaster.start();

		const client = createMockClient();
		broadcaster.addClient(client, "agent-1");

		expect(await broadcaster.subscribe(client, "evil:thr-1")).toBe("forbidden");

		broadcaster.stop();
	});

	test("task-free assistant session topic is limited to thread participants", async ({
		db,
		eventBus,
	}) => {
		const broadcaster = new WsBroadcaster(eventBus, createDbSubscribeAuthorizer(db));
		broadcaster.start();

		const now = new Date().toISOString();
		await db.insert(users).values([
			{
				id: "u-founder",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: now,
			},
			{
				id: "u-outsider",
				kind: "human",
				name: "Outsider",
				role: "founder",
				status: "active",
				createdAt: now,
			},
			{
				id: "ast-u-founder",
				kind: "ai",
				name: "Assistant",
				role: "assistant",
				status: "active",
				createdAt: now,
			},
		]);
		await db.insert(threadsTable).values({
			id: "thr-assistant",
			hostKind: "assistant",
			hostId: "u-founder",
			initiatorId: "u-founder",
			participants: JSON.stringify(["u-founder", "ast-u-founder"]),
			pinned: false,
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(sessions).values({
			id: "session-task-free-assistant",
			taskId: null,
			requestId: "request-assistant",
			sourceKind: "assistant",
			sourceId: "msg-1",
			sourceCorrelationJson: JSON.stringify({
				threadId: "thr-assistant",
				messageId: "msg-1",
				userId: "u-founder",
				assistantAgentId: "ast-u-founder",
			}),
			agentId: "ast-u-founder",
			modelTier: "workhorse",
			startedAt: now,
			state: "active",
		});

		const participant = createMockClient();
		const outsider = createMockClient();
		broadcaster.addClient(participant, "u-founder");
		broadcaster.addClient(outsider, "u-outsider");

		expect(await broadcaster.subscribe(participant, "session:session-task-free-assistant")).toBe(
			"ok",
		);
		expect(await broadcaster.subscribe(outsider, "session:session-task-free-assistant")).toBe(
			"forbidden",
		);

		broadcaster.stop();
	});
});
