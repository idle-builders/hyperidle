import { type HyperIdleDb, threads } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";

/**
 * Manages WebSocket topic subscriptions and event broadcasting.
 * Extracted from ws.ts route for testability and runtime independence.
 */
export interface WsClient {
	send(data: string): void;
}

/**
 * Result of a subscribe attempt. `forbidden` means the caller is not
 * authorized to receive the topic (e.g., not a thread participant).
 *
 * @lore L1 step9 (Adv-C1): a subscribe call previously returned `boolean`
 * (success vs unknown-client). L1a §6.2 requires participant-only access
 * to per-thread topics; the subscribe path now needs a third "forbidden"
 * outcome distinguishable by the caller so the WS handler can reply with
 * a structured `{error: "forbidden"}` frame.
 */
export type SubscribeResult = "ok" | "forbidden" | "unknown_client";

interface SubscribeAuthorizer {
	canSubscribe(senderId: string, topic: string): boolean;
}

export class WsBroadcaster {
	private clients = new Map<WsClient, Set<string>>();
	private clientIdentities = new Map<WsClient, string>();
	private unsubscribers: Array<() => void> = [];

	constructor(
		private readonly eventBus: EventBus,
		private readonly authorizer?: SubscribeAuthorizer,
	) {}

	/** Wire up event bus subscriptions for forwarding. */
	start(): void {
		const unsub1 = this.eventBus.on("item_created", (event) => {
			this.broadcast("conversations", JSON.stringify(event));
		});

		const unsub2 = this.eventBus.on("knowledge_updated", (event) => {
			this.broadcast("conversations", JSON.stringify(event));
		});

		// @lore I6: forward additional domain events so the UI can react
		// to task/bet state changes and cost warnings in real time.
		const unsub3 = this.eventBus.on("task_state_changed", (event) => {
			this.broadcast("work", JSON.stringify(event));
		});

		const unsub4 = this.eventBus.on("bet_state_changed", (event) => {
			this.broadcast("work", JSON.stringify(event));
		});

		const unsub5 = this.eventBus.on("cost_cap_warning", (event) => {
			this.broadcast("rail", JSON.stringify(event));
		});

		// L1a — Thread primitive events (plan §6.2 / §6.3). Per-thread topic
		// `thread:<id>` carries everything that mutates an open thread; the
		// thread-list channel `'conversations'` carries `thread_created` so
		// the Submenu refreshes.
		const unsub6 = this.eventBus.on("thread_created", (event) => {
			this.broadcast("conversations", JSON.stringify(event));
		});
		const unsub7 = this.eventBus.on("thread_message_appended", (event) => {
			this.broadcast(`thread:${event.threadId}`, JSON.stringify(event));
		});
		const unsub8 = this.eventBus.on("thread_resolved", (event) => {
			this.broadcast(`thread:${event.threadId}`, JSON.stringify(event));
		});
		const unsub9 = this.eventBus.on("thread_reopened", (event) => {
			this.broadcast(`thread:${event.threadId}`, JSON.stringify(event));
		});
		const unsub10 = this.eventBus.on("thread_archived", (event) => {
			this.broadcast(`thread:${event.threadId}`, JSON.stringify(event));
		});

		// L20: propagation_applied goes to 'work' so the UI can invalidate data.
		// propagation_failed goes to 'rail' so the notification system picks it up.
		const unsub11 = this.eventBus.on("propagation_applied", (event) => {
			this.broadcast("work", JSON.stringify(event));
		});
		const unsub12 = this.eventBus.on("propagation_failed", (event) => {
			this.broadcast("rail", JSON.stringify(event));
		});

		this.unsubscribers.push(
			unsub1,
			unsub2,
			unsub3,
			unsub4,
			unsub5,
			unsub6,
			unsub7,
			unsub8,
			unsub9,
			unsub10,
			unsub11,
			unsub12,
		);
	}

	/** Stop forwarding events. */
	stop(): void {
		for (const unsub of this.unsubscribers) {
			unsub();
		}
		this.unsubscribers = [];
	}

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
	 * Subscribe a client to a topic. For per-thread topics (`thread:<id>`),
	 * verifies that the client's authenticated identity is in
	 * `threads.participants`. Returns `forbidden` if not authorized,
	 * `unknown_client` if the client was never `addClient`-ed, `ok` on success.
	 *
	 * @lore L1 step9 (Adv-C1): the L1a contract requires participant-only
	 * access to `thread:<id>` topics. Without this check, any authenticated
	 * WS client could subscribe to any thread and receive every append /
	 * resolve / reopen event — a confidentiality bypass that survived the
	 * REST-side participant guard in `routes/threads.ts`.
	 */
	subscribe(client: WsClient, topic: string): SubscribeResult {
		const topics = this.clients.get(client);
		if (!topics) return "unknown_client";
		if (this.authorizer) {
			const senderId = this.clientIdentities.get(client);
			if (!senderId) return "forbidden";
			if (!this.authorizer.canSubscribe(senderId, topic)) {
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
					// @lore I6: isolate per-client errors so one broken socket
					// doesn't abort the broadcast loop. Remove the dead client.
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

/**
 * Build an authorizer that allows:
 *  - any authenticated identity to subscribe to global topics
 *    (`conversations`, `work`, `rail`)
 *  - only thread participants to subscribe to `thread:<id>` topics
 *
 * @lore L1 step9 (Adv-C1): subscribe authorization for per-thread topics is
 * the L1a §6.2 contract. The DB lookup is one-shot per subscribe call;
 * topic membership is cached in `WsBroadcaster`'s set.
 */
export function createDbSubscribeAuthorizer(db: HyperIdleDb): SubscribeAuthorizer {
	const GLOBAL_TOPICS = new Set(["conversations", "work", "rail"]);
	return {
		canSubscribe(senderId: string, topic: string): boolean {
			if (GLOBAL_TOPICS.has(topic)) return true;
			if (!topic.startsWith("thread:")) return false;
			const threadId = topic.slice("thread:".length);
			if (!threadId) return false;
			const row = db.select().from(threads).where(eq(threads.id, threadId)).get();
			if (!row) return false;
			try {
				const parts = JSON.parse(row.participants);
				return Array.isArray(parts) && parts.includes(senderId);
			} catch {
				return false;
			}
		},
	};
}
