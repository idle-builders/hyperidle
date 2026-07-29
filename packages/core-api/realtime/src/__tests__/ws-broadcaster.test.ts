import type { ItemCreatedEvent, KnowledgeUpdatedEvent } from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
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

describe("WsBroadcaster", () => {
	let eventBus: EventBus;
	let broadcaster: WsBroadcaster;

	beforeEach(() => {
		eventBus = new EventBus();
		broadcaster = new WsBroadcaster(eventBus);
		broadcaster.start();
	});

	afterEach(() => {
		broadcaster.stop();
	});

	// AU21 Decision E / Increment 7: discrete-state-change topics (conversations/
	// work/thread:<id>) now forward a MINIMAL invalidation signal, not the full
	// domain-event payload. No consumer reads payload content on these topics
	// today (verified: useConversationsThreads/useThreadDetail/useAssistantThread
	// only inspect `type`/id fields to trigger a re-fetch) — see architecture.md
	// §6 Decision E. RED until WsBroadcaster's conversations/work routes emit
	// `{ type: "invalidate", topic, kind }` instead of the raw event JSON.
	it("forwards item_created events to clients subscribed to conversations topic as a minimal invalidation signal", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "conversations");

		const event: ItemCreatedEvent = {
			type: "item_created",
			streamId: "thread-1",
			itemId: "item-1",
			conversationId: "thread-1",
			kind: "review",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		expect(client.messages).toHaveLength(1);
		const received = JSON.parse(client.messages[0]!);
		expect(received.type).toBe("invalidate");
		expect(received.topic).toBe("conversations");
		expect(received.kind).toBe("item_created");
		// Minimal signal: the original event's domain fields must NOT leak through.
		expect(received.itemId).toBeUndefined();
		expect(received.conversationId).toBeUndefined();
	});

	// AC5: WebSocket pushes knowledge updates in real time
	it("forwards knowledge_updated events to clients subscribed to conversations topic as a minimal invalidation signal", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "conversations");

		const event: KnowledgeUpdatedEvent = {
			type: "knowledge_updated",
			streamId: "ki-1",
			itemId: "ki-1",
			action: "created",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		expect(client.messages).toHaveLength(1);
		const received = JSON.parse(client.messages[0]!);
		expect(received.type).toBe("invalidate");
		expect(received.topic).toBe("conversations");
		expect(received.kind).toBe("knowledge_updated");
		expect(received.itemId).toBeUndefined();
		expect(received.action).toBeUndefined();
	});

	it("does not forward events to clients not subscribed to conversations", () => {
		const subscribedClient = createMockClient();
		const unsubscribedClient = createMockClient();
		broadcaster.addClient(subscribedClient);
		broadcaster.addClient(unsubscribedClient);
		broadcaster.subscribe(subscribedClient, "conversations");

		eventBus.emit({
			type: "item_created",
			streamId: "t-1",
			itemId: "i-1",
			conversationId: "t-1",
			kind: "review",
			timestamp: Date.now(),
		});

		expect(subscribedClient.messages).toHaveLength(1);
		expect(unsubscribedClient.messages).toHaveLength(0);
	});

	it("stops forwarding after unsubscribe from topic", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "conversations");
		broadcaster.unsubscribe(client, "conversations");

		eventBus.emit({
			type: "item_created",
			streamId: "t-1",
			itemId: "i-1",
			conversationId: "t-1",
			kind: "review",
			timestamp: Date.now(),
		});

		expect(client.messages).toHaveLength(0);
	});

	it("cleans up client on removeClient", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "conversations");
		broadcaster.removeClient(client);

		eventBus.emit({
			type: "item_created",
			streamId: "t-1",
			itemId: "i-1",
			conversationId: "t-1",
			kind: "review",
			timestamp: Date.now(),
		});

		expect(client.messages).toHaveLength(0);
		expect(broadcaster.clientCount).toBe(0);
	});

	it("stops forwarding events after stop() is called", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "conversations");
		broadcaster.stop();

		eventBus.emit({
			type: "item_created",
			streamId: "t-1",
			itemId: "i-1",
			conversationId: "t-1",
			kind: "review",
			timestamp: Date.now(),
		});

		expect(client.messages).toHaveLength(0);
	});

	it("broadcasts to multiple subscribed clients", () => {
		const client1 = createMockClient();
		const client2 = createMockClient();
		broadcaster.addClient(client1);
		broadcaster.addClient(client2);
		broadcaster.subscribe(client1, "conversations");
		broadcaster.subscribe(client2, "conversations");

		eventBus.emit({
			type: "item_created",
			streamId: "t-1",
			itemId: "i-1",
			conversationId: "t-1",
			kind: "review",
			timestamp: Date.now(),
		});

		expect(client1.messages).toHaveLength(1);
		expect(client2.messages).toHaveLength(1);
	});
});
