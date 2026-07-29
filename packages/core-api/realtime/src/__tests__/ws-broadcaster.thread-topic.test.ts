/**
 * L1a — WsBroadcaster routing for thread events (plan §6.2 + §6.3).
 *
 * The broadcaster forwards:
 *  - thread_message_appended → topic "thread:<threadId>" (update)
 *  - thread_resolved         → topic "thread:<threadId>" (update)
 *  - thread_reopened         → topic "thread:<threadId>" (update)
 *  - thread_archived         → topic "thread:<threadId>" (delete)
 *  - thread_created          → topic "conversations" (so the thread-list
 *                               channel refreshes the Submenu)
 *
 * AU21 Decision E / Increment 7: these are discrete-state-change topics — the
 * broadcaster now forwards a MINIMAL invalidation signal
 * (`{ type: "invalidate", topic, kind, id? }`), not the full domain-event
 * payload. Verified: `useThreadDetail`/`useAssistantThread` only inspect
 * `msg.threadId`/`msg.type` to bump a tick counter and re-fetch — they never
 * read message content from the WS payload, so this is behavior-preserving.
 * `id` carries the threadId for thread-scoped topics so consumers can still
 * filter to their own thread without a full payload.
 *
 * Red phase (this wave): WsBroadcaster still forwards the full raw event JSON
 * for these routes. These tests fail until the green phase collapses the
 * conversations/work/thread routes onto the minimal invalidation envelope.
 */

import {
	EventBus,
	type ThreadArchivedEvent,
	type ThreadCreatedEvent,
	type ThreadMessageAppendedEvent,
	type ThreadReopenedEvent,
	type ThreadResolvedEvent,
} from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WsBroadcaster, type WsClient } from "../ws-broadcaster.js";

function createMockClient(): WsClient & { messages: string[] } {
	const messages: string[] = [];
	return {
		messages,
		send(data: string) {
			messages.push(data);
		},
	};
}

interface InvalidationEnvelope {
	type: string;
	topic: string;
	kind: string;
	id?: string;
}

describe("L1a WsBroadcaster — per-thread topic routing", () => {
	let bus: EventBus;
	let broadcaster: WsBroadcaster;

	beforeEach(() => {
		bus = new EventBus();
		broadcaster = new WsBroadcaster(bus);
		broadcaster.start();
	});

	afterEach(() => {
		broadcaster.stop();
	});

	it("forwards thread_message_appended to clients subscribed to thread:<id> as a minimal invalidation signal", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "thread:thr-1");

		const ev: ThreadMessageAppendedEvent = {
			type: "thread_message_appended",
			streamId: "thr-1",
			threadId: "thr-1",
			messageId: "m-1",
			messageType: "plain",
			senderId: "u-founder",
			timestamp: 1,
		};
		bus.emit(ev);

		expect(client.messages.length).toBeGreaterThanOrEqual(1);
		const received = JSON.parse(client.messages[0]!) as InvalidationEnvelope;
		expect(received.type).toBe("invalidate");
		expect(received.topic).toBe("thread:thr-1");
		expect(received.kind).toBe("thread_message_appended");
		expect(received.id).toBe("thr-1");
		// Minimal signal: no message content leaks through the WS frame.
		expect((received as unknown as Record<string, unknown>).messageId).toBeUndefined();
		expect((received as unknown as Record<string, unknown>).senderId).toBeUndefined();
	});

	it("does NOT deliver thread:<id> events to clients subscribed only to a different thread", () => {
		const a = createMockClient();
		const b = createMockClient();
		broadcaster.addClient(a);
		broadcaster.addClient(b);
		broadcaster.subscribe(a, "thread:thr-1");
		broadcaster.subscribe(b, "thread:thr-2");

		bus.emit({
			type: "thread_message_appended",
			streamId: "thr-1",
			threadId: "thr-1",
			messageId: "m-1",
			messageType: "plain",
			senderId: "u-founder",
			timestamp: 1,
		} as ThreadMessageAppendedEvent);

		expect(a.messages.length).toBeGreaterThanOrEqual(1);
		expect(b.messages.length).toBe(0);
	});

	it("forwards thread_resolved to thread:<id> subscribers as a minimal invalidation signal", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "thread:thr-3");

		const ev: ThreadResolvedEvent = {
			type: "thread_resolved",
			streamId: "thr-3",
			threadId: "thr-3",
			resolvedByMessageId: "v-1",
			timestamp: 2,
		};
		bus.emit(ev);

		expect(client.messages.length).toBeGreaterThanOrEqual(1);
		const received = JSON.parse(client.messages[0]!) as InvalidationEnvelope;
		expect(received.type).toBe("invalidate");
		expect(received.topic).toBe("thread:thr-3");
		expect(received.kind).toBe("thread_resolved");
		expect(received.id).toBe("thr-3");
		expect((received as unknown as Record<string, unknown>).resolvedByMessageId).toBeUndefined();
	});

	it("forwards thread_reopened to thread:<id> subscribers as a minimal invalidation signal", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "thread:thr-4");

		const ev: ThreadReopenedEvent = {
			type: "thread_reopened",
			streamId: "thr-4",
			threadId: "thr-4",
			reopenedByMessageId: "r-2",
			timestamp: 3,
		};
		bus.emit(ev);

		expect(client.messages.length).toBeGreaterThanOrEqual(1);
		const received = JSON.parse(client.messages[0]!) as InvalidationEnvelope;
		expect(received.type).toBe("invalidate");
		expect(received.topic).toBe("thread:thr-4");
		expect(received.kind).toBe("thread_reopened");
		expect(received.id).toBe("thr-4");
		expect((received as unknown as Record<string, unknown>).reopenedByMessageId).toBeUndefined();
	});

	it("forwards thread_archived to thread:<id> subscribers as a minimal invalidation signal", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "thread:thr-5");

		const ev: ThreadArchivedEvent = {
			type: "thread_archived",
			streamId: "thr-5",
			threadId: "thr-5",
			timestamp: 4,
		};
		bus.emit(ev);

		expect(client.messages.length).toBeGreaterThanOrEqual(1);
		const received = JSON.parse(client.messages[0]!) as InvalidationEnvelope;
		expect(received.type).toBe("invalidate");
		expect(received.topic).toBe("thread:thr-5");
		expect(received.kind).toBe("thread_archived");
		expect(received.id).toBe("thr-5");
	});

	it("forwards thread_created to the 'conversations' topic (Submenu refresh channel) as a minimal invalidation signal", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "conversations");

		const ev: ThreadCreatedEvent = {
			type: "thread_created",
			streamId: "thr-new",
			threadId: "thr-new",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "u-founder",
			timestamp: 5,
		};
		bus.emit(ev);

		expect(client.messages.length).toBeGreaterThanOrEqual(1);
		const received = JSON.parse(client.messages[0]!) as InvalidationEnvelope;
		expect(received.type).toBe("invalidate");
		expect(received.topic).toBe("conversations");
		expect(received.kind).toBe("thread_created");
		expect((received as unknown as Record<string, unknown>).hostId).toBeUndefined();
	});

	it("close-time auto-release: removeClient drops all topic subscriptions for that client", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "thread:thr-6");
		broadcaster.removeClient(client);

		bus.emit({
			type: "thread_message_appended",
			streamId: "thr-6",
			threadId: "thr-6",
			messageId: "m-1",
			messageType: "plain",
			senderId: "u-founder",
			timestamp: 1,
		} as ThreadMessageAppendedEvent);

		expect(client.messages.length).toBe(0);
	});
});
