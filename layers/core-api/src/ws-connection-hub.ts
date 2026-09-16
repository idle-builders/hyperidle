/**
 * `WsConnectionHub` — the single WebSocket connection/subscription/broadcast
 * transport for the whole Application.
 *
 * @lore AU26 C3 (§D-E): this file used to be its own package,
 * `@hyperidle/realtime`. The verdict was **dissolves**: it owned zero tables,
 * did zero event routing (AU21 L4 deleted the forwarder), its own header called
 * it "a dumb pub/sub socket transport", and its other three callers each
 * declared a local one-method `{ broadcast(topic, data) }` interface
 * specifically to avoid depending on it. It could NOT move to
 * `agent-orchestration`: its production topics are core-domain
 * (`thread:<id>` and `conversations` from `routes/threads.ts`). So it lands
 * here, in the `core-api` Layer, as Layer transport — not a Service. The
 * three local `{ broadcast }`
 * structural interfaces stay exactly as they are; they are already the right
 * shape, and `agent-orchestration` receives that one-method sink injected by
 * the Application, so there is still exactly ONE WS listener and ONE topic
 * space.
 */

/**
 * Manages WebSocket topic subscriptions and broadcasting. A dumb pub/sub
 * socket transport — it owns zero event→topic routing of its own; every
 * domain that wants to push data onto a topic calls `broadcast(topic, data)`
 * directly (or drives it via its own small EventBus-subscribed forwarder,
 * same shape as `session-activity-gateway.ts`).
 *
 * @lore AU21 §6 Decision L4 / §9 Increment 14d: this class used to be
 * `WsBroadcaster` and carried BOTH this transport role AND a generic
 * `BROADCAST_ROUTES` event→topic forwarder (the (b) discrete-state-change
 * concern, Decision E). The founder's re-derivation ("there is no refetch …
 * core submits the changed version … zero ways back") requires the actual
 * changed record to be pushed, not a re-fetch-triggering ping — a shape the
 * generic table structurally could not produce (its events don't all carry
 * the full changed data; some domains need the CALLER's in-hand DB row, e.g.
 * a new `Message`, that never reaches the EventBus at all). The generic
 * forwarder + its `start()`/`stop()` lifecycle are DELETED outright; this
 * class is renamed to `WsConnectionHub` to honestly describe what remains —
 * pure connection/subscription/authz/broadcast transport, no domain
 * knowledge, no EventBus dependency of its own. Real per-domain push site:
 * `layers/core-api/src/routes/threads.ts` (per-thread + conversations-list,
 * called directly at the same write that has the full record in hand).
 * `item_created`/`knowledge_updated`/`artifact_created`/
 * `propagation_applied`/`propagation_failed` had zero real frontend
 * consumers (verified) and are dropped entirely, not re-homed.
 * @lore BC1: the `work`-topic push forwarder (`work-state-push-gateway.ts`)
 * is deleted too — zero production frontend ever subscribed to `work`.
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
