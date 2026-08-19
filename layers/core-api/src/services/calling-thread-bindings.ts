/**
 * AU27 Increment 1 (Decision 0) — resolve-or-create the calling thread a
 * `task_run`/`session_start`/`reengagement`/`knowledge_action` session's
 * `reply` tool (Increment 2) needs somewhere real to post. Threads resolve by
 * `(hostKind, hostId)` lookup, never by an FK column (`conversation-store.ts`'s
 * `findThread`/`insertThread`, mirroring `web/src/services/host-threads.ts`'s
 * `resolveOrCreateHostThread`) — this is a core-side WRITE at bake time, so
 * `run-orchestration` still performs zero reads (AU21 AC #2 unaffected).
 * `tasks.threadId` is untouched (SCOPE LOCK: no schema change).
 *
 * @lore Mechanism C: `@hyperidle/work`/`@hyperidle/review`/`@hyperidle/knowledge`
 * cannot import `@hyperidle/conversation` directly — every per-kind resolver
 * that needs a calling thread takes this as an injected
 * `resolveOrCreateCallingThread` dep. This file is core-api Layer code (not a
 * nested Service), so it may legitimately import both, matching
 * `routes/threads.ts`'s own `findThread`/`insertThread` import precedent.
 *
 * @lore AU27 W3 fix (review): `resolveOrCreateHostThread`
 * (`web/src/services/host-threads.ts:55`) — the idiom this function claims
 * to mirror — always seeds `participants: [founderId, agentParticipantId]`,
 * never agent-only. This function originally wrote `[agentId]` only, so a
 * task thread the emit path creates first (before any human ever opens the
 * task in the UI) would never surface the agent's `reply` in the founder's
 * participant-probe inbox (`routes/threads.ts:895`'s `participant_id`-scoped
 * `GET /api/threads` — reads unaffected, since a `host_kind`+`host_id` lookup
 * ignores participants; only the cross-cutting inbox view is participant-
 * filtered). No task row carries a founder id (tasks are agent-owned via
 * `ownerAgentId`, never human-owned — `db/src/schema.ts`), so this mirrors
 * `middleware/auth.ts`'s own `resolveApiKeyActorUserId` local-mode
 * convention: the sole human user (`findUser(db, { kind: "human" })`) is
 * "the founder" for participant purposes. Absent a human row (never true in
 * a real seeded team), the thread is created agent-only rather than
 * referencing a user id that doesn't exist.
 */
import { findThread, insertThread } from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";
import type { HostKind } from "@hyperidle/domain-model";
import { findUser } from "@hyperidle/users";

/**
 * Resolve the `(hostKind, hostId)` thread, or create one if absent, seeding
 * the sole human user + `agentId` as participants. Idempotent: a second call
 * for the same host reuses the existing thread — never creates a duplicate.
 */
async function resolveOrCreateHostCallingThread(
	db: HyperIdleDb,
	hostKind: HostKind,
	hostId: string,
	agentId: string,
): Promise<string> {
	const existing = await findThread(db, { host: { kind: hostKind, id: hostId } });
	if (existing) return existing.id;
	const threadId = crypto.randomUUID();
	const now = new Date().toISOString();
	const founder = await findUser(db, { kind: "human" });
	const participants = founder ? [founder.id, agentId] : [agentId];
	await insertThread(db, {
		id: threadId,
		hostKind,
		hostId,
		initiatorId: agentId,
		participants: JSON.stringify(participants),
		lastActiveAt: now,
		createdAt: now,
	});
	return threadId;
}

/**
 * Resolve the task's `hostKind:"task"` thread, or create one if absent.
 * Idempotent: a second call for the same `taskId` reuses the existing
 * thread — never creates a duplicate.
 */
export function resolveOrCreateCallingThread(
	db: HyperIdleDb,
	taskId: string,
	agentId: string,
): Promise<string> {
	return resolveOrCreateHostCallingThread(db, "task", taskId, agentId);
}
