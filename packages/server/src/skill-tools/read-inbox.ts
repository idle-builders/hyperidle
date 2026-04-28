import { messages, threads } from "@hyperidle/db";
import { desc, eq, ne } from "drizzle-orm";
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
	// @lore L1a: messages no longer carry recipient_id. An agent's inbox is
	// every message in a thread the agent participates in but did not send.
	// We pull more rows than `limit` to allow JSON participant filtering in
	// JS, then cap to `limit`. For the L1a scope the working set is small;
	// a future story may project a participants table.
	const rows = ctx.db
		.select()
		.from(messages)
		.innerJoin(threads, eq(messages.threadId, threads.id))
		.where(ne(messages.senderId, ctx.agentId))
		.orderBy(desc(messages.createdAt))
		.limit(limit * 4)
		.all();

	const filtered = rows
		.filter((row) => {
			try {
				const parts = JSON.parse(row.threads.participants) as string[];
				return parts.includes(ctx.agentId);
			} catch {
				return false;
			}
		})
		.slice(0, limit)
		.map((row) => row.messages);

	return ok({ messages: filtered });
}

export const readInboxTool: ToolDefinition<ReadInboxInput> = {
	name: "read_inbox",
	description: "Read messages from the current agent's inbox, ordered newest first.",
	inputSchema: readInboxInputSchema,
	handler,
};
