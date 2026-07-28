/**
 * AL7 Task 9.5 — Proposed Call workflow: unified state-machine API.
 *
 * Public surface (AU20 Am9):
 *   - `findProposedCall`   — parameterized reader (replaces 3 use-case finders)
 *   - `recordProposedCall` — idempotent capture (replaces `captureProposedCall`)
 *   - `transitionProposedCall` — discriminated-union state machine
 *                                (replaces `holdProposedCall`, `composeTailoredGrant`,
 *                                 `consumeTailoredGrant`, `recordOutcome`)
 *
 * Internal helpers (not exported from barrel):
 *   - `handleUnconsumedGrantOnSessionEnd` — liveness net (AC11b); consumed
 *     internally by `registerReviewSubscriptions` in session-review-creator.ts
 *
 * @lore AU20 Am9: discriminated-union approach — the AL7 loop is a state
 * machine (`captured → held | granted → consumed → outcome-recorded`).
 * The heterogeneity (scope-tuple vs id key, `{proposedCallId}` vs `void`
 * return, injected recorder, `ToolResult` payload) is CAPTURED in
 * `ProposedCallTransition`, not hidden behind a lying signature.
 *
 * @lore AL7 R7: `handleUnconsumedGrantOnSessionEnd` is a SEPARATE
 * session_ended subscription (not inside `handleSessionEnded`). Sharing the
 * guard with `handleSessionEnded` would risk double-dispatch.
 *
 * @lore AU19 Increment 1j: `proposedCalls`/`operationOutcomes`/`tailoredGrants`
 * are `review`'s OWN owned tables (Table ACL, Mechanism A) — raw Drizzle
 * access here is legal, unchanged.
 */

import * as crypto from "node:crypto";
import {
	type HyperIdleDb,
	type OperationOutcome,
	operationOutcomes,
	type ProposedCall,
	proposedCalls,
	type TailoredGrant,
	tailoredGrants,
} from "@hyperidle/db";
import type { ToolResult } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import type { ReviewAgentWorkIntentInput, ReviewPorts } from "./ports.js";

