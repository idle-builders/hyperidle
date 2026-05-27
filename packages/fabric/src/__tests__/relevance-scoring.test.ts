import { createTestDb, factorySettings, type HyperIdleDb, type KnowledgeItem } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rankAndBudget, scoreItem } from "../relevance-scoring.js";
import {
	CONTEXT_WINDOW_TOKENS,
	DEFAULT_KNOWLEDGE_BUDGET,
	getDefaultWeights,
	KNOWLEDGE_ALLOCATION_RATIO,
	loadScoringWeights,
	type ScoringContext,
	type ScoringWeights,
} from "../scoring-config.js";
import { countItemTokens, countTokens, enforceBudget, type ScoredItem } from "../token-budget.js";

function makeItem(overrides: Partial<KnowledgeItem> = {}): KnowledgeItem {
	return {
		id: overrides.id ?? crypto.randomUUID(),
		layer: overrides.layer ?? "L2",
		scopeId: overrides.scopeId ?? null,
		kind: overrides.kind ?? "pattern",
		topic: overrides.topic ?? null,
		title: overrides.title ?? "Test Item",
		body: overrides.body ?? "This is a test knowledge item body.",
		format: overrides.format ?? "markdown",
		status: overrides.status ?? "active",
		attentionScore: overrides.attentionScore ?? null,
		confidence: overrides.confidence ?? null,
		version: overrides.version ?? 1,
		updatedBy: overrides.updatedBy ?? "agent-1",
		createdAt: overrides.createdAt ?? new Date().toISOString(),
		updatedAt: overrides.updatedAt ?? new Date().toISOString(),
		meta: overrides.meta ?? null,
	};
}

const defaultContext: ScoringContext = {
	taskDescription: "Handle file uploads for the product",
	taskTags: ["file-handling"],
	agentRole: "builder",
	productId: "product-1",
};

