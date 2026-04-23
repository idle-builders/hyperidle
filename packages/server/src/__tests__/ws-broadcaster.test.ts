import type { ItemCreatedEvent, ResponseRecordedEvent } from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WsBroadcaster, type WsClient } from "../services/ws-broadcaster.js";

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

	// AC5: WebSocket pushes new items in real time
	it("forwards item_created events to clients subscribed to conversations topic", () => {
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
		const received = JSON.parse(client.messages[0]);
		expect(received.type).toBe("item_created");
		expect(received.itemId).toBe("item-1");
	});

	// AC5: WebSocket pushes responses in real time
	it("forwards response_recorded events to clients subscribed to conversations topic", () => {
		const client = createMockClient();
		broadcaster.addClient(client);
		broadcaster.subscribe(client, "conversations");

		const event: ResponseRecordedEvent = {
			type: "response_recorded",
			streamId: "item-1",
			responseId: "resp-1",
			itemId: "item-1",
			decision: "approve",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		expect(client.messages).toHaveLength(1);
		const received = JSON.parse(client.messages[0]);
		expect(received.type).toBe("response_recorded");
		expect(received.responseId).toBe("resp-1");
		expect(received.decision).toBe("approve");
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