function nowIso(): string {
	return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// ProposedCallQuery — parameterized finder input
// ---------------------------------------------------------------------------

/** Lookup selector for a proposed call: by its own `id` or by the review message it was staged on. */
export type ProposedCallQuery =
	| {
			readonly by: { readonly reviewMessageId: string };
			readonly include?: { readonly outcome?: boolean; readonly grant?: boolean };
	  }
	| {
			readonly by: { readonly id: string };
			readonly include?: { readonly outcome?: boolean; readonly grant?: boolean };
	  };

/** A proposed call with optionally-joined sibling rows. */
export interface ProposedCallView {
	readonly call: ProposedCall;
	/** Present when `include.outcome = true` (left-join: may be null). */
	readonly outcome?: OperationOutcome | null;
	/**
	 * Present when `include.grant = true` AND a tailored grant exists (inner-
	 * join semantics: `undefined` view means no match).
	 */
	readonly grant?: TailoredGrant;
}

/**
 * Parameterized reader for a proposed call. Replaces the three use-case
 * finders (`findProposedCallByReviewMessageId`, `findGrantedProposedCall`,
 * `findProposedCallWithOutcomeByReviewMessageId`).
 *
 * Lookup key: `by.reviewMessageId` or `by.id`.
 * Optional joins: `include.outcome` (left-join) and/or `include.grant`
 * (inner-join — returns `undefined` if the call has no tailored grant).
 *
 * @lore AU20 Am9: a new lookup dimension (by task, by agent) is a new `by`
 * variant; no new function required.
 */
export async function findProposedCall(
	db: HyperIdleDb,
	query: ProposedCallQuery,
): Promise<ProposedCallView | undefined> {
	const whereClause =
		"reviewMessageId" in query.by
			? eq(proposedCalls.reviewMessageId, query.by.reviewMessageId)
			: eq(proposedCalls.id, query.by.id);

	const wantOutcome = query.include?.outcome === true;
	const wantGrant = query.include?.grant === true;

	if (wantGrant) {
		// Inner-join with tailored_grants — undefined if no grant exists
		const [row] = await db
			.select({ call: proposedCalls, grant: tailoredGrants })
			.from(proposedCalls)
			.innerJoin(tailoredGrants, eq(tailoredGrants.proposedCallId, proposedCalls.id))
			.where(whereClause)
			.limit(1);
		if (!row) return undefined;
		if (wantOutcome) {
			const [outcomeRow] = await db
				.select()
				.from(operationOutcomes)
				.where(eq(operationOutcomes.proposedCallId, row.call.id))
				.limit(1);
			return { call: row.call, grant: row.grant, outcome: outcomeRow ?? null };
		}
		return { call: row.call, grant: row.grant };
	}

	if (wantOutcome) {
		// Left-join with operation_outcomes
		const [row] = await db
			.select({
				call: proposedCalls,
				outcome: operationOutcomes,
			})
			.from(proposedCalls)
			.leftJoin(operationOutcomes, eq(operationOutcomes.proposedCallId, proposedCalls.id))
			.where(whereClause)
			.limit(1);
		if (!row) return undefined;
		return { call: row.call, outcome: row.outcome };
	}

	// Plain call lookup (no join)
	const [row] = await db.select().from(proposedCalls).where(whereClause).limit(1);
	return row ? { call: row } : undefined;
}

// ---------------------------------------------------------------------------
// recordProposedCall — idempotent capture (replaces captureProposedCall)
// ---------------------------------------------------------------------------

/**
 * Insert a Proposed Call row idempotently (ON CONFLICT DO NOTHING semantics).
 * Returns `{ firstCapture: true }` if newly inserted, `{ firstCapture: false }`
 * if deduplicated.
 *
 * @lore AL7 WARNING-5.2: the `(origin_session_id, identity_hash)` constraint
 * MUST be a UNIQUE constraint so the INSERT ON CONFLICT DO NOTHING truly
 * deduplicates.
 */
export async function recordProposedCall(
	db: HyperIdleDb,
	input: {
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
			reviewMessageId: input.reviewMessageId,
			subjectThreadId: input.subjectThreadId,
			artifactId: input.artifactId,
			originSessionId: input.originSessionId,
			toolId: input.toolId,
			args: JSON.stringify(input.args),
			identityHash: input.hash,
			reversibility: "irreversible",
			status: "captured",
			stagedByAgentId: input.agentId,
			createdAt: nowIso(),
		})
		.onConflictDoNothing()
		.returning();
	return { firstCapture: rows.length > 0 };
}

// ---------------------------------------------------------------------------
// ProposedCallTransition — discriminated union for the state machine
// ---------------------------------------------------------------------------

/**
 * State-machine transition for a Proposed Call.
 *
 * | `to`              | selector              | payload                         | returns                    |
 * |-------------------|-----------------------|---------------------------------|----------------------------|
 * | `held`            | `{id}`                | —                               | `void`                     |
 * | `granted`         | `{id}`                | grant params + ports required   | `void`                     |
 * | `consumed`        | scope-tuple           | —                               | `{proposedCallId}\|null`   |
 * | `outcome-recorded`| `{id}`                | `{result: ToolResult}`          | `void`                     |
 *
 * @lore AU20 Am9: heterogeneity (scope-tuple vs id key, different return types,
 * injected recorder for `granted`, ToolResult payload) is captured in the
 * discriminated union — not hidden behind a lying signature.
 */
export type ProposedCallTransition =
	| { readonly to: "held"; readonly id: string }
	| {
			readonly to: "granted";
			readonly id: string;
			readonly taskScope: string;
			readonly agentScope: string;
			readonly approvedToolId: string;
			readonly approvedArgs: Record<string, unknown> | string;
			readonly argPinned?: boolean;
			readonly identityHash?: string;
	  }
	| {
			readonly to: "consumed";
			readonly taskId: string;
			readonly agentId: string;
			readonly toolId: string;
	  }
	| { readonly to: "outcome-recorded"; readonly id: string; readonly result: ToolResult };

// ---------------------------------------------------------------------------
// transitionProposedCall — unified state machine function
// ---------------------------------------------------------------------------

