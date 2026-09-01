/**
 * The reviews a gate caused.
 *
 * When an agent is blocked and files a review, this records that the two are the
 * same event. That record is the whole authority for clearing an action later:
 * approving a review with no row here clears nothing.
 *
 * @lore BA2: An abandoned attempt registered on every `submit_review`, so
 * approving an ordinary design review granted a bypass. Requiring a pending
 * denial at filing time is what makes the clearance unforgeable by an agent —
 * it cannot file its way to a permission it was never denied.
 */

import { randomUUID } from "node:crypto";
import { type GateReviewRow, gateReviews, type HyperIdleDb, sessions } from "@hyperidle/db";
import type {
	BakedAgentRunnableConfig,
	BakedSessionResumeRequest,
	GateVerdictOutcome,
} from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";

/** One action a rule blocked: the rule that matched and the tool it matched on. */
export interface DeniedActionRecord {
	readonly ruleId: string;
	readonly toolName: string;
}

export interface GateReviewLink {
	readonly reviewMessageId: string;
	readonly sessionId: string;
	readonly ruleId: string;
	readonly toolName: string;
}

/**
 * Record that `reviewMessageId` is the review a gate denial produced.
 *
 * Idempotent on the review message: filing is a single act, and a second row for
 * the same review would be a second action cleared by one human decision.
 */
export async function recordGateReview(
	db: HyperIdleDb,
	link: GateReviewLink,
	now: string,
): Promise<void> {
	await db
		.insert(gateReviews)
		.values({
			id: randomUUID(),
			reviewMessageId: link.reviewMessageId,
			sessionId: link.sessionId,
			ruleId: link.ruleId,
			toolName: link.toolName,
			createdAt: now,
		})
		.onConflictDoNothing({ target: gateReviews.reviewMessageId });
}

/**
 * The gate denial this review came from, or undefined when the review was not
 * caused by one — an ordinary design review, which may clear nothing.
 */
export async function findGateReviewByMessage(
	db: HyperIdleDb,
	reviewMessageId: string,
): Promise<GateReviewRow | undefined> {
	const [row] = await db
		.select()
		.from(gateReviews)
		.where(eq(gateReviews.reviewMessageId, reviewMessageId));
	return row;
}

/** Queues one `session_resume` intent. Injected so this file does no enqueueing of its own. */
export type ResumeIntentEnqueuer = (input: {
	readonly kind: "session_resume";
	readonly sourceKind: "gate_review";
	readonly sourceId: string;
	readonly requestedBy?: string;
	readonly idempotencyKey: string;
	readonly resume: BakedSessionResumeRequest;
}) => Promise<unknown>;

/**
 * Record a human's verdict on a review, and queue the resume when that review
 * was one a gate caused.
 *
 * Three outcomes, and each one is a fact the caller may have to act on:
 *
 * - **not_a_gate_review** — an ordinary review. Nothing to resume and nothing
 *   wrong. This is the common case and the reason approving a design review
 *   grants no bypass.
 * - **not_resumable** — the review WAS caused by a gate, but the agent cannot be
 *   brought back. The human approved something that will not happen, so they
 *   have to be told.
 * - **queued** — the resume is durable and the drain will carry it.
 *
 * @lore BA2: The resume is baked here rather than read at drain time, matching
 * every other intent kind. It also fixes what was approved at the moment a human
 * decided it, rather than reconstructing it later from rows that have moved on.
 */
export async function recordGateVerdict(
	db: HyperIdleDb,
	input: {
		readonly reviewMessageId: string;
		readonly decision: "approve" | "decline";
		readonly decidedBy: string;
		readonly threadId: string;
		readonly agentConfig?: BakedAgentRunnableConfig;
	},
	enqueue: ResumeIntentEnqueuer,
): Promise<GateVerdictOutcome> {
	const link = await findGateReviewByMessage(db, input.reviewMessageId);
	if (!link) return { status: "not_a_gate_review" };

	const [session] = await db.select().from(sessions).where(eq(sessions.id, link.sessionId));
	if (!session) {
		return {
			status: "not_resumable",
			reason: `the session that asked (${link.sessionId}) no longer exists`,
		};
	}
	if (!session.harnessSessionId) {
		return {
			status: "not_resumable",
			reason: `the harness never reported an id for session ${link.sessionId}, so it cannot be resumed`,
		};
	}

	await enqueue({
		kind: "session_resume",
		sourceKind: "gate_review",
		sourceId: input.reviewMessageId,
		requestedBy: input.decidedBy,
		// One resume per verdict on one review. A second verdict on the same review
		// is a re-open, which the thread route already refuses first.
		idempotencyKey: `gate-verdict:${input.reviewMessageId}`,
		resume: {
			sessionId: link.sessionId,
			harnessSessionId: session.harnessSessionId,
			ruleId: link.ruleId,
			toolName: link.toolName,
			decision: input.decision,
			threadId: input.threadId,
			agentId: session.agentId,
			...(input.agentConfig ? { agentConfig: input.agentConfig } : {}),
		},
	});
	return { status: "queued" };
}