describe("relevance-scoring", () => {
	const weights = getDefaultWeights();
	const now = Date.now();

	describe("AC1: tag-based relevance scoring", () => {
		it("file-handling practice scores higher than email-marketing for file-upload task", async () => {
			const fileHandlingItem = makeItem({ topic: "file-handling", updatedAt: new Date(now).toISOString() });
			const emailMarketingItem = makeItem({ topic: "email-marketing", updatedAt: new Date(now).toISOString() });

			const context: ScoringContext = {
				taskDescription: "Handle file uploads",
				taskTags: ["file-handling"],
				agentRole: "builder",
				productId: "product-1",
			};

			const fileScore = scoreItem(fileHandlingItem, context, weights, now);
			const emailScore = scoreItem(emailMarketingItem, context, weights, now);
			expect(fileScore).toBeGreaterThan(emailScore);
		});

		it("scores higher when meta.tags match task tags", async () => {
			const matchingItem = makeItem({ meta: JSON.stringify({ tags: ["file-handling", "uploads"] }), updatedAt: new Date(now).toISOString() });
			const nonMatchingItem = makeItem({ meta: JSON.stringify({ tags: ["billing", "payments"] }), updatedAt: new Date(now).toISOString() });

			const matchScore = scoreItem(matchingItem, defaultContext, weights, now);
			const noMatchScore = scoreItem(nonMatchingItem, defaultContext, weights, now);
			expect(matchScore).toBeGreaterThan(noMatchScore);
		});
	});

	describe("AC2: recency scoring", () => {
		it("recently updated item scores higher than stale one with same tags", async () => {
			const recentItem = makeItem({ topic: "file-handling", updatedAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString() });
			const staleItem = makeItem({ topic: "file-handling", updatedAt: new Date(now - 29 * 24 * 60 * 60 * 1000).toISOString() });

			const recentScore = scoreItem(recentItem, defaultContext, weights, now);
			const staleScore = scoreItem(staleItem, defaultContext, weights, now);
			expect(recentScore).toBeGreaterThan(staleScore);
		});

		it("item older than 30 days gets zero recency", async () => {
			const oldItem = makeItem({ topic: "file-handling", updatedAt: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString() });
			const freshItem = makeItem({ topic: "file-handling", updatedAt: new Date(now).toISOString() });

			const oldScore = scoreItem(oldItem, defaultContext, weights, now);
			const freshScore = scoreItem(freshItem, defaultContext, weights, now);
			expect(freshScore).toBeGreaterThan(oldScore);
		});
	});

	describe("AC3: budget enforcement with 200 items", () => {
		it("returns fewer items than input when budget is tight", async () => {
			const items: KnowledgeItem[] = [];
			for (let i = 0; i < 200; i++) {
				const words = Array.from({ length: 250 }, (_, j) => `word${j}`).join(" ");
				items.push(makeItem({ id: `item-${i}`, topic: i < 50 ? "file-handling" : "other-topic", body: words, updatedAt: new Date(now - i * 60 * 1000).toISOString() }));
			}

			const result = rankAndBudget(items, defaultContext, weights, 40_000, now);
			expect(result.length).toBeLessThan(200);
			expect(result.length).toBeGreaterThan(0);

			let totalTokens = 0;
			for (const item of result) {
				totalTokens += countItemTokens(item);
			}
			expect(totalTokens).toBeLessThanOrEqual(40_000);
		});

		it("returns all items when budget is large enough", async () => {
			const items: KnowledgeItem[] = [];
			for (let i = 0; i < 10; i++) {
				items.push(makeItem({ id: `item-${i}`, body: "short body", updatedAt: new Date(now).toISOString() }));
			}

			const result = rankAndBudget(items, defaultContext, weights, 100_000, now);
			expect(result.length).toBe(10);
		});
	});

	describe("AC4: L4 items always included", () => {
		it("L4 items are included even when budget is very tight", async () => {
			const l4Item = makeItem({ id: "l4-factory", layer: "L4", title: "Factory Principle", body: "Important factory context that must always be included.", updatedAt: new Date(now).toISOString() });

			const otherItems: KnowledgeItem[] = [];
			for (let i = 0; i < 50; i++) {
				const words = Array.from({ length: 100 }, (_, j) => `word${j}`).join(" ");
				otherItems.push(makeItem({ id: `other-${i}`, layer: "L2", body: words, updatedAt: new Date(now).toISOString() }));
			}

			const allItems = [l4Item, ...otherItems];
			const l4Tokens = countItemTokens(l4Item);
			const result = rankAndBudget(allItems, defaultContext, weights, l4Tokens + 10, now);

			const l4InResult = result.find((r) => r.id === "l4-factory");
			expect(l4InResult).toBeTruthy();
		});

		it("L4 items come first in results", async () => {
			const l4Item = makeItem({ id: "l4-1", layer: "L4", body: "Factory item", updatedAt: new Date(now).toISOString() });
			const l2Item = makeItem({ id: "l2-1", layer: "L2", topic: "file-handling", body: "High relevance product item", updatedAt: new Date(now).toISOString() });

			const result = rankAndBudget([l2Item, l4Item], defaultContext, weights, 100_000, now);
			expect(result[0]?.layer).toBe("L4");
		});
	});

	describe("AC5: context window math", () => {
		it("200K * 0.2 = 40K tokens for knowledge", async () => {
			expect(CONTEXT_WINDOW_TOKENS).toBe(200_000);
			expect(KNOWLEDGE_ALLOCATION_RATIO).toBe(0.2);
			expect(DEFAULT_KNOWLEDGE_BUDGET).toBe(40_000);
		});
	});

	describe("I3: confidence factor (no /100 division)", () => {
		const isolatedConfidenceWeights: ScoringWeights = {
			tagMatch: 0,
			roleMatch: 0,
			recency: 0,
			confidence: 1,
			layerProximity: 0,
			attentionScore: 0,
		};

		it("item with confidence 0.8 contributes a factor of 0.8 (score ≈ 80)", async () => {
			const item = makeItem({ confidence: 0.8, updatedAt: new Date(now).toISOString() });
			const score = scoreItem(item, defaultContext, isolatedConfidenceWeights, now);
			expect(score).toBeCloseTo(80, 0);
			expect(score).toBeGreaterThan(50);
		});

		it("item with confidence 0.5 contributes a factor of 0.5 (score ≈ 50)", async () => {
			const item = makeItem({ confidence: 0.5, updatedAt: new Date(now).toISOString() });
			const score = scoreItem(item, defaultContext, isolatedConfidenceWeights, now);
			expect(score).toBeCloseTo(50, 0);
		});

		it("item with confidence 1.0 contributes a factor of 1.0 (score ≈ 100)", async () => {
			const item = makeItem({ confidence: 1.0, updatedAt: new Date(now).toISOString() });
			const score = scoreItem(item, defaultContext, isolatedConfidenceWeights, now);
			expect(score).toBeCloseTo(100, 0);
		});
	});

	describe("I3: attentionScore factor (no /100 division)", () => {
		const isolatedAttentionWeights: ScoringWeights = {
			tagMatch: 0,
			roleMatch: 0,
			recency: 0,
			confidence: 0,
			layerProximity: 0,
			attentionScore: 1,
		};

		it("item with attentionScore 0.5 contributes a factor of 0.5 (score ≈ 50)", async () => {
			const item = makeItem({ attentionScore: 0.5, updatedAt: new Date(now).toISOString() });
			const score = scoreItem(item, defaultContext, isolatedAttentionWeights, now);
			expect(score).toBeCloseTo(50, 0);
		});

		it("item with attentionScore 0.8 contributes a factor of 0.8 (score ≈ 80)", async () => {
			const item = makeItem({ attentionScore: 0.8, updatedAt: new Date(now).toISOString() });
			const score = scoreItem(item, defaultContext, isolatedAttentionWeights, now);
			expect(score).toBeCloseTo(80, 0);
		});

		it("item with attentionScore null defaults to 0.5 (neutral)", async () => {
			const item = makeItem({ attentionScore: null, updatedAt: new Date(now).toISOString() });
			const score = scoreItem(item, defaultContext, isolatedAttentionWeights, now);
			expect(score).toBeCloseTo(50, 0);
		});
	});

	describe("AC6: overridable scoring weights", () => {
		let db: HyperIdleDb;
		let handle: Awaited<ReturnType<typeof createTestDb>>;

		beforeEach(async () => {
			handle = await createTestDb();
			db = handle.db;
		});

		afterEach(async () => {
			await handle.close();
		});

		it("returns default weights when no factory_settings exist", async () => {
			const loaded = await loadScoringWeights(db);
			expect(loaded.tagMatch).toBe(0.35);
			expect(loaded.roleMatch).toBe(0.15);
			expect(loaded.recency).toBe(0.15);
			expect(loaded.confidence).toBe(0.1);
			expect(loaded.layerProximity).toBe(0.15);
			expect(loaded.attentionScore).toBe(0.1);
		});

		it("overrides weights from factory_settings", async () => {
			const timestamp = new Date().toISOString();
			await db.insert(factorySettings).values({ key: "scoring.weight.tagMatch", value: "0.50", updatedAt: timestamp });
			await db.insert(factorySettings).values({ key: "scoring.weight.recency", value: "0.25", updatedAt: timestamp });

			const loaded = await loadScoringWeights(db);
			expect(loaded.tagMatch).toBe(0.5);
			expect(loaded.recency).toBe(0.25);
			expect(loaded.roleMatch).toBe(0.15);
		});

		it("ignores invalid weight values", async () => {
			const timestamp = new Date().toISOString();
			await db.insert(factorySettings).values({ key: "scoring.weight.tagMatch", value: "not-a-number", updatedAt: timestamp });
			await db.insert(factorySettings).values({ key: "scoring.weight.recency", value: "1.5", updatedAt: timestamp });

			const loaded = await loadScoringWeights(db);
			expect(loaded.tagMatch).toBe(0.35);
			expect(loaded.recency).toBe(0.15);
		});

		it("overridden weights change scoring results", async () => {
			const heavyTagWeights: ScoringWeights = {
				tagMatch: 0.9,
				roleMatch: 0.02,
				recency: 0.02,
				confidence: 0.02,
				layerProximity: 0.02,
				attentionScore: 0.02,
			};

			const matchingItem = makeItem({ topic: "file-handling", updatedAt: new Date(now).toISOString() });
			const nonMatchingItem = makeItem({ topic: "email-marketing", updatedAt: new Date(now).toISOString() });

			const matchScore = scoreItem(matchingItem, defaultContext, heavyTagWeights, now);
			const noMatchScore = scoreItem(nonMatchingItem, defaultContext, heavyTagWeights, now);
			expect(matchScore - noMatchScore).toBeGreaterThan(30);
		});
	});
});

