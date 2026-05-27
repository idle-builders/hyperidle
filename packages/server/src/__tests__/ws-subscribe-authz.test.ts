/**
 * L1a step9 — WsBroadcaster subscribe-authz unit tests.
 *
 * Adv-C1 / Plan §6.2 contract:
 *  - global topics (`conversations`, `work`, `rail`) accept any authenticated
 *    identity.
 *  - `thread:<id>` topics require `senderId ∈ thread.participants`.
 *  - subscribe returns `forbidden` on a non-participant attempt; the WS
 *    handler then sends a structured forbidden ack and DOES NOT join the
 *    topic. Subsequent broadcasts must skip the would-be subscriber.
 */

import { createTestDb, threads as threadsTable ,
	type TestDbHandle
} from "@hyperidle/db";
import { EventBus, type ThreadMessageAppendedEvent } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createDbSubscribeAuthorizer,
	WsBroadcaster,
	type WsClient,
} from "../services/ws-broadcaster.js";

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
	let bus: EventBus;
	let db: ReturnType<typeof createTestDb>;
	let broadcaster: WsBroadcaster;

	beforeEach(async () => {
		bus = new EventBus();
		handle = await createTestDb();
		db = handle.db;
		broadcaster = new WsBroadcaster(bus, createDbSubscribeAuthorizer(db));
		broadcaster.start();

		// Seed a thread whose participants list does NOT include "agent-2".
		const now = new Date().toISOString();
		await db.insert(threadsTable)
			.values({
				id: "thr-1",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "u-founder",
				participants: JSON.stringify(["u-founder", "agent-1"]),
				pinned: 0,
				lastActiveAt: now,
				createdAt: now,
			})

	});

	afterEach(async () => {
		broadcaster.stop();
	});

	it("participant subscribe to thread:<id> → ok", () => {
		const client = createMockClient();
		broadcaster.addClient(client, "agent-1");

		const result = broadcaster.subscribe(client, "thread:thr-1");
		expect(result).toBe("ok");
	});

	it("non-participant subscribe to thread:<id> → forbidden, no events delivered", () => {
		const client = createMockClient();
		broadcaster.addClient(client, "agent-2");

		const result = broadcaster.subscribe(client, "thread:thr-1");
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
		bus.emit(ev);

		expect(client.messages).toEqual([]);
	});

	it("subscribe with no bound identity → forbidden for thread topics", () => {
		const client = createMockClient();
		broadcaster.addClient(client); // no senderId

		const result = broadcaster.subscribe(client, "thread:thr-1");
		expect(result).toBe("forbidden");
	});

	it("global topics (`conversations`, `work`, `rail`) accept any identity", () => {
		const client = createMockClient();
		broadcaster.addClient(client, "agent-2");

		expect(broadcaster.subscribe(client, "conversations")).toBe("ok");
		expect(broadcaster.subscribe(client, "work")).toBe("ok");
		expect(broadcaster.subscribe(client, "rail")).toBe("ok");
	});

	it("subscribe to a non-existent thread → forbidden", () => {
		const client = createMockClient();
		broadcaster.addClient(client, "agent-1");

		expect(broadcaster.subscribe(client, "thread:does-not-exist")).toBe("forbidden");
	});

	it("subscribe to malformed topic prefix → forbidden", () => {
		const client = createMockClient();
		broadcaster.addClient(client, "agent-1");

		expect(broadcaster.subscribe(client, "evil:thr-1")).toBe("forbidden");
	});
});
