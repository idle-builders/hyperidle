import { messages } from "@hyperidle/db";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

const readInboxInputSchema = z.object({
	limit: z.number().int().positive().max(100).optional(),
});

type ReadInboxInput = z.infer<typeof readInboxInputSchema>;

// biome-ignore lint/suspicious/useAwait: ToolDefinition.handler requires async signature
async function handler(args: ReadInboxInput, ctx: ToolContext): Promise<ToolResult> {
	const parsed = readInboxInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}

	const limit = parsed.data.limit ?? 50;
	const rows = ctx.db
		.select()
		.from(messages)
		.where(eq(messages.recipientId, ctx.agentId))
		.orderBy(desc(messages.createdAt))
		.limit(limit)
		.all();

	return ok({ messages: rows });
}

export const readInboxTool: ToolDefinition<ReadInboxInput> = {
	name: "read_inbox",
	description: "Read messages from the current agent's inbox, ordered newest first.",
	inputSchema: readInboxInputSchema,
	handler,
};