describe("token-budget", () => {
	describe("countTokens", () => {
		it("counts whitespace-separated words", async () => {
			expect(countTokens("hello world foo bar")).toBe(4);
		});

		it("returns 0 for empty string", async () => {
			expect(countTokens("")).toBe(0);
		});

		it("returns 0 for whitespace-only string", async () => {
			expect(countTokens("   ")).toBe(0);
		});

		it("handles multiple spaces between words", async () => {
			expect(countTokens("hello   world")).toBe(2);
		});

		it("handles newlines and tabs", async () => {
			expect(countTokens("hello\nworld\tfoo")).toBe(3);
		});
	});

	describe("countItemTokens", () => {
		it("counts tokens in title + body", async () => {
			const item = makeItem({ title: "two words", body: "three more words" });
			expect(countItemTokens(item)).toBe(5);
		});
	});

	describe("enforceBudget", () => {
		it("includes all items when budget is sufficient", async () => {
			const items: ScoredItem[] = [
				{ item: makeItem({ body: "one two three" }), score: 80 },
				{ item: makeItem({ body: "four five" }), score: 60 },
			];

			const result = enforceBudget(items, 1000);
			expect(result.length).toBe(2);
		});

		it("excludes items that exceed budget", async () => {
			const bigBody = Array.from({ length: 500 }, (_, i) => `word${i}`).join(" ");
			const items: ScoredItem[] = [
				{ item: makeItem({ body: bigBody }), score: 80 },
				{ item: makeItem({ body: bigBody }), score: 60 },
			];

			const result = enforceBudget(items, 510);
			expect(result.length).toBe(1);
		});

		it("L4 items always included even beyond budget", async () => {
			const l4Item = makeItem({ layer: "L4", body: "factory context words" });
			const l2Item = makeItem({ layer: "L2", body: "product context words" });

			const result = enforceBudget(
				[
					{ item: l2Item, score: 90 },
					{ item: l4Item, score: 10 },
				],
				0,
			);

			expect(result.length).toBe(1);
			expect(result[0]?.layer).toBe("L4");
		});

		it("takes highest-scored items first", async () => {
			const items: ScoredItem[] = [
				{ item: makeItem({ id: "low", body: "one two three" }), score: 20 },
				{ item: makeItem({ id: "high", body: "one two three" }), score: 90 },
				{ item: makeItem({ id: "mid", body: "one two three" }), score: 50 },
			];

			const result = enforceBudget(items, 10);
			expect(result.length).toBe(2);
			expect(result[0]?.id).toBe("high");
			expect(result[1]?.id).toBe("mid");
		});
	});
});
