import {
	type ExplicitSessionStart,
	explicitSessionStarts,
	type HyperIdleDb,
	type WriteExecutor,
} from "@hyperidle/db";
import { and, eq } from "drizzle-orm";

/**
 * @lore AU19 Increment 3c: this Service's `explicitSessionStarts` reader/
 * writer surface for the boot-time drain — surfaced migrating
 * `run-orchestration` (`agent-layer-boot.ts`'s `drainAgentSessionRequests`),
 * which raw-read/wrote `explicitSessionStarts` directly pre-migration (the
 * requested-model-tier read before admission, plus the admitted/failed
 * status projection after). `explicitSessionStarts` is already `TABLE_OWNER`
 * for this Service (see `agent-work-intents.ts`'s reaper) — this file adds
 * the request-scoped single-row reader/writers the drain needs, closing
 * another foreign-nested-package accessor the same way
 * `findAgentSessionRequestBySessionId`/`findAgentSessionRequestById` closed
 * theirs. `routes/sessions-routes.ts`'s own raw `explicitSessionStarts`
 * access was UNCHANGED at Increment 3c — it lived in `packages/server` (then
 * the still-unguarded composition root, out of `table-ownership-guard.ts`'s
 * scan scope at the time). AU19 Increment 5 item 4 (guard-retirement
 * full-sweep, session-requests sub-item): `packages/server` dissolved into
 * `packages/core-api` at Increment 5 item 2, so `routes/sessions-routes.ts`
 * now lives at `packages/core-api/src/routes/` — in scope for the full-sweep
 * grep even though the guard's own scan still only covers nested Service
 * roots (`packages/<layer>/<service>/`, not `packages/core-api/src`
 * directly — a separately tracked, not-yet-landed scan-widening item).
 * `findExplicitSessionStartByRequesterAndIdempotencyKey`/
 * `createExplicitSessionStart` below are the two new reader/writer exports
 * that close it: the POST `/sessions` durable-start idempotency-keyed
 * dedupe lookup + the `requested`-status row insert, both previously raw
 * `db.select()/.insert().from/into(explicitSessionStarts)` calls inline in
 * the route. The route's other two raw reads (poll-for-fresh-status inside
 * the projection promise, and `GET /sessions/starts/:startId`) now reuse
 * the existing `findExplicitSessionStartById` above (the `requestedBy`
 * ownership check for the latter moves into the route as a plain field
 * comparison on the returned row, not a table access).
 *
 * @lore AU19 Increment 3d: `projectExplicitSessionStartTerminalState` added
 * — the real target of `@hyperidle/lifecycle-projection`'s
 * `LifecycleProjectionExplicitSessionStartWriter` port
 * (`projectExplicitStart`'s `explicit_session_start` family projection, a
 * NEW `lifecycle-projection → session-requests` edge this migration
 * surfaces). Distinct from `markExplicitSessionStartAdmitted`/`Failed` above
 * (those are keyed by `id` and cover the pre-admission `requested`→
 * `admitted`/`failed` transition); this one is keyed by `requestId` and
 * covers the POST-admission terminal projection (`completed`/`failed`/
 * `cancelled`) that used to run as an inline `packages/server` query inside
 * `agent-lifecycle-projectors.ts`'s `projectTask`/top-level
 * `explicit_session_start` dispatch — takes a `WriteExecutor` (not just
 * `HyperIdleDb`) because `projectTask` calls it INSIDE the same transaction
 * as its `task_dispatch_attempts` update.
 */

/** Single-row read by id — the pre-admission requested-model-tier lookup. */
export async function findExplicitSessionStartById(
	db: HyperIdleDb,
	id: string,
): Promise<ExplicitSessionStart | undefined> {
	const [row] = await db
		.select()
		.from(explicitSessionStarts)
		.where(eq(explicitSessionStarts.id, id))
		.limit(1);
	return row;
}

/** Post-admission success projection: requestId + sessionId, status → admitted. */
export async function markExplicitSessionStartAdmitted(
	db: HyperIdleDb,
	input: { id: string; requestId: string; sessionId: string },
): Promise<void> {
	await db
		.update(explicitSessionStarts)
		.set({
			status: "admitted",
			requestId: input.requestId,
			sessionId: input.sessionId,
			updatedAt: new Date().toISOString(),
		})
		.where(eq(explicitSessionStarts.id, input.id));
}

/** Post-admission-attempt failure projection: status → failed, stable failureCode. */
export async function markExplicitSessionStartFailed(
	db: HyperIdleDb,
	input: { id: string; failureCode: string },
): Promise<void> {
	await db
		.update(explicitSessionStarts)
		.set({ status: "failed", failureCode: input.failureCode, updatedAt: new Date().toISOString() })
		.where(eq(explicitSessionStarts.id, input.id));
}

/**
 * Post-run terminal projection, keyed by `requestId` — the
 * `lifecycle-projection`-injected target (`LifecycleProjectionExplicitSessionStartWriter`).
 */
export async function projectExplicitSessionStartTerminalState(
	exec: WriteExecutor,
	requestId: string,
	patch: {
		readonly status: "completed" | "failed" | "cancelled";
		readonly sessionId: string | null;
		readonly failureCode: string | null;
	},
): Promise<void> {
	await exec
		.update(explicitSessionStarts)
		.set({
			status: patch.status,
			sessionId: patch.sessionId,
			failureCode: patch.failureCode,
			updatedAt: new Date().toISOString(),
		})
		.where(eq(explicitSessionStarts.requestId, requestId));
}

/**
 * Idempotency-keyed dedupe lookup, scoped to the requesting user — the
 * `POST /sessions` durable-start path's pre-insert existence check.
 */
export async function findExplicitSessionStartByRequesterAndIdempotencyKey(
	db: HyperIdleDb,
	input: { readonly requestedBy: string; readonly idempotencyKey: string },
): Promise<ExplicitSessionStart | undefined> {
	const [row] = await db
		.select()
		.from(explicitSessionStarts)
		.where(
			and(
				eq(explicitSessionStarts.requestedBy, input.requestedBy),
				eq(explicitSessionStarts.idempotencyKey, input.idempotencyKey),
			),
		)
		.limit(1);
	return row;
}

/** Input for the `requested`-status row insert (`POST /sessions` durable-start path). */
export interface CreateExplicitSessionStartInput {
	readonly id: string;
	readonly taskId: string;
	readonly requestedAgentId: string;
	readonly requestedModelTier: string;
	readonly requestedBy: string;
	readonly idempotencyKey: string;
}

/**
 * Insert a new `requested`-status row. Takes a `WriteExecutor` (not just
 * `HyperIdleDb`) because the caller inserts inside the same transaction as
 * the correlated `agent_work_intents` record (§4.3 same-tx durable handoff).
 */
export async function createExplicitSessionStart(
	exec: WriteExecutor,
	input: CreateExplicitSessionStartInput,
): Promise<ExplicitSessionStart> {
	const now = new Date().toISOString();
	const [row] = await exec
		.insert(explicitSessionStarts)
		.values({
			id: input.id,
			taskId: input.taskId,
			requestedAgentId: input.requestedAgentId,
			requestedModelTier: input.requestedModelTier,
			requestedBy: input.requestedBy,
			idempotencyKey: input.idempotencyKey,
			status: "requested",
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	if (!row) throw new Error("Explicit session start insert returned no row");
	return row;
}
