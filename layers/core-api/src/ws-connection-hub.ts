/** Pure connection/subscription/broadcast transport — no event routing, no domain knowledge. Every domain that wants to push calls `broadcast(topic, data)` directly. */
export interface WsClient {
	send(data: string): void;
}

/** Result of a subscribe attempt. `forbidden` = not authorized; `unknown_client` = never registered via `addClient`. */
export type SubscribeResult = "ok" | "forbidden" | "unknown_client";

/** The authorization seam `createDbSubscribeAuthorizer` (ws-subscribe-authorizer.ts) satisfies. */
export interface SubscribeAuthorizer {
	canSubscribe(senderId: string, topic: string): Promise<boolean>;
}

export class WsConnectionHub {
	private clients = new Map<WsClient, Set<string>>();
	private clientIdentities = new Map<WsClient, string>();

	constructor(private readonly authorizer?: SubscribeAuthorizer) {}

	/** Register a new client. The `senderId` is the authenticated identity. */
	addClient(client: WsClient, senderId?: string): void {
		this.clients.set(client, new Set());
		if (senderId) {
			this.clientIdentities.set(client, senderId);
		}
	}

	/** Remove a client. */
	removeClient(client: WsClient): void {
		this.clients.delete(client);
		this.clientIdentities.delete(client);
	}

	/**
	 * Subscribe a client to a topic. For `thread:<id>` topics, verifies the client's authenticated
	 * identity is a participant — without this check any authenticated WS client could subscribe
	 * to any thread, bypassing the REST-side participant guard.
	 */
	async subscribe(client: WsClient, topic: string): Promise<SubscribeResult> {
		const topics = this.clients.get(client);
		if (!topics) return "unknown_client";
		if (this.authorizer) {
			const senderId = this.clientIdentities.get(client);
			if (!senderId) return "forbidden";
			if (!(await this.authorizer.canSubscribe(senderId, topic))) {
				return "forbidden";
			}
		}
		topics.add(topic);
		return "ok";
	}

	/** Unsubscribe a client from a topic. */
	unsubscribe(client: WsClient, topic: string): SubscribeResult {
		const topics = this.clients.get(client);
		if (!topics) return "unknown_client";
		topics.delete(topic);
		return "ok";
	}

	/** Broadcast a message to all clients subscribed to a topic. */
	broadcast(topic: string, data: string): void {
		for (const [client, topics] of this.clients) {
			if (topics.has(topic)) {
				try {
					client.send(data);
				} catch {
					// Isolate per-client errors so one broken socket doesn't abort the broadcast loop.
					this.clients.delete(client);
				}
			}
		}
	}

	/** Get the number of connected clients. */
	get clientCount(): number {
		return this.clients.size;
	}
}
