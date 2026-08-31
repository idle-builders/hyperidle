/**
 * Gate reviews — persistence layer for the action gate review link.
 *
 * Records the association between a gate block and the review the agent filed.
 * Only a review with a gate_review record may trigger a session resume on verdict.
 *
 * @lore BA2 no-extra-clearance-from-ordinary-review: the lookup by reviewMessageId
 * is the guard. If a review was not created by the gate, there is no record, and
 * the verdict handler takes no gate action.
 */

import { randomUUID } from "node:crypto";
import { type GateReviewRow, gateReviews, type HyperIdleDb } from "@hyperidle/db";
import { eq } from "drizzle-orm";

export interface GateReview {
	readonly id: string;
	readonly sessionId: string;
	readonly reviewMessageId: string;
	readonly blockedTool: string;
	readonly rulePattern: string;
	readonly ruleId: string;
	readonly nativeSessionId: string | null;
	readonly agentId: string | null;
	readonly taskId: string | null;
	readonly createdAt: string;
}

function rowToGateReview(row: GateReviewRow): GateReview {
	return {
		id: row.id,
		sessionId: row.sessionId,
		reviewMessageId: row.reviewMessageId,
		blockedTool: row.blockedTool,
		rulePattern: row.rulePattern,
		ruleId: row.ruleId,
		nativeSessionId: row.nativeSessionId ?? null,
		agentId: row.agentId ?? null,
		taskId: row.taskId ?? null,
		createdAt: row.createdAt,
	};
}

export interface RecordGateReviewInput {
	readonly sessionId: string;
	readonly reviewMessageId: string;
	readonly blockedTool: string;
	readonly rulePattern: string;
	readonly ruleId: string;
	/** Harness-native session ID — used by the verdict reaction to resume the right session. */
	readonly nativeSessionId?: string | null;
	/** The agent ID that was running — stored to avoid a sessions table read in the verdict reaction. */
	readonly agentId?: string | null;
	/** The task ID the session was running for. */
	readonly taskId?: string | null;
	/** Override current timestamp for deterministic tests only. */
	readonly now?: string;
}

/** Record that a review was filed due to a gate block. */
export async function recordGateReview(
	db: HyperIdleDb,
	input: RecordGateReviewInput,
): Promise<GateReview> {
	const row: GateReviewRow = {
		id: randomUUID(),
		sessionId: input.sessionId,
		reviewMessageId: input.reviewMessageId,
		blockedTool: input.blockedTool,
		rulePattern: input.rulePattern,
		ruleId: input.ruleId,
		nativeSessionId: input.nativeSessionId ?? null,
		agentId: input.agentId ?? null,
		taskId: input.taskId ?? null,
		createdAt: input.now ?? new Date().toISOString(),
	};
	await db.insert(gateReviews).values(row);
	return rowToGateReview(row);
}

/**
 * Look up a gate review by review message ID.
 * Returns undefined if this review was NOT caused by a gate block.
 */
export async function findGateReviewByMessageId(
	db: HyperIdleDb,
	reviewMessageId: string,
): Promise<GateReview | undefined> {
	const rows = await db
		.select()
		.from(gateReviews)
		.where(eq(gateReviews.reviewMessageId, reviewMessageId))
		.limit(1);
	return rows[0] ? rowToGateReview(rows[0]) : undefined;
}
