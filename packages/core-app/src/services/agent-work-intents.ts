import { randomUUID } from "node:crypto";
import {
	type AgentWorkIntent,
	agentLifecycleInbox,
	agentWorkIntents,
	explicitSessionStarts,
	type HyperIdleDb,
	taskDispatchAttempts,
} from "@hyperidle/db";
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";

export const AGENT_WORK_RETENTION_DAYS = 30;
export const AGENT_WORK_RETENTION_BATCH_SIZE = 500;

export const AGENT_WORK_INTENT_KINDS = [
	"assistant_turn",
	"session_start",
	"knowledge_action",
	"routine_run",
	"bet_decomposition",
	"task_run",
	"reengagement",
] as const;
export type AgentWorkIntentKind = (typeof AGENT_WORK_INTENT_KINDS)[number];

export interface AgentWorkIntentInput {
	readonly kind: AgentWorkIntentKind;
	readonly sourceKind: string;
	readonly sourceId: string;
	readonly requestedBy?: string;
	readonly idempotencyKey: string;
}

/** Query surface shared by the root DB and transaction callbacks. */
export type AgentWorkIntentDb = Pick<HyperIdleDb, "select" | "insert">;

export async function recordAgentWorkIntent(
	db: AgentWorkIntentDb,
	input: AgentWorkIntentInput,
): Promise<AgentWorkIntent> {
	const existing = await db
		.select()
		.from(agentWorkIntents)
		.where(
			and(
				eq(agentWorkIntents.kind, input.kind),
				eq(agentWorkIntents.sourceId, input.sourceId),
				eq(agentWorkIntents.idempotencyKey, input.idempotencyKey),
			),
		)
		.limit(1);
	if (existing[0]) return existing[0];
	const timestamp = new Date().toISOString();
	const [inserted] = await db
		.insert(agentWorkIntents)
		.values({
			id: randomUUID(),
			kind: input.kind,
			sourceKind: input.sourceKind,
			sourceId: input.sourceId,
			requestedBy: input.requestedBy ?? null,
			idempotencyKey: input.idempotencyKey,
			status: "pending",
			createdAt: timestamp,
			updatedAt: timestamp,
		})
		.onConflictDoNothing()
		.returning();
	if (inserted) return inserted;
	const [raced] = await db
		.select()
		.from(agentWorkIntents)
		.where(
			and(
				eq(agentWorkIntents.kind, input.kind),
				eq(agentWorkIntents.sourceId, input.sourceId),
				eq(agentWorkIntents.idempotencyKey, input.idempotencyKey),
			),
		);
	if (!raced) throw new Error("Failed to record agent work intent");
	return raced;
}

/**
 * Deletes only acknowledged/terminal handoff facts after the audit window.
 * @lore AU9: inbox rows go first and intents before family sources. Keeping this
 * FK order in one transaction prevents retention from weakening request custody.
 */
export async function reapTerminalAgentWorkIntents(
	db: HyperIdleDb,
	options: {
		readonly now?: Date;
		readonly retentionDays?: number;
		readonly batchSize?: number;
	} = {},
): Promise<{ inbox: number; intents: number; explicitStarts: number; taskAttempts: number }> {
	const now = options.now ?? new Date();
	const retentionDays = options.retentionDays ?? AGENT_WORK_RETENTION_DAYS;
	const batchSize = options.batchSize ?? AGENT_WORK_RETENTION_BATCH_SIZE;
	const cutoff = new Date(now.getTime() - retentionDays * 86_400_000).toISOString();

	return await db.transaction(async (tx) => {
		const projected = await tx
			.select({ requestId: agentLifecycleInbox.requestId })
			.from(agentLifecycleInbox)
			.where(
				and(isNotNull(agentLifecycleInbox.projectedAt), lt(agentLifecycleInbox.occurredAt, cutoff)),
			)
			.limit(batchSize);
		if (projected.length > 0) {
			await tx.delete(agentLifecycleInbox).where(
				inArray(
					agentLifecycleInbox.requestId,
					projected.map((row) => row.requestId),
				),
			);
		}

		const candidates = await tx.execute(sql`
			select i.id
			from agent_work_intents i
			left join agent_session_requests r on r.id = i.request_id
			where i.status in ('handed_off', 'failed')
			  and i.updated_at < ${cutoff}
			  and (i.request_id is null or r.status in ('completed', 'failed', 'cancelled'))
			order by i.updated_at, i.id
			limit ${batchSize}
		`);
		const ids = (candidates as { rows: Array<{ id: string }> }).rows.map((row) => row.id);
		if (ids.length > 0) {
			await tx.delete(agentWorkIntents).where(inArray(agentWorkIntents.id, ids));
		}
		const oldStarts = await tx
			.delete(explicitSessionStarts)
			.where(
				and(
					inArray(explicitSessionStarts.status, ["completed", "failed", "cancelled"]),
					lt(explicitSessionStarts.updatedAt, cutoff),
				),
			)
			.returning({ id: explicitSessionStarts.id });
		const oldAttempts = await tx
			.delete(taskDispatchAttempts)
			.where(
				and(
					inArray(taskDispatchAttempts.status, ["completed", "failed", "cancelled"]),
					lt(taskDispatchAttempts.updatedAt, cutoff),
				),
			)
			.returning({ id: taskDispatchAttempts.id });
		return {
			inbox: projected.length,
			intents: ids.length,
			explicitStarts: oldStarts.length,
			taskAttempts: oldAttempts.length,
		};
	});
}

