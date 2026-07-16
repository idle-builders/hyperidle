/**
 * AL7 Task 9.5 — Proposed Call workflow helpers.
 *
 * Houses server-side helpers for the two-session trust-first loop:
 * - `composeTailoredGrant` — compose a grant on approve (Task 8, verdict path)
 * - `handleUnconsumedGrantOnSessionEnd` — liveness net (AC11b)
 *
 * The liveness net fires when session 2 ends WITHOUT consuming the tailored grant
 * (crash, mis-provision, etc.). It is NOT a guard against re-derivation or arg
 * drift — those are trusted behavior. It surfaces a crash/no-show silently.
 *
 * @lore AL7 R7: `handleUnconsumedGrantOnSessionEnd` is a SEPARATE session_ended
 * subscription (not inside `handleSessionEnded`). Sharing the guard with
 * `handleSessionEnded` would risk double-dispatch. Both share `hasActiveSession`.
 *
 * @lore AU19 Increment 1j: `proposedCalls`/`operationOutcomes`/`tailoredGrants`
 * are `review`'s OWN owned tables (Table ACL, Mechanism A — see
 * `scripts/table-ownership-guard.ts`'s `TABLE_OWNER` map) — this file's raw
 * Drizzle access to them is legal, unchanged. The one real outbound edge —
 * `recordAgentWorkIntent` (session-requests' durable intent writer) — is
 * §10.3 against-grain and becomes an injected `ReviewAgentWorkIntentRecorder`
 * port (see `ports.ts`), interim-wired to `packages/server`'s still-unmigrated
 * `agent-work-intents.ts` until Increment 3.
 *
 * `findProposedCallWithOutcomeByReviewMessageId` was added here to repoint
 * `routes/reviews.ts` (`GET /api/reviews/:reviewMessageId`) off its raw
 * `proposedCalls ⋈ operationOutcomes` query — the exact same join, now
 * routed through `review`'s barrel instead of a foreign table touch.
 */

import * as crypto from "node:crypto";
import {
	type HyperIdleDb,
	operationOutcomes,
	type ProposedCall,
	proposedCalls,
	type TailoredGrant,
	tailoredGrants,
} from "@hyperidle/db";
import type { ToolResult } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import type { ReviewAgentWorkIntentRecorder } from "./ports.js";

function nowIso(): string {
	return new Date().toISOString();
}

export interface ProposedCallWithOutcomeRow {
	readonly pcId: string;
	readonly pcStatus: string;
	readonly toolId: string;
	readonly args: string;
	readonly artifactId: string;
	readonly outcomeStatus: string | null;
	readonly outcomeReceipt: string | null;
	readonly outcomeError: string | null;
	readonly outcomeExecutedAt: string | null;
}

/**
 * Load the Proposed Call (+ its Operation Outcome, if any) anchored to a
 * review message. Mirrors `routes/reviews.ts`'s pre-migration inline query
 * exactly (same columns, same LEFT JOIN, same `.limit(1)`).
 */
export async function findProposedCallWithOutcomeByReviewMessageId(
	db: HyperIdleDb,
	reviewMessageId: string,
): Promise<ProposedCallWithOutcomeRow | undefined> {
	const [row] = await db
		.select({
			pcId: proposedCalls.id,
			pcStatus: proposedCalls.status,
			toolId: proposedCalls.toolId,
			args: proposedCalls.args,
			artifactId: proposedCalls.artifactId,
			outcomeStatus: operationOutcomes.status,
			outcomeReceipt: operationOutcomes.receipt,
			outcomeError: operationOutcomes.error,
			outcomeExecutedAt: operationOutcomes.executedAt,
		})
		.from(proposedCalls)
		.leftJoin(operationOutcomes, eq(operationOutcomes.proposedCallId, proposedCalls.id))
		.where(eq(proposedCalls.reviewMessageId, reviewMessageId))
		.limit(1);
	return row;
}

/**
 * Load the raw Proposed Call row anchored to a review message (no join).
 * Mirrors `routes/threads.ts`'s (pre-migration) inline verdict-path query
 * exactly (same columns, same `.limit(1)`).
 *
 * @lore AU19 Increment 5 item 4 (review sub-item, full-sweep): added to
 * repoint `routes/threads.ts`'s verdict handler off its raw `proposedCalls`
 * select — the verdict path needs the FULL row (`toolId`/`args`/`artifactId`/
 * `identityHash`), unlike `findProposedCallWithOutcomeByReviewMessageId`
 * (which is a narrower, joined projection for the `GET /api/reviews/:id`
 * read path).
 */
export async function findProposedCallByReviewMessageId(
	db: HyperIdleDb,
	reviewMessageId: string,
): Promise<ProposedCall | undefined> {
	const [row] = await db
		.select()
		.from(proposedCalls)
		.where(eq(proposedCalls.reviewMessageId, reviewMessageId))
		.limit(1);
	return row;
}