/**
 * Execute a state-machine transition on a Proposed Call.
 *
 * Overloads:
 * - `consumed` → returns `{ proposedCallId } | null` (CAS claim)
 * - All others → returns `void`
 *
 * @lore AU20 Am9: `ports.intentRecorder` is required for the `granted`
 * transition (composes grant + records reengagement intent inside one
 * 3-write tx). The `consumed` overload exposes its return type precisely
 * so callers never need to widen or cast.
 */
export function transitionProposedCall(
	tx: HyperIdleDb,
	transition: Extract<ProposedCallTransition, { to: "consumed" }>,
): Promise<{ readonly proposedCallId: string } | null>;
export function transitionProposedCall(
	tx: HyperIdleDb,
	transition: Exclude<ProposedCallTransition, { to: "consumed" }>,
	ports?: Pick<ReviewPorts, "intentRecorder">,
): Promise<void>;
export async function transitionProposedCall(
	tx: HyperIdleDb,
	transition: ProposedCallTransition,
	ports?: Pick<ReviewPorts, "intentRecorder">,
): Promise<{ readonly proposedCallId: string } | null | void> {
	switch (transition.to) {
		case "held": {
			await tx
				.update(proposedCalls)
				.set({ status: "held" })
				.where(eq(proposedCalls.id, transition.id));
			return;
		}

		case "granted": {
			const approvedArgsSer =
				typeof transition.approvedArgs === "string"
					? transition.approvedArgs
					: JSON.stringify(transition.approvedArgs);
			await tx.transaction(async (innerTx) => {
				await innerTx.insert(tailoredGrants).values({
					proposedCallId: transition.id,
					taskScope: transition.taskScope,
					agentScope: transition.agentScope,
					approvedToolId: transition.approvedToolId,
					approvedArgs: approvedArgsSer,
					argPinned: transition.argPinned ?? false,
					identityHash: transition.identityHash ?? null,
					consumed: false,
					retryCount: 0,
					mintedAt: nowIso(),
				});
				// Transition: captured → granted
				await innerTx
					.update(proposedCalls)
					.set({ status: "granted" })
					.where(and(eq(proposedCalls.id, transition.id), eq(proposedCalls.status, "captured")));
				if (ports?.intentRecorder) {
					const input: ReviewAgentWorkIntentInput = {
						kind: "reengagement",
						sourceKind: "proposed_call",
						sourceId: transition.id,
						requestedBy: transition.agentScope,
						idempotencyKey: `grant:${transition.id}`,
					};
					await ports.intentRecorder.record(innerTx, input);
				}
			});
			return;
		}

		case "consumed": {
			const [claimed] = await tx
				.update(tailoredGrants)
				.set({ consumed: true, consumedAt: nowIso() })
				.where(
					and(
						eq(tailoredGrants.taskScope, transition.taskId),
						eq(tailoredGrants.agentScope, transition.agentId),
						eq(tailoredGrants.approvedToolId, transition.toolId),
						eq(tailoredGrants.consumed, false),
					),
				)
				.returning();
			return claimed ? { proposedCallId: claimed.proposedCallId } : null;
		}

		case "outcome-recorded": {
			const { id, result } = transition;
			const executedAt = nowIso();
			if (result.success) {
				const receipt = typeof result.data === "string" ? result.data : JSON.stringify(result.data);
				await tx.insert(operationOutcomes).values({
					proposedCallId: id,
					status: "ok",
					receipt,
					executedAt,
				});
			} else {
				await tx.insert(operationOutcomes).values({
					proposedCallId: id,
					status: "failed",
					error: result.error,
					executedAt,
				});
			}
			const newStatus = result.success ? "executed" : "failed";
			await tx.update(proposedCalls).set({ status: newStatus }).where(eq(proposedCalls.id, id));
			return;
		}
	}
}

// ---------------------------------------------------------------------------
// handleUnconsumedGrantOnSessionEnd — INTERNAL liveness net (AC11b)
// NOT exported from barrel; consumed by registerReviewSubscriptions.
// ---------------------------------------------------------------------------

