/**
 * X7: Scoring engine — runs a rubric against post-session DB state.
 *
 * Two judge patterns are supported:
 * 1. Rule-based DB check (deterministic) — most dimensions
 * 2. LLM-as-judge (quality evaluation) — used sparingly
 *
 * Both are expressed as (ctx: JudgeContext) => Promise<DimensionScore>.
 * The scoring engine does not distinguish them.
 */

import type { DimensionReport, JudgeContext, ScoringRubric } from "./types.js";

/**
 * Run all dimensions of a rubric against the post-session DB state.
 * Returns per-dimension scores and an arithmetic mean aggregate.
 *
 * Dimensions are evaluated serially to avoid concurrent DB read conflicts
 * on the ephemeral PGlite instance.
 *
 * If a dimension judge throws, the dimension scores 0.0 with the error
 * message as the note. This prevents a single bad judge from aborting
 * scoring of remaining dimensions.
 */
export async function scoreScenario(
	rubric: ScoringRubric,
	judgeCtx: JudgeContext,
): Promise<{
	dimensions: DimensionReport[];
	aggregateScore: number;
}> {
	const dimensions: DimensionReport[] = [];

	for (const dim of rubric.dimensions) {
		let score = 0;
		let note: string | undefined;

		try {
			const result = await dim.judge(judgeCtx);
			score = Math.max(0, Math.min(1, result.score));
			note = result.note;
		} catch (err) {
			score = 0;
			note = `Judge threw: ${err instanceof Error ? err.message : String(err)}`;
		}

		dimensions.push({
			dimensionId: dim.id,
			label: dim.label,
			score,
			note,
		});
	}

	const aggregateScore =
		dimensions.length > 0 ? dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length : 0;

	return { dimensions, aggregateScore };
}
