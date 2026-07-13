import { search as searchKnowledge } from "@hyperidle/knowledge";
import { KNOWLEDGE_LAYERS } from "@hyperidle/shared";
import z from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

const queryPracticeInputSchema = z.object({
	query: z.string().min(1),
	layer: z.enum(KNOWLEDGE_LAYERS).optional(),
	limit: z.number().int().positive().max(100).optional(),
});

type QueryPracticeInput = z.infer<typeof queryPracticeInputSchema>;

async function handler(args: QueryPracticeInput, ctx: ToolContext): Promise<ToolResult> {
	const parsed = queryPracticeInputSchema.safeParse(args);
	if (!parsed.success) {
		return err("INVALID_INPUT", parsed.error.message);
	}
	const { query, layer = "L3", limit = 20 } = parsed.data;

	// `searchKnowledge` (fabric.search) returns FTS-ranked items across all
	// layers. We then filter to the requested layer in memory; layered FTS is
	// a future optimization and not required at D4 scale.
	const allMatches = await searchKnowledge(ctx.db, query, { limit: limit * 5 });
	const items = allMatches.filter((item) => item.layer === layer).slice(0, limit);

	return ok({ items });
}

export const queryPracticeTool: ToolDefinition<QueryPracticeInput> = {
	name: "query_practice",
	description:
		"Search the knowledge fabric for L3 practices (defaults to layer L3) matching a free-text query. Use to discover prior patterns, decisions, or reflections before starting work.",
	inputSchema: queryPracticeInputSchema,
	handler,
};
