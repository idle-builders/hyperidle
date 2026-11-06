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
	SessionResumeReply,
} from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";
import { buildVerdictMessage } from "./verdict-message.js";

/** What happened when a verdict tried to send an agent back to its work. */
export type ReviewVerdictOutcome =
	/** The resume is queued. The agent will be brought back. */
	| { readonly status: "queued" }
	/** No session filed this review. Nothing to resume, and nothing wrong. */
	| { readonly status: "not_a_review_session" }
	/** A session filed it but cannot be brought back. The human has to be told. */
	| { readonly status: "not_resumable"; readonly reason: string };

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

/** Queues one resume. Injected so this file does no enqueueing of its own. */
export type ResumeEnqueuer = (input: {
	readonly reviewMessageId: string;
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
 * - **queued** — the resume is durable and the drain will carry it, or the answer
 *   reached the still-running session.
 */
/**
 * Optional: try delivering the verdict directly into a still-running session
 * via stdin, bypassing the resume queue. Returns "delivered" on success,
 * "not_found" or "unsupported" to fall through to the normal queue path.
 */
export type LiveSessionDeliverer = (
	sessionId: string,
	text: string,
) => Promise<"delivered" | "unsupported" | "not_found">;

export async function recordReviewVerdict(
	db: HyperIdleDb,
	input: SessionResumeReply & {
		readonly reviewMessageId: string;
		readonly threadId: string;
		readonly agentConfig?: BakedAgentRunnableConfig;
		readonly taskId?: string;
	},
	enqueue: ResumeEnqueuer,
	tryDeliverToLive?: LiveSessionDeliverer,
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

	// Try delivering to an active run via stdin before queuing a resume.
	if (tryDeliverToLive !== undefined) {
		const verdictText = buildVerdictMessage(input);
		const deliveryResult = await tryDeliverToLive(link.sessionId, verdictText);
		if (deliveryResult === "delivered") {
			return { status: "queued" };
		}
	}

	if (!session.harnessSessionId) {
		return {
			status: "not_resumable",
			reason: `the harness never reported an id for session ${link.sessionId}, so it cannot be resumed`,
		};
	}

	await enqueue({
		reviewMessageId: input.reviewMessageId,
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
			...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
		},
	});
	return { status: "queued" };
}
