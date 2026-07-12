import { knowledgeAppProjection, knowledgeItems } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import z from "zod";
import { buildAttentionService } from "../knowledge/attention-service.js";
import * as work from "../work-service.js";
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
		const [existing] = await ctx.db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, id))
			.limit(1);
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
		const [row] = await ctx.db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, id))
			.limit(1);
		if (!row) {
			return err("NOT_FOUND", `Knowledge item not found: ${id}`);
		}
		// @lore O2: attentionScore moved from knowledgeItems to knowledgeAppProjection.
		// Upsert: create projection row if none exists (kernel items created before fabric).
		const [existingFabric] = await ctx.db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, id))
			.limit(1);
		if (existingFabric) {
			await ctx.db
				.update(knowledgeAppProjection)
				.set({ attentionScore: String(score) })
				.where(eq(knowledgeAppProjection.knowledgeItemId, id));
		} else {
			await ctx.db.insert(knowledgeAppProjection).values({
				id: `ksf-${id}`,
				knowledgeItemId: id,
				attentionScore: String(score),
			});
		}
		// Also update kernel updatedAt for recency tracking (no version bump)
		await ctx.db.update(knowledgeItems).set({ updatedAt: now }).where(eq(knowledgeItems.id, id));
		return ok<ScoreAttentionData>({ target, id, score, mode });
	}

	// target === "item"
	// @lore O2: items.attentionScore stripped from the kernel items table.
	// The items table no longer tracks attention scores. Score writes are now
	// best-effort: return ok but skip the DB write.
	const row = await work.getItemById(ctx.db, id);
	if (!row) {
		return err("NOT_FOUND", `Item not found: ${id}`);
	}
	// @lore O2: items.attentionScore removed — no-op on items score writes.

	return ok<ScoreAttentionData>({ target, id, score, mode });
}

export const scoreAttentionTool: ToolDefinition<ScoreAttentionInput> = {
	name: "score_attention",
	description:
		"Set an attention score on an item or knowledge_item. Two modes: 'override' (default; uses the provided score directly — G1 behavior) and 'recompute' (runs the G2 attention engine; ignores the provided score; knowledge_item only).",
	inputSchema: scoreAttentionInputSchema,
	handler,
	// @lore AD8b: role string "chief_of_staff" renamed to "assistant".
	// @lore AD8c: role string "practice_facilitator" renamed to "facilitator".
	roles: ["assistant", "facilitator", "product_manager"],
};
