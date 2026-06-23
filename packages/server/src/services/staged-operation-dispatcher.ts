import { type HyperIdleDb, operationOutcomes, stagedOperations } from "@hyperidle/db";
import type { EventBus, StagedOperationSpec } from "@hyperidle/shared";
import { and, eq, isNull } from "drizzle-orm";

/**
 * AL7 — Staged Operation Dispatcher
 *
 * Executes staged operations after an approve verdict. Enforces at-most-once
 * execution via a conditional status=pending → executing claim.
 *
 * @lore AL7: The at-most-once claim is `WHERE id=? AND status='pending'` CAS.
 * If the UPDATE returns 0 rows, the op was already claimed (duplicate delivery,
 * re-open false re-fire) — we skip silently. This is independent of the
 * idempotencyKey UNIQUE constraint (which is an anti-fork guard, not the
 * execution gate).
 *
 * @lore AL7: Dispatch is keyed on reviewMessageId (C1 fix). Thread-keyed dispatch
 * would fire ALL ops for ALL reviews on that thread — catastrophic for multi-review
 * threads. One review message → one dispatch call → only that message's ops fire.
 *
 * @lore AL7: executeCapability is injected so the fixture tool can be used in
 * tests without a live GitHub credential. In production, the map resolves
 * capability tools like "github:merge-pr". Unknown tools surface as failed
 * outcomes — never silently swallowed.
 */

export interface StagedOperationDispatchDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly executeCapability: (op: StagedOperationSpec) => Promise<{ payload: unknown }>;
}

/**
 * Resolve all pending staged operations for a given review message.
 * Called after an approve verdict on that message.
 *
 * At-most-once: conditionally claims status=pending → executing.
 * If the claim fails (0 rows updated), the op was already processed — skip.
 * Awaited inline so callers observe the execution result before returning.
 *
 * @lore AL7 C1: keyed on reviewMessageId, NOT subjectThreadId.
 */
export async function resolveStagedOperations(
	deps: StagedOperationDispatchDeps,
	reviewMessageId: string,
): Promise<void> {
	// Find all pending ops for this review message.
	const pending = await deps.db
		.select()
		.from(stagedOperations)
		.where(
			and(
				eq(stagedOperations.reviewMessageId, reviewMessageId),
				eq(stagedOperations.status, "pending"),
			),
		);

	for (const op of pending) {
		await ExecuteOne(deps, op.id);
	}
}

/**
 * On boot, convert any crash-stranded "executing" ops (no outcome row) to
 * "failed" with an "interrupted" error message.
 *
 * Does NOT re-execute — cannot know if the side-effect already landed.
 *
 * @lore AL7 C2: "executing" with no outcome = process died mid-execute.
 * Re-execution risks double-side-effect. Surface as failed so humans can inspect.
 */
export async function sweepStrandedOperations(deps: StagedOperationDispatchDeps): Promise<void> {
	// Find executing ops with no outcome row (LEFT JOIN IS NULL pattern).
	const stranded = await deps.db
		.select({ id: stagedOperations.id, reviewMessageId: stagedOperations.reviewMessageId })
		.from(stagedOperations)
		.leftJoin(operationOutcomes, eq(operationOutcomes.stagedOperationId, stagedOperations.id))
		.where(
			and(eq(stagedOperations.status, "executing"), isNull(operationOutcomes.stagedOperationId)),
		);

	const now = new Date().toISOString();

	for (const row of stranded) {
		await deps.db
			.update(stagedOperations)
			.set({ status: "failed" })
			.where(eq(stagedOperations.id, row.id));

		await deps.db.insert(operationOutcomes).values({
			stagedOperationId: row.id,
			status: "failed",
			payload: null,
			error: "Operation interrupted: process crashed during execution. Manual inspection required.",
			executedAt: now,
		});

		deps.eventBus.emit({
			type: "operation_executed",
			streamId: row.id,
			stagedOperationId: row.id,
			reviewMessageId: row.reviewMessageId,
			status: "failed",
			timestamp: Date.now(),
		});
	}
}

/**
 * Internal: attempt to claim and execute a single staged operation.
 * At-most-once via conditional UPDATE.
 */
async function ExecuteOne(deps: StagedOperationDispatchDeps, opId: string): Promise<void> {
	// CAS claim: pending → executing. Returns 0 rows if already claimed.
	const claimed = await deps.db
		.update(stagedOperations)
		.set({ status: "executing" })
		.where(and(eq(stagedOperations.id, opId), eq(stagedOperations.status, "pending")))
		.returning({ id: stagedOperations.id });

	if (claimed.length === 0) {
		// Already claimed by another delivery or concurrently — skip.
		return;
	}

	// Load the full row for execution.
	const [row] = await deps.db
		.select()
		.from(stagedOperations)
		.where(eq(stagedOperations.id, opId))
		.limit(1);

	if (!row) {
		// Should not happen (we just updated it), but guard defensively.
		return;
	}

	const now = new Date().toISOString();
	let outcomeStatus: "ok" | "failed";
	let outcomePayload: unknown = null;
	let outcomeError: string | null = null;

	try {
		const spec: StagedOperationSpec = {
			id: row.id,
			capabilityTool: row.capabilityTool,
			operation: row.operation,
			params: JSON.parse(row.params) as Record<string, unknown>,
			idempotencyKey: row.idempotencyKey,
			reversibility: row.reversibility,
		};

		const result = await deps.executeCapability(spec);
		outcomeStatus = "ok";
		outcomePayload = result.payload;
	} catch (err) {
		outcomeStatus = "failed";
		outcomeError = err instanceof Error ? err.message : String(err);
	}

	// Write outcome (immutable terminal record — PK = opId enforces 0..1).
	await deps.db.insert(operationOutcomes).values({
		stagedOperationId: opId,
		status: outcomeStatus,
		payload: outcomePayload !== null ? JSON.stringify(outcomePayload) : null,
		error: outcomeError,
		executedAt: now,
	});

	// Transition staged op to terminal status.
	await deps.db
		.update(stagedOperations)
		.set({ status: outcomeStatus === "ok" ? "executed" : "failed" })
		.where(eq(stagedOperations.id, opId));

	// Emit event after state is persisted.
	deps.eventBus.emit({
		type: "operation_executed",
		streamId: opId,
		stagedOperationId: opId,
		reviewMessageId: row.reviewMessageId,
		status: outcomeStatus,
		timestamp: Date.now(),
	});
}

/**
 * The built-in capability executor map.
 *
 * @lore AL7: "fixture:staged-op" is a deterministic in-process capability for
 * tests + demos. It echoes params or throws when params.simulateFailure === true.
 * "github:merge-pr" is the real archetype-A path. Unknown tools always fail
 * (never silently swallowed) — surface to humans for inspection.
 */
export function buildExecuteCapability(): (
	op: StagedOperationSpec,
) => Promise<{ payload: unknown }> {
	return async (op: StagedOperationSpec): Promise<{ payload: unknown }> => {
		if (op.capabilityTool === "fixture:staged-op") {
			if (op.params.simulateFailure === true) {
				throw new Error(`fixture:staged-op simulateFailure triggered for op ${op.id}`);
			}
			return { payload: { echoed: op.params } };
		}

		// All other tools: unknown capability → fail loudly.
		throw new Error(
			`Unknown capability tool: ${op.capabilityTool}. No executor registered. Manual inspection required.`,
		);
	};
}
