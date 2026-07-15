import * as crypto from "node:crypto";
import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import { err, ok } from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

const sendMessageInputSchema = z.object({
	to: z.string().min(1),
	subject: z.string().optional(),
	body: z.string().min(1),
});

type SendMessageInput = z.infer<typeof sendMessageInputSchema>;

async function handler<TDb>(
	args: SendMessageInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult> {
	const parsed = sendMessageInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const { to, subject, body } = parsed.data;

	const recipient = await ports.users.getUserById(ctx.db, to);
	if (!recipient) {
		return err("NOT_FOUND", `Recipient agent not found: ${to}`);
	}

	const now = new Date().toISOString();
	const threadId = await ports.conversation.findOrCreateDirectThread(ctx.db, ctx.agentId, to, now);

	const messageId = crypto.randomUUID();
	const text = subject ? `${subject}\n\n${body}` : body;
	await ports.conversation.insertMessage(ctx.db, {
		id: messageId,
		senderId: ctx.agentId,
		threadId,
		type: "plain",
		payload: JSON.stringify({ text }),
		clientKey: messageId,
		createdAt: now,
	});

	return ok({ messageId, threadId });
}

export function createSendMessageTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<SendMessageInput, TDb> {
	return {
		name: "send_message",
		description:
			"Send a direct message to another agent. Reuses an existing direct thread when one exists between the two agents, otherwise creates a new one.",
		inputSchema: sendMessageInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
	};
}
