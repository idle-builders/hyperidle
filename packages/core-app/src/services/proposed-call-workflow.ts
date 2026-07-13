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
 */

import { type HyperIdleDb, operationOutcomes, proposedCalls, tailoredGrants } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import { recordAgentWorkIntent } from "./agent-work-intents.js";

function nowIso(): string {
	return new Date().toISOString();
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
		await recordAgentWorkIntent(tx, {
			kind: "reengagement",
			sourceKind: "proposed_call",
			sourceId: opts.proposedCallId,
			requestedBy: opts.agentScope,
			idempotencyKey: `grant:${opts.proposedCallId}`,
		});
	});
}
