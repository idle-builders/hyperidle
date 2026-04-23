import { items, knowledgeItems } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { buildAttentionService } from "../services/attention-service.js";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

/**
 * `score_attention` — two modes:
 *  - `override` (default, G1 behavior): persist the caller-supplied score
 *    verbatim. Used for manual pinning. Requires `score`.
 *  - `recompute` (G2): run the attention engine against the knowledge item
 *    and persist the computed score. Forbids `score`. Only supported for
 *    `target: "knowledge_item"`.
 *
 * @lore Encoding asymmetry: `items.attentionScore` is stored as integer 0-100
 * (the human UI buckets attention into coarse percentages and the column
 * is an INTEGER), while `knowledge_items.attentionScore` is REAL 0-1 (used
 * by the relevance-scoring engine which multiplies it with other 0-1
 * weights). Both schemas pre-date G1; the tool translates here rather than
 * migrate two live stores for a single unit-of-measure difference.
 *
 * @lore G2 mode flag: kept as an optional flag rather than a separate tool so
 * facilitators can reason about a single entry point. `recompute` is for
 * facilitator routines to refresh scores; `override` is for human pinning.
 * The `score` argument is now explicitly required for override mode and
 * forbidden for recompute (prior behavior silently ignored the arg in
 * recompute, which was a footgun).
 */
const scoreAttentionInputSchema = z
	.object({
		target: z.enum(["item", "knowledge_item"]),
		id: z.string().min(1),
		score: z.number().min(0).max(1).optional(),
		mode: z.enum(["override", "recompute"]).optional(),
	})
	.superRefine((val, ctx) => {
		const mode = val.mode ?? "override";
		if (mode === "recompute" && val.score !== undefined) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["score"],
				message: "'score' must be omitted when mode='recompute' (engine computes the score)",
			});
		}
		if (mode !== "recompute" && val.score === undefined) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["score"],
				message: "'score' is required when mode='override' (the default)",
			});
		}
	});

type ScoreAttentionInput = z.infer<typeof scoreAttentionInputSchema>;

interface ScoreAttentionData {
	readonly target: "item" | "knowledge_item";
	readonly id: string;
	readonly score: number;
	readonly mode: "override" | "recompute";
}

async function handler(
	input: ScoreAttentionInput,
	ctx: ToolContext,
): Promise<ToolResult<ScoreAttentionData>> {
	const { target, id } = input;
	const mode = input.mode ?? "override";

	if (mode === "recompute") {
		if (target !== "knowledge_item") {
			return err("INVALID_INPUT", "recompute mode is only supported for target='knowledge_item'");
		}
		const existing = ctx.db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();
		if (!existing) {
			return err("NOT_FOUND", `Knowledge item not found: ${id}`);
		}
		const service = buildAttentionService({ db: ctx.db, eventBus: ctx.eventBus });
		const result = await service.recomputeOne(id);
		return ok<ScoreAttentionData>({
			target,
			id,
			score: result.current,
			mode,
		});
	}

	// override mode — the schema's superRefine guarantees `score` is present.
	if (input.score === undefined) {
		return err("INVALID_INPUT", "'score' is required when mode='override'");
	}
	const score = input.score;
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
		return ok<ScoreAttentionData>({ target, id, score, mode });
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

	return ok<ScoreAttentionData>({ target, id, score, mode });
}

export const scoreAttentionTool: ToolDefinition<ScoreAttentionInput> = {
	name: "score_attention",
	description:
		"Set an attention score on an item or knowledge_item. Two modes: 'override' (default; uses the provided score directly — G1 behavior) and 'recompute' (runs the G2 attention engine; ignores the provided score; knowledge_item only).",
	inputSchema: scoreAttentionInputSchema,
	handler,
	roles: ["chief_of_staff", "practice_facilitator", "product_manager"],
};
