import { type HyperIdleDb, createTestDb, items, knowledgeItems } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { scoreAttentionTool } from "../score-attention.js";
import { buildToolRegistry } from "../tool-registry.js";
import { NOW, makeContext, seedBase } from "./_helpers.js";

function seedKnowledgeItemWithScore(db: HyperIdleDb, id: string, score: number | null): void {
	db.insert(knowledgeItems)
		.values({
			id,
			layer: "L3",
			kind: "brief",
			topic: "brand",
			title: "Crossable KI",
			body: "Body",
			format: "markdown",
			status: "active",
			attentionScore: score,
			confidence: 0.1,
			version: 1,
			updatedBy: "agent:seed",
			createdAt: NOW,
			updatedAt: NOW,
		})
		.run();
}

function seedKnowledgeItem(db: HyperIdleDb, id: string): void {
	db.insert(knowledgeItems)
		.values({
			id,
			layer: "L3",
			kind: "pattern",
			title: "Test KI",
			body: "Body",
			format: "markdown",
			status: "captured",
			attentionScore: null,
			version: 1,
			updatedBy: "agent:seed",
			createdAt: NOW,
			updatedAt: NOW,
		})
		.run();
}

function seedItem(db: HyperIdleDb, id: string): void {
	db.insert(items)
		.values({
			id,
			sourceAgentId: "agent-fac",
			title: "Some item",
			threadId: "th1",
			createdAt: NOW,
		})
		.run();
}

describe("score_attention tool", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
		seedBase(db);
	});

	it("sets attention_score on a knowledge_item (target=knowledge_item)", async () => {
		seedKnowledgeItem(db, "ki-1");
		const result = await scoreAttentionTool.handler(
			{ target: "knowledge_item", id: "ki-1", score: 0.42 },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		const row = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-1")).get();
		// `knowledge_items.attentionScore` is REAL (0-1). Compare with fuzz for float
		// stability though SQLite round-trips the double verbatim.
		expect(row?.attentionScore).toBeCloseTo(0.42, 5);
	});

	it("sets scaled attention_score on an items row (target=item)", async () => {
		// `items.attentionScore` is an INTEGER 0-100; the tool encodes via
		// `Math.round(score * 100)`. 0.5 -> 50.
		seedItem(db, "it-1");
		const result = await scoreAttentionTool.handler(
			{ target: "item", id: "it-1", score: 0.5 },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		const row = db.select().from(items).where(eq(items.id, "it-1")).get();
		expect(row?.attentionScore).toBe(50);
	});

	it("does NOT bump knowledge_items.version", async () => {
		seedKnowledgeItem(db, "ki-2");
		const before = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-2")).get();
		const versionBefore = before?.version;
		await scoreAttentionTool.handler(
			{ target: "knowledge_item", id: "ki-2", score: 0.7 },
			makeContext(db),
		);
		const after = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-2")).get();
		expect(after?.version).toBe(versionBefore);
	});

	it("returns NOT_FOUND for unknown id (both targets)", async () => {
		const kiResult = await scoreAttentionTool.handler(
			{ target: "knowledge_item", id: "nope", score: 0.1 },
			makeContext(db),
		);
		expect(kiResult.success).toBe(false);
		if (kiResult.success) return;
		expect(kiResult.code).toBe("NOT_FOUND");

		const itResult = await scoreAttentionTool.handler(
			{ target: "item", id: "nope", score: 0.1 },
			makeContext(db),
		);
		expect(itResult.success).toBe(false);
		if (itResult.success) return;
		expect(itResult.code).toBe("NOT_FOUND");
	});

	it("returns INVALID_INPUT for score < 0 or > 1 via registry dispatch", async () => {
		seedKnowledgeItem(db, "ki-3");
		const registry = buildToolRegistry(makeContext(db));

		const neg = await registry.invoke("score_attention", {
			target: "knowledge_item",
			id: "ki-3",
			score: -0.1,
		});
		expect(neg.success).toBe(false);
		if (neg.success) return;
		expect(neg.code).toBe("INVALID_INPUT");

		const over = await registry.invoke("score_attention", {
			target: "knowledge_item",
			id: "ki-3",
			score: 1.1,
		});
		expect(over.success).toBe(false);
		if (over.success) return;
		expect(over.code).toBe("INVALID_INPUT");
	});

	it("mode: 'override' (default) keeps G1 behavior (uses provided score verbatim)", async () => {
		seedKnowledgeItem(db, "ki-override");
		const result = await scoreAttentionTool.handler(
			{ target: "knowledge_item", id: "ki-override", score: 0.42, mode: "override" },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		const row = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-override")).get();
		expect(row?.attentionScore).toBeCloseTo(0.42, 5);
	});

	it("mode: 'recompute' with target=knowledge_item invokes the engine (score arg omitted)", async () => {
		seedKnowledgeItemWithScore(db, "ki-recompute", 0.05);
		const registry = buildToolRegistry(makeContext(db));
		const result = await registry.invoke("score_attention", {
			target: "knowledge_item",
			id: "ki-recompute",
			mode: "recompute",
		});
		expect(result.success).toBe(true);
		const row = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-recompute")).get();
		// The engine should have written SOMETHING other than the caller's 0.01;
		// taste-sensitive brief with low confidence should produce a markedly higher score.
		expect(row?.attentionScore).not.toBeNull();
		expect(row?.attentionScore ?? 0).toBeGreaterThan(0.1);
	});

	it("mode: 'recompute' rejects a provided `score` via registry-level validation", async () => {
		seedKnowledgeItemWithScore(db, "ki-reject", 0.05);
		const registry = buildToolRegistry(makeContext(db));
		const result = await registry.invoke("score_attention", {
			target: "knowledge_item",
			id: "ki-reject",
			score: 0.42,
			mode: "recompute",
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});

	it("mode: 'override' requires `score` — rejects missing score via registry validation", async () => {
		seedKnowledgeItem(db, "ki-need-score");
		const registry = buildToolRegistry(makeContext(db));
		const result = await registry.invoke("score_attention", {
			target: "knowledge_item",
			id: "ki-need-score",
			mode: "override",
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});

	it("mode: 'recompute' with target=item returns INVALID_INPUT", async () => {
		seedItem(db, "it-recompute");
		const result = await scoreAttentionTool.handler(
			{ target: "item", id: "it-recompute", mode: "recompute" },
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});
});
