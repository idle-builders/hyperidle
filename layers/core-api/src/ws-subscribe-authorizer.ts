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
 * What remains is what this file was named for: thread and document topics.
 * Core's socket serves `conversations`, `thread:<id>`, `documents` and
 * `document:<id>`; `agent-orchestration` serves `session:<id>` on its own
 * socket, authorized from its own table
 * (`agent-orchestration/src/services/session-stream-hub.ts`).
 *
 * @lore BC4 architecture.md §7: `document:<id>` and `documents` (the twin of
 * `conversations`) added. The subscribe rule is exactly `open_document`'s own
 * visibility predicate — `canReadDocument`, a pure function shared with
 * `document-actions.ts` (`@hyperidle/domain-model`) so the socket and the
 * read can never diverge, the same divergence BC3's bug fix above (thread
 * host-scoped bypass) already names as the failure mode to avoid.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { canReadDocument, canReadThread, type HostKind } from "@hyperidle/domain-model";
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
 * bypass — every `thread:<id>` subscribe on a `team`/`document`/
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
// document — RealtimeDocumentReader. architecture.md §7: "one new port on
// SubscribeAuthorizerDeps: document: { getForSubscribe(db, id) }, plus the
// owned-agent subject list" — the subject list is the same
// actor-plus-owned-agents resolution `document-actions.ts`'s own
// `resolveViewer` does (§5.1's `:subjects`), so `users` is a second port here.
// ---------------------------------------------------------------------------

/** Structural mirror of `@hyperidle/document`'s `DocumentRow`, narrowed to
 * what `canReadDocument` needs. */
interface RealtimeDocumentRow {
	readonly parentKind: string | null;
	readonly scopeKind: string;
	readonly scopeId: string | null;
	readonly slot: string;
}

/** Port for `document`'s subscribe-time visibility read. */
interface RealtimeDocumentReader {
	getForSubscribe(db: HyperIdleDb, id: string): Promise<RealtimeDocumentRow | undefined>;
}

/** Port for §5.1's `:subjects`/`:viewerTeamId` resolution — the actor plus
 * every agent they own, and the actor's own team. */
interface RealtimeUserReader {
	getUserById(db: HyperIdleDb, id: string): Promise<{ readonly teamId: string | null } | undefined>;
	listOwnedBy(db: HyperIdleDb, ownerId: string): Promise<readonly { readonly id: string }[]>;
}

// ---------------------------------------------------------------------------
// Aggregate deps bundle
// ---------------------------------------------------------------------------

/**
 * Deps `createDbSubscribeAuthorizer` needs — its real outbound edges.
 *
 * @lore AU26 J3: was four (`conversation`/`users`/`org`/`work`). Three of them
 * existed only to serve the `session:<id>` branch that moved to
 * `agent-orchestration`; they went with it. `document`/`users` (architecture.md
 * §7) are new — `users` back because `document:<id>`'s visibility check
 * needs the same subject resolution `document-actions.ts` does, not the
 * session-team check AU26 removed.
 */
export interface SubscribeAuthorizerDeps {
	readonly conversation: RealtimeThreadReader;
	readonly document: RealtimeDocumentReader;
	readonly users: RealtimeUserReader;
}

/**
 * Build an authorizer that allows:
 *  - any authenticated identity to subscribe to global topics
 *    (`conversations`, `documents`)
 *  - subscribe to `thread:<id>` topics exactly who `canReadThread` would let
 *    read that thread — a host-scoped thread (`team`/`document`/
 *    `factory`) admits any signed-in identity; a `user`/`agent`-hosted
 *    (direct) thread admits only its members.
 *  - subscribe to `document:<id>` topics exactly who `canReadDocument` would
 *    let `open_document` it — an artifact (`task`/`thread`-parented) admits
 *    any signed-in identity; a private `user`-scoped memory admits only its
 *    owner (the actor, or the actor's owned agents); a `team`-scoped document
 *    admits only that team.
 *
 * Everything else — including `session:<id>`, which this socket no longer
 * carries — is denied.
 *
 * @lore L1 step9 (Adv-C1): subscribe authorization for per-thread topics is
 * the L1a §6.2 contract. The DB lookup is one-shot per subscribe call;
 * topic membership is cached in `WsConnectionHub`'s set.
 *
 * @lore AU19 Increment 2f: `deps` is the Mechanism C DI bundle for this
 * Service's real outbound edges (`conversation`, `document`, `users`).
 */
export function createDbSubscribeAuthorizer(
	db: HyperIdleDb,
	deps: SubscribeAuthorizerDeps,
): SubscribeAuthorizer {
	const GLOBAL_TOPICS = new Set(["conversations", "documents"]);
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
	/** architecture.md §7/§5.1: the same `:subjects`/`:viewerTeamId` resolution
	 * `document-actions.ts`'s `resolveViewer` does, against `canReadDocument` —
	 * the shared pure predicate — so the socket and the read can never diverge. */
	async function senderCanReadDocument(senderId: string, documentId: string): Promise<boolean> {
		const row = await deps.document.getForSubscribe(db, documentId);
		if (!row) return false;
		const [actorUser, owned] = await Promise.all([
			deps.users.getUserById(db, senderId),
			deps.users.listOwnedBy(db, senderId),
		]);
		const subjects = [senderId, ...owned.map((u) => u.id)];
		const viewerTeamId = actorUser?.teamId ?? null;
		return canReadDocument(subjects, viewerTeamId, row);
	}
	return {
		canSubscribe(senderId: string, topic: string): Promise<boolean> {
			if (GLOBAL_TOPICS.has(topic)) return Promise.resolve(true);
			if (topic.startsWith("thread:")) {
				const threadId = topic.slice("thread:".length);
				if (!threadId) return Promise.resolve(false);
				return senderInThread(senderId, threadId);
			}
			if (topic.startsWith("document:")) {
				const documentId = topic.slice("document:".length);
				if (!documentId) return Promise.resolve(false);
				return senderCanReadDocument(senderId, documentId);
			}
			return Promise.resolve(false);
		},
	};
}
