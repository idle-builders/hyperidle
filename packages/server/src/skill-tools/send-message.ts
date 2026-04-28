import * as crypto from "node:crypto";
import { agents, messages, threads } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

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

	// L1a: legacy `kind='direct'` threads now project as host_kind='agent' +
	// host_id=recipient. The (host_kind,host_id) index covers this lookup.
	const directThreads = ctx.db
		.select()
		.from(threads)
		.where(and(eq(threads.hostKind, "agent"), eq(threads.hostId, to)))
		.all();
	let threadId: string | undefined;
	for (const thread of directThreads) {
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

	if (!threadId) {
		threadId = crypto.randomUUID();
		ctx.db
			.insert(threads)
			.values({
				id: threadId,
				hostKind: "agent",
				hostId: to,
				initiatorId: ctx.agentId,
				participants: JSON.stringify([ctx.agentId, to]),
				lastActiveAt: now,
				createdAt: now,
			})
			.run();
	}

	const messageId = crypto.randomUUID();
	const text = subject ? `${subject}\n\n${body}` : body;
	ctx.db
		.insert(messages)
		.values({
			id: messageId,
			senderId: ctx.agentId,
			threadId,
			type: "plain",
			payload: JSON.stringify({ text }),
			clientKey: messageId,
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