/**
 * Hold a Proposed Call (never executed) — transitions `status: "held"`.
 * Used on a non-approve verdict decision.
 *
 * @lore AU19 Increment 5 item 4 (review sub-item, full-sweep): added to
 * repoint `routes/threads.ts`'s verdict handler off its raw `proposedCalls`
 * update.
 */
export async function holdProposedCall(db: HyperIdleDb, proposedCallId: string): Promise<void> {
	await db
		.update(proposedCalls)
		.set({ status: "held" })
		.where(eq(proposedCalls.id, proposedCallId));
}

/**
 * A granted Proposed Call joined with its Tailored Grant, by Proposed Call
 * id. Mirrors `agent-work-intent-worker.ts`'s (pre-migration) inline query
 * exactly (same INNER JOIN, same `.limit(1)`).
 *
 * @lore AU19 Increment 3b: added purpose-built for `session-requests`'
 * `resolveAuthoritativeInput`'s `reengagement` branch — a census correction
 * (`session-requests → review`, see `@hyperidle/session-requests`'s
 * `ports.ts` top `@lore`) surfaced by migrating `session-requests` for real:
 * that branch read `proposedCalls`/`tailoredGrants` (both `review`-owned)
 * directly via a raw join, which a nested Service package may not do
 * (Table ACL, Mechanism A).
 */
export async function findGrantedProposedCall(
	db: HyperIdleDb,
	proposedCallId: string,
): Promise<{ readonly call: ProposedCall; readonly grant: TailoredGrant } | undefined> {
	const [row] = await db
		.select({ call: proposedCalls, grant: tailoredGrants })
		.from(proposedCalls)
		.innerJoin(tailoredGrants, eq(tailoredGrants.proposedCallId, proposedCalls.id))
		.where(eq(proposedCalls.id, proposedCallId))
		.limit(1);
	return row;
}

/**
 * AC11b — Liveness net: handles a session_ended where the tailored grant was
 * NOT consumed (session 2 crashed or did not reach the approved op).
 *
 * Behavior:
 * - `retryCount === 0` → increment to 1, call `onReenqueue(taskId, agentId)` (re-provision once).
 * - `retryCount >= 1` → transition Proposed Call to `held` + write a `failed` Outcome
 *   (the work did not execute; surface it, never silently hang).
 *
 * @lore AL7 Task 9.5: this fires ONLY on crash/no-show (the grant was not
 * consumed). Re-derivation and arg drift in a successful session 2 are NOT
 * liveness failures — they are trusted behavior. The liveness net never trips
 * on a session that consumed the grant.
 */
export async function handleUnconsumedGrantOnSessionEnd(
	db: HyperIdleDb,
	opts: {
		sessionId: string;
		taskId: string;
		agentId: string;
		onReenqueue: (taskId: string, agentId: string) => void;
	},
): Promise<void> {
	// Find an unconsumed grant for this task+agent
	const grants = await db
		.select()
		.from(tailoredGrants)
		.where(
			and(
				eq(tailoredGrants.taskScope, opts.taskId),
				eq(tailoredGrants.agentScope, opts.agentId),
				eq(tailoredGrants.consumed, false),
			),
		);

	if (grants.length === 0) {
		// No unconsumed grant — session ended normally (approved op ran). Nothing to do.
		return;
	}

	for (const grant of grants) {
		if (grant.retryCount === 0) {
			// First no-show: increment retry, re-provision once
			await db
				.update(tailoredGrants)
				.set({ retryCount: 1 })
				.where(eq(tailoredGrants.proposedCallId, grant.proposedCallId));
			opts.onReenqueue(opts.taskId, opts.agentId);
		} else {
			// Second no-show: give up — transition PC to held + write failed Outcome
			await db
				.update(proposedCalls)
				.set({ status: "held" })
				.where(eq(proposedCalls.id, grant.proposedCallId));

			// Write a failed Outcome so the result is visible against the review (never silent)
			await db.insert(operationOutcomes).values({
				proposedCallId: grant.proposedCallId,
				status: "failed",
				error: "approved op did not execute: session 2 ended without consuming the grant",
				executedAt: nowIso(),
			});
		}
	}
}

/**
 * Task 8 helper — compose a tailored grant on approve verdict.
 * Called inside the verdict transaction when `decision === "approve"` and
 * the review message backs a `captured` Proposed Call.
 *
 * Inserts the `tailored_grants` row and transitions the Proposed Call
 * `captured → granted`. The caller emits `proposed_call_granted` after commit.
 */
