/**
 * AU21 §6 Decision L4 / §9 Increment 14d.
 *
 * `WsConnectionHub` is pure connection/subscription/authz/broadcast
 * transport — it owns zero event→topic routing of its own (the old
 * `WsBroadcaster`'s generic `BROADCAST_ROUTES` forwarder + `start()`/
 * `stop()` lifecycle are deleted). These tests exercise the transport
 * mechanics directly via `broadcast(topic, data)` — no EventBus involved,
 * proving the class has no EventBus dependency at all.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type WsClient, WsConnectionHub } from "../ws-connection-hub.js";

function createMockClient(): WsClient & { messages: string[] } {
	const messages: string[] = [];
	return {
		messages,
		send(data: string) {
			messages.push(data);
		},
	};
}

describe("WsConnectionHub — pure transport", () => {
	let hub: WsConnectionHub;

	beforeEach(() => {
		hub = new WsConnectionHub();
	});

	afterEach(() => {
		// No stop() lifecycle anymore — nothing to dispose.
	});

	it("delivers a direct broadcast() call to a subscribed client", () => {
		const client = createMockClient();
		hub.addClient(client);
		hub.subscribe(client, "conversations");

		hub.broadcast("conversations", JSON.stringify({ type: "update", topic: "conversations" }));

		expect(client.messages).toHaveLength(1);
		const received = JSON.parse(client.messages[0]!);
		expect(received.type).toBe("update");
		expect(received.topic).toBe("conversations");
	});

	it("does not deliver to clients not subscribed to the topic", () => {
		const subscribedClient = createMockClient();
		const unsubscribedClient = createMockClient();
		hub.addClient(subscribedClient);
		hub.addClient(unsubscribedClient);
		hub.subscribe(subscribedClient, "conversations");

		hub.broadcast("conversations", JSON.stringify({ type: "update" }));

		expect(subscribedClient.messages).toHaveLength(1);
		expect(unsubscribedClient.messages).toHaveLength(0);
	});

	it("stops delivering after unsubscribe from topic", () => {
		const client = createMockClient();
		hub.addClient(client);
		hub.subscribe(client, "conversations");
		hub.unsubscribe(client, "conversations");

		hub.broadcast("conversations", JSON.stringify({ type: "update" }));

		expect(client.messages).toHaveLength(0);
	});

	it("cleans up client on removeClient", () => {
		const client = createMockClient();
		hub.addClient(client);
		hub.subscribe(client, "conversations");
		hub.removeClient(client);

		hub.broadcast("conversations", JSON.stringify({ type: "update" }));

		expect(client.messages).toHaveLength(0);
		expect(hub.clientCount).toBe(0);
	});

	it("broadcasts to multiple subscribed clients", () => {
		const client1 = createMockClient();
		const client2 = createMockClient();
		hub.addClient(client1);
		hub.addClient(client2);
		hub.subscribe(client1, "conversations");
		hub.subscribe(client2, "conversations");

		hub.broadcast("conversations", JSON.stringify({ type: "update" }));

		expect(client1.messages).toHaveLength(1);
		expect(client2.messages).toHaveLength(1);
	});

	it("scopes delivery to the exact topic — a thread:<id> push never reaches a sibling thread", () => {
		const a = createMockClient();
		const b = createMockClient();
		hub.addClient(a);
		hub.addClient(b);
		hub.subscribe(a, "thread:thr-1");
		hub.subscribe(b, "thread:thr-2");

		hub.broadcast("thread:thr-1", JSON.stringify({ type: "update", topic: "thread:thr-1" }));

		expect(a.messages).toHaveLength(1);
		expect(b.messages).toHaveLength(0);
	});
});
