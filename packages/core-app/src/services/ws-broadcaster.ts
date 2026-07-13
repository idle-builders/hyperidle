import { type HyperIdleDb, sessions, teamMembers } from "@hyperidle/db";
import type { AgentSessionSourceCorrelation, EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import * as work from "../work-service.js";
import { getThreadById } from "./conversation-store.js";
import { getUserById } from "./user-store.js";

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
			this.broadcast("work", JSON.stringify(event));
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
		// propagation_failed goes to 'work' alongside propagation_applied so the UI can surface the failure.
		const unsub11 = this.eventBus.on("propagation_applied", (event) => {
			this.broadcast("work", JSON.stringify(event));
		});
		const unsub12 = this.eventBus.on("propagation_failed", (event) => {
			this.broadcast("work", JSON.stringify(event));
		});

		// R6: artifact_created goes to 'work' so the UI can invalidate artifact
		// galleries (WorkBet ArtifactSection, WorkPortfolio artifact gallery).
		// @lore R6 W-3: no client subscribes to this yet — it's forward-compatible
		// infrastructure. Don't debug "why doesn't UI update."
		const unsubArtifact = this.eventBus.on("artifact_created", (event) => {
			this.broadcast("work", JSON.stringify(event));
		});

		// Q1 §3.4: forward session lifecycle and tool-call events to per-session
		// topic `session:<sessionId>`. Any authenticated client may subscribe —
		// observe mode is read-only and not gated by participant membership.
		const unsub13 = this.eventBus.on("session_started", (event) => {
			this.broadcast(`session:${event.sessionId}`, JSON.stringify(event));
		});
		const unsub14 = this.eventBus.on("session_ended", (event) => {
			this.broadcast(`session:${event.sessionId}`, JSON.stringify(event));
		});
		const unsub15 = this.eventBus.on("tool_call_recorded", (event) => {
			this.broadcast(`session:${event.sessionId}`, JSON.stringify(event));
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
			unsub13,
			unsub14,
			unsub15,
			unsubArtifact,
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
 */
export function createDbSubscribeAuthorizer(db: HyperIdleDb): SubscribeAuthorizer {
	const GLOBAL_TOPICS = new Set(["conversations", "work"]);
	async function senderInThread(senderId: string, threadId: string): Promise<boolean> {
		const row = await getThreadById(db, threadId);
		if (!row) return false;
		try {
			const parts = JSON.parse(row.participants);
			return Array.isArray(parts) && parts.includes(senderId);
		} catch {
			return false;
		}
	}
	async function senderInTeam(senderId: string, teamId: string): Promise<boolean> {
		const sender = await getUserById(db, senderId);
		if (!sender?.teamId) return false;
		const [membership] = await db
			.select({ teamId: teamMembers.teamId })
			.from(teamMembers)
			.where(eq(teamMembers.id, sender.teamId))
			.limit(1);
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
				const taskRow = await work.getTaskById(db, sessionRow.taskId);
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
