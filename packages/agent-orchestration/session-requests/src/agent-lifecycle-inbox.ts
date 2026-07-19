/**
 * @lore AU19 Increment 3d: `agent_lifecycle_inbox`'s owned-table accessor
 * surface for the terminal-writer/reaper — originally a separate
 * `packages/agent-orchestration/lifecycle-projection` package. Folded into
 * `session-requests` by AU20 B1a: `lifecycle-projection` was
 * session-requests' terminal-fact DRAIN and session-requests was already the
 * inbox's sole writer+reaper — the dependency cycle is removed by co-locating
 * both sides in one package. `agentLifecycleInbox` ownership now lives here
 * (`TABLE_OWNER` in scripts/table-ownership-guard.ts).
 *
 * `drainAgentLifecycleInbox`'s own claim/project/ack loop
 * (`agent-lifecycle-projectors.ts`) is this Service's OWN table access, not
 * this file's concern — this file is purely the writer/reaper surface for the
 * durable single-terminal-writer into the inbox.
 */
import { agentLifecycleInbox, type WriteExecutor } from "@hyperidle/db";
import { and, inArray, isNotNull, lt } from "drizzle-orm";

/** The one durable terminal fact `terminalizeAgentSessionRequestInTx` appends. */
export interface AgentLifecycleInboxFact {
	readonly requestId: string;
	readonly sourceKind: string;
	readonly sourceId: string;
	readonly state: string;
	readonly sessionId: string | null;
	readonly failureCode: string | null;
	readonly occurredAt: string;
}

/** Idempotent append — `onConflictDoNothing` on the `requestId` primary key. */
export async function insertLifecycleInboxFactIfAbsent(
	exec: WriteExecutor,
	fact: AgentLifecycleInboxFact,
): Promise<void> {
	await exec
		.insert(agentLifecycleInbox)
		.values({
			requestId: fact.requestId,
			sourceKind: fact.sourceKind,
			sourceId: fact.sourceId,
			state: fact.state,
			sessionId: fact.sessionId,
			failureCode: fact.failureCode,
			occurredAt: fact.occurredAt,
		})
		.onConflictDoNothing();
}

/** Retention sweep read: already-projected rows older than `cutoff`, one batch. */
export function listProjectedLifecycleInboxBefore(
	exec: WriteExecutor,
	cutoff: string,
	batchSize: number,
): Promise<ReadonlyArray<{ requestId: string }>> {
	return exec
		.select({ requestId: agentLifecycleInbox.requestId })
		.from(agentLifecycleInbox)
		.where(
			and(isNotNull(agentLifecycleInbox.projectedAt), lt(agentLifecycleInbox.occurredAt, cutoff)),
		)
		.limit(batchSize);
}

/** Retention sweep delete: remove the batch `listProjectedLifecycleInboxBefore` returned. */
export async function deleteLifecycleInboxByRequestIds(
	exec: WriteExecutor,
	requestIds: readonly string[],
): Promise<void> {
	if (requestIds.length === 0) return;
	await exec.delete(agentLifecycleInbox).where(inArray(agentLifecycleInbox.requestId, requestIds));
}
