import { randomUUID } from "node:crypto";
import { ARTIFACT_VIEW_SHAPES, type ReviewPayload } from "@hyperidle/shared";
import z from "zod";
import {
	getFirstThreadByHost,
	insertMessage,
	insertThread,
	updateThread,
} from "@hyperidle/core-app";
import { work } from "@hyperidle/core-app";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

const artifactRefSchema = z.object({
	id: z.string().min(1),
	kind: z.enum(ARTIFACT_VIEW_SHAPES),
});

const submitReviewInputSchema = z.object({
	title: z.string().min(1).max(512),
	reasoning: z.array(z.string().max(1024)).min(1).max(16),
	artifactRef: artifactRefSchema.optional(),
});

type SubmitReviewInput = z.infer<typeof submitReviewInputSchema>;

/**
 * Submit a review for the current bet's work.
 *
 * Finds or creates a thread with hostKind="bet", hostId=betId (derived from
 * the session's parent task), then posts a review-type message (or a plain
 * fallback when no artifactRef is provided). Adds the agent as a participant
 * of the bet's host thread so they can receive verdict replies via read_inbox.
 *
 * @lore R5 D2: the review is posted to the BET's host thread (not the task's)
 * because the WorkBet page renders HostThreadSection with hostKind="bet". The
 * handoff_to tool creates items-based reviews on the task thread — that is the
 * legacy path. R5's submit_review uses the L1 message system instead.
 *
 * @lore R5 D5: when artifactRef is omitted, a plain-type message is posted
 * with a "Review requested:" prefix. This fallback allows the work loop to
 * close without requiring a fully materialised artifact. The full ReviewPayload
 * path (type="review") works when the agent has previously written an artifact.
 */
async function handler(args: SubmitReviewInput, ctx: ToolContext): Promise<ToolResult> {
	const parsed = submitReviewInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;

	// 1. Look up parent task to derive betId.
	const parentTask = await work.getTaskById(ctx.db, ctx.taskId);
	if (!parentTask) {
		return err("NOT_FOUND", `Parent task not found: ${ctx.taskId}`);
	}
	const betId = parentTask.betId;

	// 2. Find or create the bet's host thread.
	const now = new Date().toISOString();
	const existingThread = await getFirstThreadByHost(ctx.db, "bet", betId);

	let threadId: string;
	if (existingThread) {
		threadId = existingThread.id;
		// Ensure agent is a participant in the existing thread.
		const parts = JSON.parse(existingThread.participants) as string[];
		if (!parts.includes(ctx.agentId)) {
			parts.push(ctx.agentId);
			await updateThread(ctx.db, threadId, {
				participants: JSON.stringify(parts),
				lastActiveAt: now,
			});
		}
	} else {
		// Create the bet host thread with the agent as initiator + participant.
		threadId = randomUUID();
		await insertThread(ctx.db, {
			id: threadId,
			hostKind: "bet",
			hostId: betId,
			initiatorId: ctx.agentId,
			participants: JSON.stringify([ctx.agentId]),
			lastActiveAt: now,
			createdAt: now,
		});
	}

	// 3. Post the review message (or plain fallback).
	const messageId = randomUUID();

	if (input.artifactRef) {
		// Full review message with structured ReviewPayload.
		const payload: ReviewPayload = {
			title: input.title,
			reasoning: input.reasoning,
			artifactRef: input.artifactRef,
		};
		await insertMessage(ctx.db, {
			id: messageId,
			senderId: ctx.agentId,
			threadId,
			type: "review",
			payload: JSON.stringify(payload),
			clientKey: messageId,
			createdAt: now,
		});
	} else {
		// Fallback: plain message with review summary prefix.
		const text = `Review requested: ${input.title}\n\n${input.reasoning.join("\n")}`;
		await insertMessage(ctx.db, {
			id: messageId,
			senderId: ctx.agentId,
			threadId,
			type: "plain",
			payload: JSON.stringify({ text }),
			clientKey: messageId,
			createdAt: now,
		});
	}

	// 4. Update thread lastActiveAt.
	await updateThread(ctx.db, threadId, { lastActiveAt: now });

	return ok({ messageId, threadId, betId });
}

export const submitReviewTool: ToolDefinition<SubmitReviewInput> = {
	name: "submit_review",
	description:
		"Submit a review for the current bet's work. Posts a review-type message to the bet's host thread. If no artifactRef is provided, falls back to a plain message with the review summary.",
	inputSchema: submitReviewInputSchema,
	handler,
};
