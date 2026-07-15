import type { ToolContext, ToolDefinition, ToolResult } from "@hyperidle/shared";
import { err, ok } from "@hyperidle/shared";
import z from "zod";
import type { ToolHandlersPorts } from "./ports.js";

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

async function handler<TDb>(
	input: ScoreAttentionInput,
	ctx: ToolContext<TDb>,
	ports: ToolHandlersPorts<TDb>,
): Promise<ToolResult<ScoreAttentionData>> {
	const { target, id } = input;
	const mode = input.mode ?? "override";

	if (mode === "recompute") {
		if (target !== "knowledge_item") {
			return err("INVALID_INPUT", "recompute mode is only supported for target='knowledge_item'");
		}
		const existing = await ports.knowledge.findKnowledgeItemVersionById(ctx.db, id);
		if (!existing) {
			return err("NOT_FOUND", `Knowledge item not found: ${id}`);
		}
		const result = await ports.knowledge.recomputeAttentionScoreForItem(ctx.db, ctx.eventBus, id);
		return ok<ScoreAttentionData>({
			target,
			id,
			score: result.current,
			mode,
		});
	}

	if (input.score === undefined) {
		return err("INVALID_INPUT", "'score' is required when mode='override'");
	}
	const score = input.score;

	if (target === "knowledge_item") {
		const row = await ports.knowledge.findKnowledgeItemVersionById(ctx.db, id);
		if (!row) {
			return err("NOT_FOUND", `Knowledge item not found: ${id}`);
		}
		await ports.knowledge.upsertKnowledgeAppProjectionAttentionScore(ctx.db, id, String(score));
		return ok<ScoreAttentionData>({ target, id, score, mode });
	}

	const row = await ports.work.getItemById(ctx.db, id);
	if (!row) {
		return err("NOT_FOUND", `Item not found: ${id}`);
	}
	// @lore O2: items.attentionScore removed — no-op on items score writes.

	return ok<ScoreAttentionData>({ target, id, score, mode });
}

export function createScoreAttentionTool<TDb>(
	ports: ToolHandlersPorts<TDb>,
): ToolDefinition<ScoreAttentionInput, TDb> {
	return {
		name: "score_attention",
		description:
			"Set an attention score on an item or knowledge_item. Two modes: 'override' (default; uses the provided score directly — G1 behavior) and 'recompute' (runs the G2 attention engine; ignores the provided score; knowledge_item only).",
		inputSchema: scoreAttentionInputSchema,
		handler: (args, ctx) => handler(args, ctx, ports),
		roles: ["assistant", "facilitator", "product_manager"],
	};
}
