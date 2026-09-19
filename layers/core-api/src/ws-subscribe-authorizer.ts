/**
 * `createDbSubscribeAuthorizer` — WS topic authorization for core-api's OWN
 * topics, and the Mechanism-C DI port it needs.
 *
 * @lore AU26 C3 (§D-E): moved VERBATIM out of the dissolved
 * `@hyperidle/realtime` package (its `ws-connection-hub.ts` + `ports.ts`).
 *
 * @lore AU26 J3 (founder, verbatim): *"session dial in is 1000% orchestration
 * and has nothing to do with core. core should not know about this session live
 * stuff at all."* The whole `session:<id>` branch is GONE from this file, and
 * with it:
 *   - the direct `sessions` read (an `agent-orchestration` table);
 *   - the `work` port (`RealtimeTaskReader`) — its only caller was the
 *     task-backed session check, which AU26 also proved redundant
 *     (`sessions.taskId` is an FK to `tasks.id` with `onDelete:"restrict"`,
 *     `framework/db/src/schema.ts:229`, so a non-null `taskId` implies the task
 *     exists; the check admitted every authenticated principal anyway);
 *   - the `users` and `org` ports — their only caller was `senderInTeam`, whose
 *     only caller was the task-free-session branch.
 *
 * What remains is what this file was named for: thread topics. Core's socket
 * serves `conversations` and `thread:<id>`; `agent-orchestration` serves
 * `session:<id>` on its own socket, authorized from its own table
 * (`agent-orchestration/src/services/session-stream-hub.ts`).
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { canReadThread, type HostKind } from "@hyperidle/domain-model";
import type { SubscribeAuthorizer } from "./ws-connection-hub.js";

// ---------------------------------------------------------------------------
// conversation — RealtimeThreadReader (ordinary downward core-api edge)
// Internal: callers satisfy SubscribeAuthorizerDeps structurally; they never
// need to name the leaf port types. @lore AU20 Ab2: collapsed from public
// surface to file-internal per the 12→5 barrel collapse.
// ---------------------------------------------------------------------------

/**
 * Structural mirror of `@hyperidle/thread`'s `Thread` row, narrowed to what
 * `canReadThread` needs.
 *
 * @lore BC3 bug fix: this used to be narrowed to `participants` alone, so
 * `senderInThread` below applied a plain membership check with no host-scoped
 * bypass — every `thread:<id>` subscribe on a `team`/`knowledge_item`/
 * `factory`-hosted thread (any signed-in user can READ these per
 * `canReadThread`, e.g. every task thread — BC3 re-hosted `task` onto
 * `team`) was silently refused for a signed-in non-participant, even though
 * `open_thread` itself would have let them read it. The client has no retry
 * or error surface for a `forbidden` subscribe ack (`ws-client.ts`), so the
 * symptom was total silence: the socket looked connected, no frame ever
 * arrived. Now mirrors `canReadThread`'s own rule exactly instead of
 * re-deriving a narrower one.
 */
interface RealtimeThreadRow {
	readonly hostKind: string;
	readonly participants: string;
}

/** Port for `conversation`'s thread read `senderInThread` calls directly today (§10.2 line 385). */
interface RealtimeThreadReader {
	getThreadById(db: HyperIdleDb, id: string): Promise<RealtimeThreadRow | undefined>;
}

// ---------------------------------------------------------------------------
// Aggregate deps bundle
// ---------------------------------------------------------------------------

/**
 * Deps `createDbSubscribeAuthorizer` needs — its one real outbound edge.
 *
 * @lore AU26 J3: was four (`conversation`/`users`/`org`/`work`). Three of them
 * existed only to serve the `session:<id>` branch that moved to
 * `agent-orchestration`; they went with it.
 */
export interface SubscribeAuthorizerDeps {
	readonly conversation: RealtimeThreadReader;
}

/**
 * Build an authorizer that allows:
 *  - any authenticated identity to subscribe to global topics
 *    (`conversations`)
 *  - subscribe to `thread:<id>` topics exactly who `canReadThread` would let
 *    read that thread — a host-scoped thread (`team`/`knowledge_item`/
 *    `factory`) admits any signed-in identity; a `user`/`agent`-hosted
 *    (direct) thread admits only its members.
 *
 * Everything else — including `session:<id>`, which this socket no longer
 * carries — is denied.
 *
 * @lore L1 step9 (Adv-C1): subscribe authorization for per-thread topics is
 * the L1a §6.2 contract. The DB lookup is one-shot per subscribe call;
 * topic membership is cached in `WsConnectionHub`'s set.
 *
 * @lore AU19 Increment 2f: `deps` is the Mechanism C DI bundle for this
 * Service's real outbound edge (`conversation`).
 */
export function createDbSubscribeAuthorizer(
	db: HyperIdleDb,
	deps: SubscribeAuthorizerDeps,
): SubscribeAuthorizer {
	const GLOBAL_TOPICS = new Set(["conversations"]);
	async function senderInThread(senderId: string, threadId: string): Promise<boolean> {
		const row = await deps.conversation.getThreadById(db, threadId);
		if (!row) return false;
		try {
			const parts = JSON.parse(row.participants);
			if (!Array.isArray(parts)) return false;
			return canReadThread(senderId, { hostKind: row.hostKind as HostKind, members: parts });
		} catch {
			return false;
		}
	}
	return {
		async canSubscribe(senderId: string, topic: string): Promise<boolean> {
			if (GLOBAL_TOPICS.has(topic)) return true;
			if (!topic.startsWith("thread:")) return false;
			const threadId = topic.slice("thread:".length);
			if (!threadId) return false;
			return senderInThread(senderId, threadId);
		},
	};
}
