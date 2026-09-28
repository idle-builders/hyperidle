// @lore: ws-subscribe-authorizer — session:<id> admits any signed-in; document:<id> uses canReadDocument (same as open_document) — socket and REST never diverge

import type { HyperIdleDb } from "@hyperidle/db";
import { canReadDocument, canReadThread, type HostKind } from "@hyperidle/domain-model";
import type { SubscribeAuthorizer } from "./ws-connection-hub.js";

// @lore: thread subscribe uses canReadThread not plain membership — team/document/factory threads admit any signed-in; plain membership silently refuses them
interface RealtimeThreadRow {
	readonly hostKind: string;
	readonly participants: string;
}

/** Port for `conversation`'s thread read. */
interface RealtimeThreadReader {
	getThreadById(db: HyperIdleDb, id: string): Promise<RealtimeThreadRow | undefined>;
}

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

/** Port for subject/viewerTeamId resolution — the actor plus every agent they own, and the actor's team. */
interface RealtimeUserReader {
	getUserById(
		db: HyperIdleDb,
		id: string,
	): Promise<{ readonly teamId: string | null; readonly ownerUserId: string | null } | undefined>;
	listOwnedBy(db: HyperIdleDb, ownerId: string): Promise<readonly { readonly id: string }[]>;
}

// ---------------------------------------------------------------------------
export interface SubscribeAuthorizerDeps {
	readonly conversation: RealtimeThreadReader;
	readonly document: RealtimeDocumentReader;
	readonly users: RealtimeUserReader;
}

/**
 * Build an authorizer:
 *  - global topics (`conversations`, `documents`): any authenticated identity
 *  - `thread:<id>`: exactly who `canReadThread` admits (host-scoped threads admit any signed-in identity; direct threads admit only members)
 *  - `document:<id>`: exactly who `canReadDocument`/`open_document` would admit
 *  - `session:<id>`: any signed-in identity, no DB read
 *  - everything else: denied
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
	/** Same `:subjects`/`:viewerTeamId` resolution `document-actions.ts`'s `resolveViewer` does — uses `canReadDocument` so the socket and the read can never diverge. */
	async function senderCanReadDocument(senderId: string, documentId: string): Promise<boolean> {
		const row = await deps.document.getForSubscribe(db, documentId);
		if (!row) return false;
		const [actorUser, owned] = await Promise.all([
			deps.users.getUserById(db, senderId),
			deps.users.listOwnedBy(db, senderId),
		]);
		const subjects = [senderId, ...owned.map((u) => u.id)];
		let viewerTeamId = actorUser?.teamId ?? null;
		if (viewerTeamId === null && actorUser?.ownerUserId) {
			const owner = await deps.users.getUserById(db, actorUser.ownerUserId);
			viewerTeamId = owner?.teamId ?? null;
		}
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
			if (topic.startsWith("session:")) {
				const sessionId = topic.slice("session:".length);
				return Promise.resolve(Boolean(sessionId));
			}
			// A subscription's inbox nudge — admits only the identity
			// named in the topic itself, no table read (the same "identity
			// alone" rule `session:<id>` already uses).
			if (topic.startsWith("user:")) {
				const userId = topic.slice("user:".length);
				return Promise.resolve(userId.length > 0 && userId === senderId);
			}
			return Promise.resolve(false);
		},
	};
}
