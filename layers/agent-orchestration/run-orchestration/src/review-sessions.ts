/**
 * Which session filed which review or question.
 *
 * A review is how an agent asks a human for agreement, and a questionnaire how
 * it asks a question; its session ends there. When the human answers, this
 * record says which session to bring back. A questionnaire is linked here the
 * same way, under `reviewMessageId`. Nothing else about either needs remembering.
 */

import { randomUUID } from "node:crypto";
import { type HyperIdleDb, type ReviewSessionRow, reviewSessions, sessions } from "@hyperidle/db";
import type {
	BakedAgentRunnableConfig,
	BakedSessionResumeRequest,
	ReviewVerdictOutcome,
	SessionResumeReply,
} from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";

export interface ReviewSessionLink {
	readonly reviewMessageId: string;
	readonly sessionId: string;
}

/**
 * Record which session filed this review.
 *
 * Idempotent on the review message: filing is a single act, and one review is
 * answered by one verdict that resumes one session.
 */
export async function recordReviewSession(
	db: HyperIdleDb,
	link: ReviewSessionLink,
	now: string,
): Promise<void> {
	await db
		.insert(reviewSessions)
		.values({
			id: randomUUID(),
			reviewMessageId: link.reviewMessageId,
			sessionId: link.sessionId,
			createdAt: now,
		})
		.onConflictDoNothing({ target: reviewSessions.reviewMessageId });
}

/** The session that filed this review, or undefined if no session did. */
export async function findReviewSession(
	db: HyperIdleDb,
	reviewMessageId: string,
): Promise<ReviewSessionRow | undefined> {
	const [row] = await db
		.select()
		.from(reviewSessions)
		.where(eq(reviewSessions.reviewMessageId, reviewMessageId));
	return row;
}

/**
 * Does a human owe this session an answer?
 *
 * True exactly when the session filed a review, because `submit_review` writes
 * the link row. Teardown asks this rather than watching for the tool call: a
 * return action reaches the provisioner by two different paths depending on
 * whether the MCP bridge is open, and a check that reads only one of them is
 * green in a test and dead on every real run. The row is the fact; the event is
 * a way of hearing about it.
 */
export async function sessionAwaitsVerdict(db: HyperIdleDb, sessionId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: reviewSessions.id })
		.from(reviewSessions)
		.where(eq(reviewSessions.sessionId, sessionId))
		.limit(1);
	return row !== undefined;
}

/** Queues one `session_resume` intent. Injected so this file does no enqueueing of its own. */
export type ResumeIntentEnqueuer = (input: {
	readonly kind: "session_resume";
	readonly sourceKind: "review_verdict";
	readonly sourceId: string;
	readonly requestedBy?: string;
	readonly idempotencyKey: string;
	readonly resume: BakedSessionResumeRequest;
}) => Promise<unknown>;

/**
 * Record a person's verdict on a review, or answer to a question, and queue the
 * resume that carries it back.
 *
 * Three outcomes, each a fact the caller may have to act on:
 *
 * - **not_a_review_session** — no session filed this review, so there is nothing
 *   to resume and nothing wrong. A review created any other way lands here.
 * - **not_resumable** — a session filed it, but cannot be brought back. The human
 *   answered something that will not reach anyone, so they have to be told.
 * - **queued** — the resume is durable and the drain will carry it.
 */
export async function recordReviewVerdict(
	db: HyperIdleDb,
	input: SessionResumeReply & {
		readonly reviewMessageId: string;
		readonly decidedBy: string;
		readonly threadId: string;
		readonly agentConfig?: BakedAgentRunnableConfig;
	},
	enqueue: ResumeIntentEnqueuer,
): Promise<ReviewVerdictOutcome> {
	const link = await findReviewSession(db, input.reviewMessageId);
	if (!link) return { status: "not_a_review_session" };

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
		sourceKind: "review_verdict",
		sourceId: input.reviewMessageId,
		requestedBy: input.decidedBy,
		// One resume per verdict on one review. A second verdict on the same review
		// is a re-open, which the thread route already refuses first.
		idempotencyKey: `review-verdict:${input.reviewMessageId}`,
		resume: {
			sessionId: link.sessionId,
			harnessSessionId: session.harnessSessionId,
			// The directory the session ran in — cursor-agent finds its chat by this
			// path and silently loses all context without it.
			sandboxPath: session.sandboxSnapshot,
			decision: input.decision,
			...(input.note !== undefined ? { note: input.note } : {}),
			...(input.answer !== undefined ? { answer: input.answer } : {}),
			threadId: input.threadId,
			agentId: session.agentId,
			...(input.agentConfig ? { agentConfig: input.agentConfig } : {}),
		},
	});
	return { status: "queued" };
}
