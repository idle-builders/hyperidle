/**
 * @lore AU19 Increment 3d: `agent_lifecycle_inbox`'s owned-table accessor
 * surface for FOREIGN callers (`@hyperidle/session-requests`'s single-
 * terminal-writer/reaper, see that package's `ports.ts` top `@lore`) — moved
 * here, verbatim query logic, from the INTERIM raw-table-ops implementation
 * that lived in `packages/server/src/services/session-requests-bindings.ts`
 * since Increment 3b. `packages/server`'s `session-requests-bindings.ts` is
 * repointed by this same commit to call these real exports instead of
 * querying `agentLifecycleInbox` directly — closing the forward-reference
 * (`session-requests → lifecycle-projection`, a NEW edge, see `ports.ts`).
 *
 * `drainAgentLifecycleInbox`'s own claim/project/ack loop
 * (`agent-lifecycle-projectors.ts`) is this Service's OWN table access, not
 * this file's concern — this file is purely the writer/reaper surface for
 * `session-requests`, the durable single-terminal-writer into the inbox.
 */
import { agentLifecycleInbox, type WriteExecutor } from "@hyperidle/db";
import { and, inArray, isNotNull, lt } from "drizzle-orm";

/** The one durable terminal fact `session-requests`' `terminalizeAgentSessionRequestInTx` appends. */
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
