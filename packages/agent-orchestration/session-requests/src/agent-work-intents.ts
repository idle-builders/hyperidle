import { randomUUID } from "node:crypto";
import {
	type AgentWorkIntent,
	agentWorkIntents,
	explicitSessionStarts,
	type HyperIdleDb,
	taskDispatchAttempts,
} from "@hyperidle/db";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { AgentWorkIntentReapDeps } from "./ports.js";

/**
 * @lore AU19 Increment 3b: real cut-over — moved here from
 * `packages/server/src/services/agent-work-intents.ts` (behavior-preserving
 * move). `agentWorkIntents` is this Service's own table (`TABLE_OWNER`,
 * `scripts/table-ownership-guard.ts`). `explicitSessionStarts` is a
 * roster-undercounted sibling table this module (+ `agent-session-requests.ts`/
 * `agent-work-intent-worker.ts`) is the sole nested-package accessor of —
 * added to `TABLE_OWNER` alongside `agentWorkIntents`/`agentSessionRequests`
 * (same "confirm at migration" shape as `trigger-resolution`'s
 * `triggerResolutionHistory` finding). `taskDispatchAttempts` stays a direct
 * `@hyperidle/db` import — it is in `table-ownership-guard.ts`'s
 * `UNOWNED_SHARED_TABLES` exemption (genuinely multi-owner-touched, confirmed
 * unchanged by this migration), so no port is needed for it.
 *
 * `agentLifecycleInbox` (owned by `lifecycle-projection`, a real package
 * since Increment 3d) is accessed by `reapTerminalAgentWorkIntents`
 * below — converted to the `SessionRequestsLifecycleInboxReaper` port (see
 * `ports.ts`'s top `@lore`), wired to `lifecycle-projection`'s real exports.
 */

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
 * Narrow reader for the AC-9 `agent_work_intents` closure (§11) —
 * `routes/sessions-routes.ts`'s explicit-session-start idempotent-replay path.
 * Returns only the fields that call site consumes (`id`/`idempotencyKey`).
 */
export async function findAgentWorkIntentByKindAndSource(
	db: AgentWorkIntentDb,
	kind: AgentWorkIntentKind,
	sourceId: string,
): Promise<Pick<AgentWorkIntent, "id" | "idempotencyKey"> | undefined> {
	const [row] = await db
		.select()
		.from(agentWorkIntents)
		.where(and(eq(agentWorkIntents.kind, kind), eq(agentWorkIntents.sourceId, sourceId)))
		.limit(1);
	return row;
}

/**
 * AC-9 boot-time reader (§11) — `agent-layer-boot.ts`'s (`run-orchestration`,
 * not yet migrated) correlated explicit-session-start lookup by request id.
 * Intra-orchestration DI — same Layer as this Service, no Application
 * involvement needed (§11's third accessor).
 */
export async function findAgentWorkIntentSourceByRequestId(
	db: AgentWorkIntentDb,
	requestId: string,
): Promise<Pick<AgentWorkIntent, "sourceId" | "sourceKind"> | undefined> {
	const [row] = await db
		.select({ sourceId: agentWorkIntents.sourceId, sourceKind: agentWorkIntents.sourceKind })
		.from(agentWorkIntents)
		.where(eq(agentWorkIntents.requestId, requestId))
		.limit(1);
	return row;
}

/**
 * Deletes only acknowledged/terminal handoff facts after the audit window.
 * @lore AU9: inbox rows go first and intents before family sources. Keeping this
 * FK order in one transaction prevents retention from weakening request custody.
 */
export async function reapTerminalAgentWorkIntents(
	db: HyperIdleDb,
	deps: AgentWorkIntentReapDeps,
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
		const projected = await deps.lifecycleInbox.listProjectedBefore(tx, cutoff, batchSize);
		if (projected.length > 0) {
			await deps.lifecycleInbox.deleteByRequestIds(
				tx,
				projected.map((row) => row.requestId),
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

export { drainAgentWorkIntents } from "./agent-work-intent-worker.js";