/**
 * AC11b — Liveness net: handles a session_ended where the tailored grant was
 * NOT consumed (session 2 crashed or did not reach the approved op).
 *
 * Behavior:
 * - `retryCount === 0` → increment to 1, record a reengagement intent (re-provision once).
 * - `retryCount >= 1` → transition PC to `held` + write a `failed` Outcome
 *   (the work did not execute; surface it, never silently hang).
 *
 * @lore AU20 Am9: this was formerly exported as `handleUnconsumedGrantOnSessionEnd`
 * with an `onReenqueue` callback. It is now INTERNAL, folded into
 * `registerReviewSubscriptions` as a `session_ended` subscriber. The
 * `onReenqueue` callback is replaced by `ports.intentRecorder` so re-provision
 * uses the same durable intent path as `transitionProposedCall({to:'granted'})`.
 *
 * @lore AL7 Task 9.5: fires ONLY on crash/no-show. Re-derivation and arg
 * drift in a successful session 2 are trusted behavior — the liveness net
 * never trips on a session that consumed the grant.
 */
type LivenessIntentRecorder = Pick<ReviewPorts, "intentRecorder">["intentRecorder"];

/**
 * Shared two-branch liveness-net body (AC11b), factored out so both the
 * `session_ended` liveness net (`handleUnconsumedGrantOnSessionEnd`, keyed on
 * task+agent) and the pre-handoff `agent_run_admission_failed` reaction
 * (`reengageOnAdmissionFailure`, keyed directly on the proposed call the
 * intent named) apply IDENTICAL first-no-show/second-no-show semantics —
 * one behavior, two trigger points.
 */
async function applyLivenessRetry(
	db: HyperIdleDb,
	grant: TailoredGrant,
	intentRecorder: LivenessIntentRecorder,
): Promise<void> {
	if (grant.retryCount === 0) {
		// First no-show: increment retry, record reengagement intent
		await db
			.update(tailoredGrants)
			.set({ retryCount: 1 })
			.where(eq(tailoredGrants.proposedCallId, grant.proposedCallId));
		const input: ReviewAgentWorkIntentInput = {
			kind: "reengagement",
			sourceKind: "proposed_call",
			sourceId: grant.proposedCallId,
			requestedBy: grant.agentScope,
			idempotencyKey: `liveness:retry1:${grant.proposedCallId}`,
		};
		await intentRecorder.record(db, input);
	} else {
		// Second no-show: give up — transition PC to held + write failed Outcome
		await db
			.update(proposedCalls)
			.set({ status: "held" })
			.where(eq(proposedCalls.id, grant.proposedCallId));
		await db.insert(operationOutcomes).values({
			proposedCallId: grant.proposedCallId,
			status: "failed",
			error: "approved op did not execute: session 2 ended without consuming the grant",
			executedAt: nowIso(),
		});
	}
}

export async function handleUnconsumedGrantOnSessionEnd(
	db: HyperIdleDb,
	opts: {
		taskId: string;
		agentId: string;
		intentRecorder: LivenessIntentRecorder;
	},
): Promise<void> {
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
		return;
	}

	for (const grant of grants) {
		await applyLivenessRetry(db, grant, opts.intentRecorder);
	}
}

/**
 * AU21 Increment 3 Wave 0 (§10 subscriber table) — the `reengagement` reaction
 * to a terminal `agent_run_admission_failed`: a granted proposed call whose
 * re-provision never even reached a session (pre-handoff, not merely
 * unconsumed-post-session) applies the SAME liveness-net retry/give-up
 * pattern as the session-ended path, keyed directly on the proposed call the
 * intent named rather than on (taskId, agentId).
 */
export async function reengageOnAdmissionFailure(
	db: HyperIdleDb,
	opts: {
		proposedCallId: string;
		intentRecorder: LivenessIntentRecorder;
	},
): Promise<void> {
	const [grant] = await db
		.select()
		.from(tailoredGrants)
		.where(eq(tailoredGrants.proposedCallId, opts.proposedCallId));

	if (!grant) {
		return;
	}

	await applyLivenessRetry(db, grant, opts.intentRecorder);
}
