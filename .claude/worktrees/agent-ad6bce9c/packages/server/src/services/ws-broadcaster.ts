import type { EventBus } from "@hyperidle/shared";

/**
 * Manages WebSocket topic subscriptions and event broadcasting.
 * Extracted from ws.ts route for testability (hono/bun requires Bun runtime).
 */
export interface WsClient {
	send(data: string): void;
}

export class WsBroadcaster {
	private clients = new Map<WsClient, Set<string>>();
	private unsubscribers: Array<() => void> = [];

	constructor(private readonly eventBus: EventBus) {}

	/** Wire up event bus subscriptions for forwarding. */
	start(): void {
		const unsub1 = this.eventBus.on("item_created", (event) => {
			this.broadcast("conversations", JSON.stringify(event));
		});

		const unsub2 = this.eventBus.on("response_recorded", (event) => {
			this.broadcast("conversations", JSON.stringify(event));
		});

		this.unsubscribers.push(unsub1, unsub2);
	}

	/** Stop forwarding events. */
	stop(): void {
		for (const unsub of this.unsubscribers) {
			unsub();
		}
		this.unsubscribers = [];
	}

	/** Register a new client. */
	addClient(client: WsClient): void {
		this.clients.set(client, new Set());
	}

	/** Remove a client. */
	removeClient(client: WsClient): void {
		this.clients.delete(client);
	}

	/** Subscribe a client to a topic. */
	subscribe(client: WsClient, topic: string): boolean {
		const topics = this.clients.get(client);
		if (!topics) return false;
		topics.add(topic);
		return true;
	}

	/** Unsubscribe a client from a topic. */
	unsubscribe(client: WsClient, topic: string): boolean {
		const topics = this.clients.get(client);
		if (!topics) return false;
		topics.delete(topic);
		return true;
	}

	/** Broadcast a message to all clients subscribed to a topic. */
	broadcast(topic: string, data: string): void {
		for (const [client, topics] of this.clients) {
			if (topics.has(topic)) {
				client.send(data);
			}
		}
	}

	/** Get the number of connected clients. */
	get clientCount(): number {
		return this.clients.size;
	}
}
