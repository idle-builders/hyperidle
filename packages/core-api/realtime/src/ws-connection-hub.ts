import { type HyperIdleDb, sessions } from "@hyperidle/db";
import type { AgentSessionSourceCorrelation } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { SubscribeAuthorizerDeps } from "./ports.js";

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
 * knowledge, no EventBus dependency of its own. Real per-domain push sites:
 * `packages/core-api/src/routes/threads.ts` (per-thread + conversations-list,
 * called directly at the same write that has the full record in hand) and
 * `packages/core-api/src/services/work-state-push-gateway.ts` (task/bet
 * state — the event already carries `toState`, so a thin EventBus-driven
 * forwarder suffices, same shape as `session-activity-gateway.ts`'s (c)
 * concern). `item_created`/`knowledge_updated`/`artifact_created`/
 * `propagation_applied`/`propagation_failed` had zero real frontend
 * consumers (verified) and are dropped entirely, not re-homed.
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

/**
 * Build an authorizer that allows:
 *  - any authenticated identity to subscribe to global topics
 *    (`conversations`, `work`)
 *  - only thread participants to subscribe to `thread:<id>` topics
 *
 * @lore L1 step9 (Adv-C1): subscribe authorization for per-thread topics is
 * the L1a §6.2 contract. The DB lookup is one-shot per subscribe call;
 * topic membership is cached in `WsConnectionHub`'s set.
 *
 * @lore AU19 Increment 2f: `deps` is the Mechanism C DI bundle for this
 * Service's four real outbound edges (`conversation`/`users`/`org`/`work` —
 * see `ports.ts`'s top comment for the census correction that added `org`).
 * `sessions` stays a direct `@hyperidle/db` read — it is in
 * `UNOWNED_SHARED_TABLES`, not owned by any single Service.
 */
export function createDbSubscribeAuthorizer(
	db: HyperIdleDb,
	deps: SubscribeAuthorizerDeps,
): SubscribeAuthorizer {
	const GLOBAL_TOPICS = new Set(["conversations", "work"]);
	async function senderInThread(senderId: string, threadId: string): Promise<boolean> {
		const row = await deps.conversation.getThreadById(db, threadId);
		if (!row) return false;
		try {
			const parts = JSON.parse(row.participants);
			return Array.isArray(parts) && parts.includes(senderId);
		} catch {
			return false;
		}
	}
	async function senderInTeam(senderId: string, teamId: string): Promise<boolean> {
		const sender = await deps.users.getUserById(db, senderId);
		if (!sender?.teamId) return false;
		const membership = await deps.org.getTeamMembersById(db, sender.teamId);
		return membership?.teamId === teamId;
	}
	async function canSubscribeToTaskFreeSession(
		senderId: string,
		sessionRow: typeof sessions.$inferSelect,
	): Promise<boolean> {
		if (!(sessionRow.sourceKind && sessionRow.sourceCorrelationJson)) return false;
		let correlation: AgentSessionSourceCorrelation;
		try {
			correlation = JSON.parse(sessionRow.sourceCorrelationJson) as AgentSessionSourceCorrelation;
		} catch {
			return false;
		}
		if ("userId" in correlation && correlation.userId === senderId) return true;
		if ("threadId" in correlation) return senderInThread(senderId, correlation.threadId);
		if ("teamId" in correlation && correlation.teamId) {
			return senderInTeam(senderId, correlation.teamId);
		}
		return false;
	}
	return {
		async canSubscribe(senderId: string, topic: string): Promise<boolean> {
			if (GLOBAL_TOPICS.has(topic)) return true;
			// Q1 §3.4 / AF11 Hole 1 (WS): session topics are host-scope — any authenticated
			// principal may observe a valid session. However, the session must EXIST and its
			// task host must be resolvable; a non-existent or host-unresolvable session now
			// denies (fail-closed), rather than the prior "ok-for-any-non-empty-id" bypass.
			//
			// @lore AF11: The prior `return sessionId.length > 0` allowed subscription to
			// any session topic regardless of existence — an accidental bypass of read-parity.
			// Valid sessions still return true (host-scope = true); only non-existent or
			// unresolvable sessions now return false.
			if (topic.startsWith("session:")) {
				const sessionId = topic.slice("session:".length);
				if (!sessionId) return false;

				// Load the session row
				const [sessionRow] = await db
					.select()
					.from(sessions)
					.where(eq(sessions.id, sessionId))
					.limit(1);
				if (!sessionRow) return false;
				if (!sessionRow.taskId) return canSubscribeToTaskFreeSession(senderId, sessionRow);

				// Resolve the task host to verify it exists and confirm host-scope
				const taskRow = await deps.work.getTaskById(db, sessionRow.taskId);
				// Task must exist; host-scope = any authenticated principal → true
				return taskRow !== undefined;
			}
			if (!topic.startsWith("thread:")) return false;
			const threadId = topic.slice("thread:".length);
			if (!threadId) return false;
			return senderInThread(senderId, threadId);
		},
	};
}
