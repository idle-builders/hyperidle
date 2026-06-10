import {
	type HyperIdleDb,
	knowledgeConflicts,
	knowledgeEditLog,
	knowledgeItems,
	knowledgeStrategyFabric,
} from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { buildAttentionContext, cohortKey, crossScopeKey } from "../attention-scoring.js";
import type { KnowledgeItemWithFabric } from "../knowledge-repository.js";

const NOW = new Date("2026-04-18T00:00:00.000Z").getTime();

/**
 * Seed a knowledge item + its strategy fabric row.
 * @lore O2: kernel/strategy separation. Inserts into both tables.
 */
async function seedItem(
	db: HyperIdleDb,
	overrides: Partial<KnowledgeItemWithFabric> & { id: string },
): Promise<KnowledgeItemWithFabric> {
	const kernelRow = {
		id: overrides.id,
		scopeKind: overrides.scopeKind ?? "factory",
		topic: overrides.topic ?? null,
		title: overrides.title ?? "Seed",
		body: overrides.body ?? "Body",
		format: overrides.format ?? "markdown",
		status: overrides.status ?? "active",
		version: overrides.version ?? 1,
		updatedBy: overrides.updatedBy ?? "agent-seed",
		createdAt: overrides.createdAt ?? "2026-04-18T00:00:00.000Z",
		updatedAt: overrides.updatedAt ?? "2026-04-18T00:00:00.000Z",
	};
	await db.insert(knowledgeItems).values(kernelRow);

	await db.insert(knowledgeStrategyFabric).values({
		id: `ksf-${overrides.id}`,
		knowledgeItemId: overrides.id,
		layer: overrides.layer ?? "L3",
		scopeId: overrides.scopeId ?? null,
		kind: overrides.kind ?? "pattern",
		attentionScore: overrides.attentionScore != null ? String(overrides.attentionScore) : null,
		confidence: overrides.confidence != null ? String(overrides.confidence) : null,
		meta: overrides.meta ?? null,
	});

	return {
		...kernelRow,
		layer: overrides.layer ?? "L3",
		scopeId: overrides.scopeId ?? null,
		kind: overrides.kind ?? "pattern",
		attentionScore: overrides.attentionScore != null ? String(overrides.attentionScore) : null,
		confidence: overrides.confidence != null ? String(overrides.confidence) : null,
		meta: overrides.meta ?? null,
	} satisfies KnowledgeItemWithFabric;
}

describe("buildAttentionContext", () => {
	test("returns conflictedIds matching open knowledge_conflicts", async ({ db }) => {
		const a = await seedItem(db, { id: "a" });
		const b = await seedItem(db, { id: "b" });
		await db.insert(knowledgeConflicts).values({
			id: "c1",
			itemId: "a",
			versionBase: 1,
			versionCurrent: 2,
			proposedBody: "body",
			proposedBy: "agent-x",
			status: "open",
			createdAt: "2026-04-18T00:00:00.000Z",
		});
		await db.insert(knowledgeConflicts).values({
			id: "c2",
			itemId: "b",
			versionBase: 1,
			versionCurrent: 2,
			proposedBody: "body",
			proposedBy: "agent-x",
			status: "resolved",
			createdAt: "2026-04-18T00:00:00.000Z",
		});

		const ctx = await buildAttentionContext(db, [a, b], NOW);
		expect(ctx.conflictedIds.has("a")).toBe(true);
		expect(ctx.conflictedIds.has("b")).toBe(false);
	});

	test("returns cohort sizes matching group-by on (layer, scope_id, topic, kind)", async ({
		db,
	}) => {
		const one = await seedItem(db, {
			id: "one",
			layer: "L3",
			scopeId: "prod",
			topic: "auth",
			kind: "pattern",
		});
		await seedItem(db, { id: "two", layer: "L3", scopeId: "prod", topic: "auth", kind: "pattern" });
		await seedItem(db, {
			id: "three",
			layer: "L3",
			scopeId: "prod",
			topic: "auth",
			kind: "pattern",
		});
		await seedItem(db, {
			id: "other",
			layer: "L3",
			scopeId: "prod",
			topic: "brand",
			kind: "pattern",
		});

		const ctx = await buildAttentionContext(db, [one], NOW);
		const key = cohortKey("L3", "prod", "auth", "pattern");
		expect(ctx.cohortSizeByKey.get(key)).toBe(3);
	});

	test("returns crossScopeCount of distinct scopes per (layer, topic, kind), excluding null scope_id", async ({
		db,
	}) => {
		const a = await seedItem(db, {
			id: "a",
			layer: "L3",
			scopeId: "prod-a",
			topic: "auth",
			kind: "pattern",
		});
		await seedItem(db, { id: "b", layer: "L3", scopeId: "prod-b", topic: "auth", kind: "pattern" });
		await seedItem(db, { id: "c", layer: "L3", scopeId: "prod-c", topic: "auth", kind: "pattern" });
		// Null scope — should NOT count
		await seedItem(db, { id: "d", layer: "L3", scopeId: null, topic: "auth", kind: "pattern" });

		const ctx = await buildAttentionContext(db, [a], NOW);
		const key = crossScopeKey("L3", "auth", "pattern");
		expect(ctx.crossScopeCountByKey.get(key)).toBe(3);
	});

	test("filters status=archived out of both cohort and cross-scope counts", async ({ db }) => {
		const a = await seedItem(db, {
			id: "a",
			layer: "L3",
			scopeId: "s1",
			topic: "auth",
			kind: "pattern",
			status: "active",
		});
		await seedItem(db, {
			id: "b",
			layer: "L3",
			scopeId: "s1",
			topic: "auth",
			kind: "pattern",
			status: "archived",
		});
		await seedItem(db, {
			id: "c",
			layer: "L3",
			scopeId: "s2",
			topic: "auth",
			kind: "pattern",
			status: "archived",
		});

		const ctx = await buildAttentionContext(db, [a], NOW);
		expect(ctx.cohortSizeByKey.get(cohortKey("L3", "s1", "auth", "pattern"))).toBe(1);
		expect(ctx.crossScopeCountByKey.get(crossScopeKey("L3", "auth", "pattern"))).toBe(1);
	});

	test("reads human edits from knowledge_edit_log within the recency window", async ({ db }) => {
		const a = await seedItem(db, { id: "a" });
		const b = await seedItem(db, { id: "b" });
		// Human edit within window
		await db.insert(knowledgeEditLog).values({
			id: "e1",
			itemId: "a",
			editor: "human",
			field: "body",
			oldValue: null,
			newValue: null,
			editType: "update",
			createdAt: new Date(NOW - 24 * 60 * 60 * 1000).toISOString(),
		});
		// Human edit outside window (8 days old — default window is 7 days)
		await db.insert(knowledgeEditLog).values({
			id: "e2",
			itemId: "b",
			editor: "human",
			field: "body",
			oldValue: null,
			newValue: null,
			editType: "update",
			createdAt: new Date(NOW - 8 * 24 * 60 * 60 * 1000).toISOString(),
		});

		const ctx = await buildAttentionContext(db, [a, b], NOW);
		expect(ctx.recentlyHumanEditedIds.has("a")).toBe(true);
		expect(ctx.recentlyHumanEditedIds.has("b")).toBe(false);
		// lastHumanEditAt still recorded even when outside window
		expect(ctx.lastHumanEditAt.get("b")).toBeDefined();
	});
});
