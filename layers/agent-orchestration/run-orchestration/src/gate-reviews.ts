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
import { type GateReviewRow, gateReviews, type HyperIdleDb } from "@hyperidle/db";
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
