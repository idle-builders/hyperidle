import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import { err, ok } from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

const readInboxInputSchema = z.object({
	limit: z.number().int().positive().max(100).optional(),
});

type ReadInboxInput = z.infer<typeof readInboxInputSchema>;

async function handler<TDb>(
	args: ReadInboxInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult> {
	const parsed = readInboxInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}

	const limit = parsed.data.limit ?? 50;
	const rows = await ports.conversation.listInboxBySenderExclusion(ctx.db, ctx.agentId, limit * 4);

	const filtered = rows
		.filter((row) => {
			try {
				const parts = JSON.parse(row.participants) as string[];
				return parts.includes(ctx.agentId);
			} catch {
				return false;
			}
		})
		.slice(0, limit)
		.map((row) => row.message);

	return ok({ messages: filtered });
}

export function createReadInboxTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<ReadInboxInput, TDb> & { readonly reversibility: "reversible" } {
	return {
		name: "read_inbox",
		description: "Read messages from the current agent's inbox, ordered newest first.",
		inputSchema: readInboxInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
		reversibility: "reversible",
	};
}
