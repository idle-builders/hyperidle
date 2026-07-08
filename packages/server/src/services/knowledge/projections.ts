import { type HyperIdleDb, knowledgeAppProjection, taskPlanningSignals } from "@hyperidle/db";
import { eq } from "drizzle-orm";

type KnowledgeProjectionPatch = Partial<{
	layer: string | null;
	scopeId: string | null;
	kind: string | null;
	attentionScore: string | null;
	relevanceScore: string | null;
	confidence: string | null;
	citationCount: number | null;
	lastCitedAt: string | null;
	meta: string | null;
}>;

type TaskPlanningSignalPatch = Partial<{
	riskTier: string | null;
}>;

export async function getKnowledgeProjection(
	db: HyperIdleDb,
	knowledgeItemId: string,
): Promise<typeof knowledgeAppProjection.$inferSelect | null> {
	const [row] = await db
		.select()
		.from(knowledgeAppProjection)
		.where(eq(knowledgeAppProjection.knowledgeItemId, knowledgeItemId))
		.limit(1);
	return row ?? null;
}

export async function upsertKnowledgeProjection(
	db: HyperIdleDb,
	knowledgeItemId: string,
	patch: KnowledgeProjectionPatch,
): Promise<typeof knowledgeAppProjection.$inferSelect> {
	const existing = await getKnowledgeProjection(db, knowledgeItemId);
	if (existing) {
		const [updated] = await db
			.update(knowledgeAppProjection)
			.set(patch)
			.where(eq(knowledgeAppProjection.knowledgeItemId, knowledgeItemId))
			.returning();
		if (!updated) throw new Error(`Failed to update knowledge projection ${knowledgeItemId}`);
		return updated;
	}
	const [created] = await db
		.insert(knowledgeAppProjection)
		.values({
			id: crypto.randomUUID(),
			knowledgeItemId,
			...patch,
		})
		.returning();
	if (!created) throw new Error(`Failed to create knowledge projection ${knowledgeItemId}`);
	return created;
}

export async function getTaskPlanningSignal(
	db: HyperIdleDb,
	taskId: string,
): Promise<typeof taskPlanningSignals.$inferSelect | null> {
	const [row] = await db
		.select()
		.from(taskPlanningSignals)
		.where(eq(taskPlanningSignals.taskId, taskId))
		.limit(1);
	return row ?? null;
}

export async function upsertTaskPlanningSignal(
	db: HyperIdleDb,
	taskId: string,
	patch: TaskPlanningSignalPatch,
): Promise<typeof taskPlanningSignals.$inferSelect> {
	const existing = await getTaskPlanningSignal(db, taskId);
	if (existing) {
		const [updated] = await db
			.update(taskPlanningSignals)
			.set(patch)
			.where(eq(taskPlanningSignals.taskId, taskId))
			.returning();
		if (!updated) throw new Error(`Failed to update task planning signal ${taskId}`);
		return updated;
	}
	const [created] = await db
		.insert(taskPlanningSignals)
		.values({
			id: crypto.randomUUID(),
			taskId,
			...patch,
		})
		.returning();
	if (!created) throw new Error(`Failed to create task planning signal ${taskId}`);
	return created;
}
