/**
 * `SessionStreamHub` — the live agent-run stream's own WebSocket transport,
 * owned by the Layer that owns the run.
 *
 * @lore AU26 J3 (founder, verbatim): *"session dial in is 1000% orchestration
 * and has nothing to do with core. core should not know about this session live
 * stuff at all."* The `session:<id>` topic used to live on core-api's
 * `WsConnectionHub`, authorized by a core-api file that read the `sessions`
 * table plus `threads` + `users` + `team_members`. Both halves moved: this Layer
 * now serves the stream on its own app, and core's socket keeps only its own
 * topics (`thread:<id>`, `conversations`, `work`). Core-api's
 * `ws-subscribe-authorizer.ts` sheds its `sessions` read, its `work` edge, and
 * (because they were only ever reached from the session branch) its `users` and
 * `org` edges too.
 *
 * @lore AU26 J3: this is deliberately NOT a re-use of core-api's
 * `WsConnectionHub`. Importing it would be an `agent-orchestration -> core-api`
 * edge — the exact direction this work package exists to delete, and the
 * composition-edge anti-regrowth guard fires on it. The transport is small, and
 * owning it is the point: one topic family, one authorization rule, one owner.
 *
 * **Authorization: an authenticated user, plus the run exists.** Nothing else,
 * and no core table. That is what the core-hosted check already amounted to on
 * the task-backed path — it read the run, read the run's task, and returned
 * "the task exists", which every authenticated principal passes. The
 * `threads`/`users`/`team_members` reads only ever fired for task-free runs.
 * A partial owner check (`sourceCorrelationJson.userId === senderId`) was
 * considered and rejected: only the `assistant` correlation carries a `userId`,
 * so a task-free `routine`/`knowledge` run — which the old team fallback
 * admitted — would start denying, a real regression in what a user can watch.
 * The accepted residue is the one the founder named explicitly: in a shared
 * deployment a second logged-in user holding a run's `randomUUID` could watch a
 * tool-name-and-scrubbed-summary stream of someone else's assistant run.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { findSessionById } from "@hyperidle/run-orchestration";

/** The minimal socket surface the hub writes to. */
export interface SessionStreamClient {
	send(data: string): void;
}

/**
 * Result of a subscribe attempt. `forbidden` means the caller is not authorized
 * for the topic; `unknown_client` means the socket was never registered.
 */
export type SessionStreamSubscribeResult = "ok" | "forbidden" | "unknown_client";

/** The authorization seam `SessionStreamHub` consults on every subscribe. */
export interface SessionStreamAuthorizer {
	canSubscribe(senderId: string | undefined, topic: string): Promise<boolean>;
}

const SESSION_TOPIC_PREFIX = "session:";

/**
 * Build the production authorizer: the topic must be `session:<id>`, the caller
 * must be an authenticated identity, and the run must exist — asked of
 * `run-orchestration`, which owns `sessions`. Fail-closed: the accessor returns
 * `undefined` for an unknown run rather than throwing, so a miss denies.
 */
export function createRunStreamSubscribeAuthorizer(db: HyperIdleDb): SessionStreamAuthorizer {
	return {
		async canSubscribe(senderId: string | undefined, topic: string): Promise<boolean> {
			// Core's own topics are not served here — this socket carries exactly
			// one topic family.
			if (!topic.startsWith(SESSION_TOPIC_PREFIX)) return false;
			const sessionId = topic.slice(SESSION_TOPIC_PREFIX.length);
			if (!sessionId) return false;
			if (!senderId) return false;
			return (await findSessionById(db, sessionId)) !== undefined;
		},
	};
}

/**
 * Connection / subscription / broadcast mechanics for the `session:<id>` topic
 * family. A dumb pub/sub transport: it owns no event→topic routing of its own —
 * `session-activity-gateway.ts` tees the three live event types onto it.
 */
export class SessionStreamHub {
	private readonly clients = new Map<SessionStreamClient, Set<string>>();
	private readonly clientIdentities = new Map<SessionStreamClient, string>();

	constructor(private readonly authorizer: SessionStreamAuthorizer) {}

	/** Register a socket. `senderId` is the authenticated identity behind it. */
	addClient(client: SessionStreamClient, senderId?: string): void {
		this.clients.set(client, new Set());
		if (senderId) {
			this.clientIdentities.set(client, senderId);
		}
	}

	/** Drop a socket and every subscription it held. */
	removeClient(client: SessionStreamClient): void {
		this.clients.delete(client);
		this.clientIdentities.delete(client);
	}

	/** Join a topic, subject to the authorizer. */
	async subscribe(
		client: SessionStreamClient,
		topic: string,
	): Promise<SessionStreamSubscribeResult> {
		const topics = this.clients.get(client);
		if (!topics) return "unknown_client";
		const senderId = this.clientIdentities.get(client);
		if (!(await this.authorizer.canSubscribe(senderId, topic))) {
			return "forbidden";
		}
		topics.add(topic);
		return "ok";
	}

	/** Leave a topic. */
	unsubscribe(client: SessionStreamClient, topic: string): SessionStreamSubscribeResult {
		const topics = this.clients.get(client);
		if (!topics) return "unknown_client";
		topics.delete(topic);
		return "ok";
	}

	/** Send to every socket currently joined to `topic`. */
	broadcast(topic: string, data: string): void {
		for (const [client, topics] of this.clients) {
			if (!topics.has(topic)) continue;
			try {
				client.send(data);
			} catch {
				// Isolate per-client failures so one broken socket does not abort
				// the loop. Drop the dead client.
				this.clients.delete(client);
				this.clientIdentities.delete(client);
			}
		}
	}

	/** Number of registered sockets. */
	get clientCount(): number {
		return this.clients.size;
	}
}
