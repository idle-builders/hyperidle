/**
 * AU27 Increment 1 (Decision 0) — resolve-or-create the calling thread a
 * `task_run`/`session_start`/`reengagement` session's `reply` tool (Increment
 * 2) needs somewhere real to post. Threads resolve by `(hostKind, hostId)`
 * lookup, never by an FK column (`conversation-store.ts`'s `findThread`/
 * `insertThread`, mirroring `web/src/services/host-threads.ts`'s
 * `resolveOrCreateHostThread`) — this is a core-side WRITE at bake time, so
 * `run-orchestration` still performs zero reads (AU21 AC #2 unaffected).
 * `tasks.threadId` is untouched (SCOPE LOCK: no schema change).
 *
 * @lore Mechanism C: `@hyperidle/work`/`@hyperidle/review` cannot import
 * `@hyperidle/conversation` directly — every per-kind resolver that needs a
 * calling thread takes this as an injected `resolveOrCreateCallingThread`
 * dep. This file is core-api Layer code (not a nested Service), so it may
 * legitimately import both, matching `routes/threads.ts`'s own
 * `findThread`/`insertThread` import precedent.
 */
import { findThread, insertThread } from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";

/**
 * Resolve the task's `hostKind:"task"` thread, or create one if absent.
 * Idempotent: a second call for the same `taskId` reuses the existing
 * thread — never creates a duplicate.
 */
export async function resolveOrCreateCallingThread(
	db: HyperIdleDb,
	taskId: string,
	agentId: string,
): Promise<string> {
	const existing = await findThread(db, { host: { kind: "task", id: taskId } });
	if (existing) return existing.id;
	const threadId = crypto.randomUUID();
	const now = new Date().toISOString();
	await insertThread(db, {
		id: threadId,
		hostKind: "task",
		hostId: taskId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId]),
		lastActiveAt: now,
		createdAt: now,
	});
	return threadId;
}
