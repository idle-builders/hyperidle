import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import { err, KNOWLEDGE_LAYERS, ok } from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

const queryPracticeInputSchema = z.object({
	query: z.string().min(1),
	layer: z.enum(KNOWLEDGE_LAYERS).optional(),
	limit: z.number().int().positive().max(100).optional(),
});

type QueryPracticeInput = z.infer<typeof queryPracticeInputSchema>;

async function handler<TDb>(
	args: QueryPracticeInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult> {
	const parsed = queryPracticeInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const { query, layer = "L3", limit = 20 } = parsed.data;

	const allMatches = await ports.knowledge.search(ctx.db, query, { limit: limit * 5 });
	const items = allMatches.filter((item) => item.layer === layer).slice(0, limit);

	return ok({ items });
}

export function createQueryPracticeTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<QueryPracticeInput, TDb> {
	return {
		name: "query_practice",
		description:
			"Search the knowledge fabric for L3 practices (defaults to layer L3) matching a free-text query. Use to discover prior patterns, decisions, or reflections before starting work.",
		inputSchema: queryPracticeInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
	};
}
