import { randomUUID } from "node:crypto";
import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import { ARTIFACT_VIEW_SHAPES, err, ok, type ReviewPayload } from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

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

async function handler<TDb>(
	args: SubmitReviewInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult> {
	const parsed = submitReviewInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const input = parsed.data;

	const parentTask = await ports.work.getTaskById(ctx.db, ctx.taskId);
	if (!parentTask) {
		return err("NOT_FOUND", `Parent task not found: ${ctx.taskId}`);
	}
	const betId = parentTask.betId;

	const now = new Date().toISOString();
	const existingThread = await ports.conversation.getFirstThreadByHost(ctx.db, "bet", betId);

	let threadId: string;
	if (existingThread) {
		threadId = existingThread.id;
		const parts = JSON.parse(existingThread.participants) as string[];
		if (!parts.includes(ctx.agentId)) {
			parts.push(ctx.agentId);
			await ports.conversation.updateThread(ctx.db, threadId, {
				participants: JSON.stringify(parts),
				lastActiveAt: now,
			});
		}
	} else {
		threadId = randomUUID();
		await ports.conversation.insertThread(ctx.db, {
			id: threadId,
			hostKind: "bet",
			hostId: betId,
			initiatorId: ctx.agentId,
			participants: JSON.stringify([ctx.agentId]),
			lastActiveAt: now,
			createdAt: now,
		});
	}

	const messageId = randomUUID();

	if (input.artifactRef) {
		const payload: ReviewPayload = {
			title: input.title,
			reasoning: input.reasoning,
			artifactRef: input.artifactRef,
		};
		await ports.conversation.insertMessage(ctx.db, {
			id: messageId,
			senderId: ctx.agentId,
			threadId,
			type: "review",
			payload: JSON.stringify(payload),
			clientKey: messageId,
			createdAt: now,
		});
	} else {
		const text = `Review requested: ${input.title}\n\n${input.reasoning.join("\n")}`;
		await ports.conversation.insertMessage(ctx.db, {
			id: messageId,
			senderId: ctx.agentId,
			threadId,
			type: "plain",
			payload: JSON.stringify({ text }),
			clientKey: messageId,
			createdAt: now,
		});
	}

	await ports.conversation.updateThread(ctx.db, threadId, { lastActiveAt: now });

	return ok({ messageId, threadId, betId });
}

export function createSubmitReviewTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<SubmitReviewInput, TDb> {
	return {
		name: "submit_review",
		description:
			"Submit a review for the current bet's work. Posts a review-type message to the bet's host thread. If no artifactRef is provided, falls back to a plain message with the review summary.",
		inputSchema: submitReviewInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
	};
}
