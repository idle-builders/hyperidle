import { items, knowledgeItems } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { type ToolResult, err, ok } from "./tool-result.js";

/**
 * `score_attention` — G1 stub. Callers supply a pre-computed score in [0,1];
 * the tool persists it onto either an `items` row (scaled to 0-100 integer)
 * or a `knowledge_items` row (real). G2 will replace the input with a
 * computed score from the attention engine. Contract stays stable.
 *
 * @lore Encoding asymmetry: `items.attentionScore` is stored as integer 0-100
 * (the human UI buckets attention into coarse percentages and the column
 * is an INTEGER), while `knowledge_items.attentionScore` is REAL 0-1 (used
 * by the relevance-scoring engine which multiplies it with other 0-1
 * weights). Both schemas pre-date G1; the tool translates here rather than
 * migrate two live stores for a single unit-of-measure difference.
 */
const scoreAttentionInputSchema = z.object({
	target: z.enum(["item", "knowledge_item"]),
	id: z.string().min(1),
	score: z.number().min(0).max(1),
});

type ScoreAttentionInput = z.infer<typeof scoreAttentionInputSchema>;

interface ScoreAttentionData {
	readonly target: "item" | "knowledge_item";
	readonly id: string;
	readonly score: number;
}

async function handler(
	input: ScoreAttentionInput,
	ctx: ToolContext,
): Promise<ToolResult<ScoreAttentionData>> {
	const { target, id, score } = input;

	const now = new Date().toISOString();

	if (target === "knowledge_item") {
		const row = ctx.db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();
		if (!row) {
			return err("NOT_FOUND", `Knowledge item not found: ${id}`);
		}
		// @lore: status/score updates do NOT bump `version` — matches
		// knowledge-repository convention (version reflects content edits).
		ctx.db
			.update(knowledgeItems)
			.set({ attentionScore: score, updatedAt: now })
			.where(eq(knowledgeItems.id, id))
			.run();
		return ok<ScoreAttentionData>({ target, id, score });
	}

	// target === "item"
	const row = ctx.db.select().from(items).where(eq(items.id, id)).get();
	if (!row) {
		return err("NOT_FOUND", `Item not found: ${id}`);
	}
	// items.attentionScore is integer — scale [0,1] to [0,100].
	ctx.db
		.update(items)
		.set({ attentionScore: Math.round(score * 100) })
		.where(eq(items.id, id))
		.run();

	return ok<ScoreAttentionData>({ target, id, score });
}

export const scoreAttentionTool: ToolDefinition<ScoreAttentionInput> = {
	name: "score_attention",
	description:
		"Set an attention score in [0,1] on an item or knowledge_item. G1 stub: callers supply the score; G2 will replace this with a computed score from the attention engine.",
	inputSchema: scoreAttentionInputSchema,
	handler,
	roles: ["chief_of_staff", "practice_facilitator", "product_manager"],
};