export async function composeTailoredGrant(
	db: HyperIdleDb,
	opts: {
		proposedCallId: string;
		taskScope: string;
		agentScope: string;
		approvedToolId: string;
		/** Verbatim approved args — accepts pre-serialized JSON string or an object. */
		approvedArgs: Record<string, unknown> | string;
		argPinned?: boolean;
		identityHash?: string;
	},
	deps: { readonly sessionRequests: ReviewAgentWorkIntentRecorder },
): Promise<void> {
	const approvedArgsSer =
		typeof opts.approvedArgs === "string" ? opts.approvedArgs : JSON.stringify(opts.approvedArgs);
	await db.transaction(async (tx) => {
		await tx.insert(tailoredGrants).values({
			proposedCallId: opts.proposedCallId,
			taskScope: opts.taskScope,
			agentScope: opts.agentScope,
			approvedToolId: opts.approvedToolId,
			approvedArgs: approvedArgsSer,
			argPinned: opts.argPinned ?? false,
			identityHash: opts.identityHash ?? null,
			consumed: false,
			retryCount: 0,
			mintedAt: nowIso(),
		});

		// Transition Proposed Call: captured → granted
		await tx
			.update(proposedCalls)
			.set({ status: "granted" })
			.where(and(eq(proposedCalls.id, opts.proposedCallId), eq(proposedCalls.status, "captured")));
		await deps.sessionRequests.record(tx, {
			kind: "reengagement",
			sourceKind: "proposed_call",
			sourceId: opts.proposedCallId,
			requestedBy: opts.agentScope,
			idempotencyKey: `grant:${opts.proposedCallId}`,
		});
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// AU19 Increment 4 — the AL7 trust-first workflow router's DB touches
// (`@hyperidle/tool-provider`'s `ProposedCallWorkflowPort`). Moved verbatim
// (byte-identical SQL shape) from the pre-migration `tools/tool-registry.ts`'s
// `captureProposedCall`/`recordOutcome` module-private helpers + the inline
// CAS-consume `tailoredGrants` update inside `invoke()` — `proposedCalls`/
// `tailoredGrants`/`operationOutcomes` are `review`'s own owned tables
// (Table ACL, Mechanism A), so this is where they belong now that
// `tool-provider` (agent-execution, zero `@hyperidle/db`) can no longer
// touch them directly.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a Proposed Call row idempotently using ON CONFLICT DO NOTHING semantics.
 * Returns `{ firstCapture: true }` if the row was newly inserted (zero prior rows
 * for this `(originSessionId, identityHash)` pair) or `{ firstCapture: false }` if
 * it was a duplicate.
 *
 * @lore AL7 WARNING-5.2: the `(origin_session_id, identity_hash)` constraint MUST
 * be a UNIQUE constraint (not a plain index) so the INSERT ON CONFLICT DO NOTHING
 * truly deduplicates. A plain index does NOT block duplicates in PostgreSQL.
 */
export async function captureProposedCall(
	db: HyperIdleDb,
	opts: {
		readonly originSessionId: string;
		readonly taskId: string;
		readonly agentId: string;
		readonly toolId: string;
		readonly args: Record<string, unknown>;
		readonly hash: string;
		readonly reviewMessageId: string;
		readonly subjectThreadId: string;
		readonly artifactId: string;
	},
): Promise<{ readonly firstCapture: boolean }> {
	const id = `pc-${crypto.randomUUID()}`;
	const rows = await db
		.insert(proposedCalls)
		.values({
			id,
			reviewMessageId: opts.reviewMessageId,
			subjectThreadId: opts.subjectThreadId,
			artifactId: opts.artifactId,
			originSessionId: opts.originSessionId,
			toolId: opts.toolId,
			args: JSON.stringify(opts.args),
			identityHash: opts.hash,
			reversibility: "irreversible",
			status: "captured",
			stagedByAgentId: opts.agentId,
			createdAt: nowIso(),
		})
		.onConflictDoNothing()
		.returning();
	return { firstCapture: rows.length > 0 };
}

/**
 * CAS-consume a tailored grant for `(taskId, agentId, toolId)`. Returns the
 * claimed `proposedCallId`, or `null` if already consumed / not granted.
 */
export async function consumeTailoredGrant(
	db: HyperIdleDb,
	opts: { readonly taskId: string; readonly agentId: string; readonly toolId: string },
): Promise<{ readonly proposedCallId: string } | null> {
	const [claimed] = await db
		.update(tailoredGrants)
		.set({ consumed: true, consumedAt: nowIso() })
		.where(
			and(
				eq(tailoredGrants.taskScope, opts.taskId),
				eq(tailoredGrants.agentScope, opts.agentId),
				eq(tailoredGrants.approvedToolId, opts.toolId),
				eq(tailoredGrants.consumed, false),
			),
		)
		.returning();
	return claimed ? { proposedCallId: claimed.proposedCallId } : null;
}

/**
 * Record the terminal outcome of an executed Proposed Call.
 * One row per `proposedCallId` (PK enforces immutability).
 */
export async function recordOutcome(
	db: HyperIdleDb,
	proposedCallId: string,
	result: ToolResult,
): Promise<void> {
	const executedAt = nowIso();
	if (result.success) {
		const receipt = typeof result.data === "string" ? result.data : JSON.stringify(result.data);
		await db.insert(operationOutcomes).values({
			proposedCallId,
			status: "ok",
			receipt,
			executedAt,
		});
	} else {
		await db.insert(operationOutcomes).values({
			proposedCallId,
			status: "failed",
			error: result.error,
			executedAt,
		});
	}
	const newStatus = result.success ? "executed" : "failed";
	await db
		.update(proposedCalls)
		.set({ status: newStatus })
		.where(eq(proposedCalls.id, proposedCallId));
}
