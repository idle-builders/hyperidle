import { type HyperIdleDb, sessions } from "@hyperidle/db";
import type {
	AgentSessionSourceCorrelation,
	DomainEvent,
	EventBus,
	EventByType,
	EventType,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { SubscribeAuthorizerDeps } from "./ports.js";

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
	canSubscribe(senderId: string, topic: string): Promise<boolean>;
}

/**
 * Declarative event→topic route table for the (b) discrete-state-change
 * concern (AU21 Decision E). Adding a new forwarded event is a one-row edit
 * here — no new `unsubN` variable, no new push() call.
 *
 * Static-topic entries use `() => topic`. Dynamic-topic entries cast the
 * base `DomainEvent` to the specific event type — safe because the eventName
 * discriminant guarantees the runtime type. `deriveId`, when present, carries
 * the scoping id (e.g. threadId) into the minimal invalidation envelope so a
 * thread-scoped consumer can still filter without needing the full payload.
 *
 * @lore AU20 Ab2: replaces the 16 imperative eventBus.on() blocks that
 * previously lived in WsBroadcaster.start(). This is the INSIDE analog of
 * the "parameterize, don't multiply" rule (§3 Inside Lens in the spec).
 *
 * @lore AU21 Decision E / Increment 7: these routes used to forward the full
 * domain-event JSON. Traced against every real frontend consumer
 * (useConversationsThreads/useThreadDetail/useAssistantThread) — none reads
 * payload content, only `type`/id fields to trigger a re-fetch — so this
 * collapses to a minimal `{ type: "invalidate", topic, kind, id? }` envelope.
 * `cost_cap_warning`'s forward is deleted entirely: notifications already own
 * that event on its own domain-specific channel, and Increment 6's
 * `AgentOrchestrationPort` is the real cost read door now — nothing consumed
 * the WS copy as a cost signal.
 */
const BROADCAST_ROUTES: ReadonlyArray<{
	readonly eventName: EventType;
	readonly deriveTopic: (event: DomainEvent) => string;
	readonly deriveId?: (event: DomainEvent) => string;
}> = [
	// Global topic: conversations
	{ eventName: "item_created", deriveTopic: () => "conversations" },
	{ eventName: "knowledge_updated", deriveTopic: () => "conversations" },
	{ eventName: "thread_created", deriveTopic: () => "conversations" },
	// Global topic: work
	{ eventName: "task_state_changed", deriveTopic: () => "work" },
	{ eventName: "bet_state_changed", deriveTopic: () => "work" },
	{ eventName: "propagation_applied", deriveTopic: () => "work" },
	{ eventName: "propagation_failed", deriveTopic: () => "work" },
	// R6: artifact_created goes to 'work' so the UI can invalidate artifact
	// galleries (WorkBet ArtifactSection, WorkPortfolio artifact gallery).
	// @lore R6 W-3: no client subscribes to this yet — forward-compatible infra.
	{ eventName: "artifact_created", deriveTopic: () => "work" },
	// Per-thread topics: thread:<id>
	// L1a — Thread primitive events (plan §6.2 / §6.3). Per-thread topic
	// `thread:<id>` carries everything that mutates an open thread.
	{
		eventName: "thread_message_appended",
		deriveTopic: (e) => `thread:${(e as EventByType<"thread_message_appended">).threadId}`,
		deriveId: (e) => (e as EventByType<"thread_message_appended">).threadId,
	},
	{
		eventName: "thread_resolved",
		deriveTopic: (e) => `thread:${(e as EventByType<"thread_resolved">).threadId}`,
		deriveId: (e) => (e as EventByType<"thread_resolved">).threadId,
	},
	{
		eventName: "thread_reopened",
		deriveTopic: (e) => `thread:${(e as EventByType<"thread_reopened">).threadId}`,
		deriveId: (e) => (e as EventByType<"thread_reopened">).threadId,
	},
	{
		eventName: "thread_archived",
		deriveTopic: (e) => `thread:${(e as EventByType<"thread_archived">).threadId}`,
		deriveId: (e) => (e as EventByType<"thread_archived">).threadId,
	},
];

/**
 * Per-session topics (session:<id>) — the (c) session/harness-streaming
 * concern (AU21 Decision E) — are NOT forwarded by this generic broadcaster
 * anymore. That forwarding relocated to core-api's own
 * `session-activity-gateway.ts` (`registerSessionActivityGateway`), which
 * represents agent-orchestration's gateway/router role over the relocated
 * `SessionActivityBuffer` (`@hyperidle/agent-execution`) — see
 * `ws-broadcaster.no-session-forwarding.test.ts` for the pinned negative
 * proof and `session-activity-gateway.integration.test.ts` for the positive
 * half. `WsBroadcaster` still carries the topic/subscribe/broadcast
 * mechanics any consumer (including that gateway) can drive — it just no
 * longer owns any single concern's event→topic routing table for this
 * concern.
 */

/** The minimal invalidation-signal envelope forwarded on BROADCAST_ROUTES topics. */
interface InvalidationEnvelope {
	readonly type: "invalidate";
	readonly topic: string;
	readonly kind: EventType;
	readonly id?: string;
}

export class WsBroadcaster {
	private clients = new Map<WsClient, Set<string>>();
	private clientIdentities = new Map<WsClient, string>();
	private unsubscribers: Array<() => void> = [];

	constructor(
		private readonly eventBus: EventBus,
		private readonly authorizer?: SubscribeAuthorizer,
	) {}

	/**
	 * Wire up event bus subscriptions for forwarding via the declarative
	 * BROADCAST_ROUTES table. Adding a new forwarded event is a one-row
	 * table edit, not a new unsubN variable threaded into the push() list.
	 *
	 * @lore I6: forward additional domain events so the UI can react
	 * to task/bet state changes in real time.
	 * @lore AU20 Ab2: replaced 16 imperative on() blocks with a single loop
	 * over BROADCAST_ROUTES — zero behavior change, sub-linear growth.
	 * @lore AU21 Decision E / Increment 7: BROADCAST_ROUTES entries now
	 * forward the minimal `InvalidationEnvelope`, not the raw event. Session
	 * topics (`session:<id>`) are no longer forwarded by this class at all —
	 * that forwarding relocated to `session-activity-gateway.ts`'s
	 * `registerSessionActivityGateway`, which drives this same class's
	 * `broadcast()` method from the outside instead of owning a route table
	 * entry here.
	 */
	start(): void {
		for (const { eventName, deriveTopic, deriveId } of BROADCAST_ROUTES) {
			this.unsubscribers.push(
				this.eventBus.on(eventName, (event) => {
					const topic = deriveTopic(event);
					const envelope: InvalidationEnvelope = deriveId
						? { type: "invalidate", topic, kind: event.type, id: deriveId(event) }
						: { type: "invalidate", topic, kind: event.type };
					this.broadcast(topic, JSON.stringify(envelope));
				}),
			);
		}
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
 * topic membership is cached in `WsBroadcaster`'s set.
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
