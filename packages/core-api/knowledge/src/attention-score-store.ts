/**
 * `score_attention` tool's `knowledgeAppProjection.attentionScore` accessors
 * (AU19 Increment 4 — `tools/score-attention.ts` moves into the guarded
 * `tool-handlers` package, surfacing its direct `knowledgeItems`/
 * `knowledgeAppProjection` table access as a Table ACL violation for real).
 */
import { type HyperIdleDb, knowledgeAppProjection, knowledgeItems } from "@hyperidle/db";
import { eq } from "drizzle-orm";

/** Upsert `attentionScore` on the `knowledgeAppProjection` row for `knowledgeItemId`. */
export async function upsertKnowledgeAppProjectionAttentionScore(
	db: HyperIdleDb,
	knowledgeItemId: string,
	attentionScore: string,
): Promise<void> {
	const [existing] = await db
		.select({ id: knowledgeAppProjection.id })
		.from(knowledgeAppProjection)
		.where(eq(knowledgeAppProjection.knowledgeItemId, knowledgeItemId))
		.limit(1);
	if (existing) {
		await db
			.update(knowledgeAppProjection)
			.set({ attentionScore })
			.where(eq(knowledgeAppProjection.knowledgeItemId, knowledgeItemId));
	} else {
		await db.insert(knowledgeAppProjection).values({
			id: `ksf-${knowledgeItemId}`,
			knowledgeItemId,
			attentionScore,
		});
	}
	await db
		.update(knowledgeItems)
		.set({ updatedAt: new Date().toISOString() })
		.where(eq(knowledgeItems.id, knowledgeItemId));
}
