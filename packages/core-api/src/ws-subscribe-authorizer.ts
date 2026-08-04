/**
 * `createDbSubscribeAuthorizer` — WS topic authorization, and the Mechanism-C
 * DI ports it needs.
 *
 * @lore AU26 C3 (§D-E): moved VERBATIM out of the dissolved
 * `@hyperidle/realtime` package (its `ws-connection-hub.ts` + `ports.ts`). Same
 * direct `sessions` read, same `canSubscribeToTaskFreeSession` branch, same
 * four DI edges (`conversation`/`users`/`org`/`work`), same fail-closed
 * semantics (unknown session -> deny). The dissolution is a MOVE; converting
 * the `sessions` read is AU28's (§14 finding 1) and is deliberately NOT done
 * here. The same applies to the `deps.work.getTaskById` existence check, which
 * AU26 proved redundant (`sessions.taskId` is an FK to `tasks.id` with
 * `onDelete:"restrict"`, `packages/db/src/schema.ts:229`) and handed on unused.
 */

import { type HyperIdleDb, sessions, type WriteExecutor } from "@hyperidle/db";
import type { AgentSessionSourceCorrelation } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { SubscribeAuthorizer } from "./ws-connection-hub.js";

// ---------------------------------------------------------------------------
// conversation — RealtimeThreadReader (ordinary downward core-api edge)
// Internal: callers satisfy SubscribeAuthorizerDeps structurally; they never
// need to name the leaf port types. @lore AU20 Ab2: collapsed from public
// surface to file-internal per the 12→5 barrel collapse.
// ---------------------------------------------------------------------------

/** Structural mirror of `@hyperidle/conversation`'s `Thread` row, narrowed to `participants`. */
interface RealtimeThreadRow {
	readonly participants: string;
}

/** Port for `conversation`'s thread read `senderInThread` calls directly today (§10.2 line 385). */
interface RealtimeThreadReader {
	getThreadById(db: HyperIdleDb, id: string): Promise<RealtimeThreadRow | undefined>;
}

// ---------------------------------------------------------------------------
// users — RealtimeUserDirectory (ordinary downward core-api edge)
// Internal: see RealtimeThreadReader note above.
// ---------------------------------------------------------------------------

/** Structural mirror of `@hyperidle/users`' `User` row, narrowed to `teamId`. */
interface RealtimeUserRow {
	readonly teamId: string | null;
}

/** Port for `users`' read `senderInTeam` calls directly today (§10.2 line 386). */
interface RealtimeUserDirectory {
	getUserById(db: HyperIdleDb, id: string): Promise<RealtimeUserRow | undefined>;
}

// ---------------------------------------------------------------------------
// org — RealtimeOrgTeamReader (ordinary downward core-api edge, NOT
// against-grain — census correction, see this file's top `@lore`)
// Internal: see RealtimeThreadReader note above.
// ---------------------------------------------------------------------------

/** Structural mirror of `@hyperidle/org`'s `TeamMember` row, narrowed to `teamId`. */
interface RealtimeTeamMembersRow {
	readonly teamId: string;
}

/** Port for `org`'s `getTeamMembersById` read `senderInTeam` calls directly today. */
interface RealtimeOrgTeamReader {
	getTeamMembersById(db: HyperIdleDb, id: string): Promise<RealtimeTeamMembersRow | undefined>;
}

// ---------------------------------------------------------------------------
// work — RealtimeTaskReader (ordinary downward core-api edge)
// Internal: see RealtimeThreadReader note above.
// ---------------------------------------------------------------------------

/** Port for `work`'s task-existence read the session-topic authz check calls directly today (§10.2 line 384). */
interface RealtimeTaskReader {
	getTaskById(db: WriteExecutor, id: string): Promise<{ readonly id: string } | undefined>;
}

// ---------------------------------------------------------------------------
// Aggregate deps bundle
// ---------------------------------------------------------------------------

/** Deps `createDbSubscribeAuthorizer` needs — every real outbound edge it has. */
export interface SubscribeAuthorizerDeps {
	readonly conversation: RealtimeThreadReader;
	readonly users: RealtimeUserDirectory;
	readonly org: RealtimeOrgTeamReader;
	readonly work: RealtimeTaskReader;
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
