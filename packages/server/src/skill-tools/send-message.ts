import * as crypto from "node:crypto";
import { agents, messages, threads } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { type ToolResult, err, ok } from "./tool-result.js";

const sendMessageInputSchema = z.object({
	to: z.string().min(1),
	subject: z.string().optional(),
	body: z.string().min(1),
});

type SendMessageInput = z.infer<typeof sendMessageInputSchema>;

// biome-ignore lint/suspicious/useAwait: ToolDefinition.handler requires async signature
async function handler(args: SendMessageInput, ctx: ToolContext): Promise<ToolResult> {
	const parsed = sendMessageInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const { to, subject, body } = parsed.data;

	const recipient = ctx.db.select().from(agents).where(eq(agents.id, to)).get();
	if (!recipient) {
		return err("NOT_FOUND", `Recipient agent not found: ${to}`);
	}

	const now = new Date().toISOString();

	// @lore I6: queries WHERE kind = 'direct' instead of loading all threads.
	// With 1000+ threads, the previous full-table scan was O(n); this is O(direct threads only).
	const directThreads = ctx.db.select().from(threads).where(eq(threads.kind, "direct")).all();
	let threadId: string | undefined;
	for (const thread of directThreads) {
		if (thread.participants) {
			const participants = JSON.parse(thread.participants) as string[];
			if (
				participants.length === 2 &&
				participants.includes(ctx.agentId) &&
				participants.includes(to)
			) {
				threadId = thread.id;
				break;
			}
		}
	}

	if (!threadId) {
		threadId = crypto.randomUUID();
		ctx.db
			.insert(threads)
			.values({
				id: threadId,
				kind: "direct",
				participants: JSON.stringify([ctx.agentId, to]),
				createdAt: now,
			})
			.run();
	}

	const messageId = crypto.randomUUID();
	ctx.db
		.insert(messages)
		.values({
			id: messageId,
			senderId: ctx.agentId,
			recipientId: to,
			threadId,
			subject: subject ?? null,
			body,
			createdAt: now,
		})
		.run();

	return ok({ messageId, threadId });
}

export const sendMessageTool: ToolDefinition<SendMessageInput> = {
	name: "send_message",
	description:
		"Send a direct message to another agent. Reuses an existing direct thread when one exists between the two agents, otherwise creates a new one.",
	inputSchema: sendMessageInputSchema,
	handler,
};
