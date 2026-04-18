import type { KnowledgeItem } from "@hyperidle/db";
import { describe, expect, it } from "vitest";
import {
	type AttentionScoringContext,
	scoreAttention,
	scoreAttentionBatch,
} from "../attention-scoring.js";
import { type AttentionWeights, getDefaultAttentionWeights } from "../scoring-config.js";

function makeItem(overrides: Partial<KnowledgeItem> = {}): KnowledgeItem {
	return {
		id: overrides.id ?? "ki-test",
		layer: overrides.layer ?? "L3",
		scopeId: overrides.scopeId ?? null,
		kind: overrides.kind ?? "pattern",
		topic: overrides.topic ?? null,
		title: overrides.title ?? "Test",
		body: overrides.body ?? "Body",
		format: overrides.format ?? "markdown",
		status: overrides.status ?? "active",
		attentionScore: overrides.attentionScore ?? null,
		confidence: overrides.confidence ?? null,
		version: overrides.version ?? 1,
		updatedBy: overrides.updatedBy ?? "agent-1",
		createdAt: overrides.createdAt ?? "2026-04-18T00:00:00.000Z",
		updatedAt: overrides.updatedAt ?? "2026-04-18T00:00:00.000Z",
		meta: overrides.meta ?? null,
	};
}

const NOW = new Date("2026-04-18T00:00:00.000Z").getTime();

function makeContext(overrides: Partial<AttentionScoringContext> = {}): AttentionScoringContext {
	return {
		now: overrides.now ?? NOW,
		cohortSizeByKey: overrides.cohortSizeByKey ?? new Map<string, number>(),
		crossScopeCountByKey: overrides.crossScopeCountByKey ?? new Map<string, number>(),
		conflictedIds: overrides.conflictedIds ?? new Set<string>(),
		recentlyHumanEditedIds: overrides.recentlyHumanEditedIds ?? new Set<string>(),
		lastHumanEditAt: overrides.lastHumanEditAt ?? new Map<string, number>(),
	};
}

describe("scoreAttention (pure)", () => {
	const weights: AttentionWeights = getDefaultAttentionWeights();

	it("AC5: deterministic — same inputs → identical output across 100 invocations", () => {
		const item = makeItem({
			id: "ki-1",
			kind: "brief",
			confidence: 0.5,
			topic: "brand",
		});
		const ctx = makeContext();
		const baseline = scoreAttention(item, ctx, weights);
		for (let i = 0; i < 100; i++) {
			const result = scoreAttention(item, ctx, weights);
			expect(result).toBe(baseline);
		}
	});

	it("score is always in [0, 1]", () => {
		for (let i = 0; i < 20; i++) {
			const item = makeItem({
				id: `ki-${i}`,
				kind: i % 2 === 0 ? "brief" : "pattern",
				confidence: i / 20,
				topic: i % 3 === 0 ? "brand" : "auth",
			});
			const ctx = makeContext({
				conflictedIds: i % 2 === 0 ? new Set([`ki-${i}`]) : new Set(),
				cohortSizeByKey: new Map([["K", i]]),
			});
			const s = scoreAttention(item, ctx, weights);
			expect(s).toBeGreaterThanOrEqual(0);
			expect(s).toBeLessThanOrEqual(1);
		}
	});

	it("AC1: an item with a conflict scores STRICTLY higher than one without, all else equal", () => {
		const baseItem = makeItem({
			id: "ki-nc",
			kind: "pattern",
			topic: "auth",
			confidence: 0.5,
		});
		const conflictItem = makeItem({
			id: "ki-c",
			kind: "pattern",
			topic: "auth",
			confidence: 0.5,
		});
		const ctx = makeContext({ conflictedIds: new Set(["ki-c"]) });
		const nonConflict = scoreAttention(baseItem, ctx, weights);
		const conflict = scoreAttention(conflictItem, ctx, weights);
		expect(conflict).toBeGreaterThan(nonConflict);
	});

	it("AC2: taste-sensitive (brand-voice) item scores STRICTLY higher than technical detail, all else equal", () => {
		const brandItem = makeItem({
			id: "ki-brand",
			kind: "pattern",
			topic: "brand",
			confidence: 0.5,
		});
		const techItem = makeItem({
			id: "ki-auth",
			kind: "pattern",
			topic: "auth",
			confidence: 0.5,
		});
		const ctx = makeContext();
		const brand = scoreAttention(brandItem, ctx, weights);
		const tech = scoreAttention(techItem, ctx, weights);
		expect(brand).toBeGreaterThan(tech);
	});

	it("AC3: recently human-reviewed item scores STRICTLY lower than never-reviewed, all else equal", () => {
		const reviewed = makeItem({ id: "ki-r", kind: "pattern", topic: "auth", confidence: 0.5 });
		const neverReviewed = makeItem({
			id: "ki-nr",
			kind: "pattern",
			topic: "auth",
			confidence: 0.5,
		});
		const ctx = makeContext({
			recentlyHumanEditedIds: new Set(["ki-r"]),
			lastHumanEditAt: new Map([["ki-r", NOW - 24 * 60 * 60 * 1000]]),
		});
		const r = scoreAttention(reviewed, ctx, weights);
		const nr = scoreAttention(neverReviewed, ctx, weights);
		expect(r).toBeLessThan(nr);
	});

	it("cross-scope repetition reduces score", () => {
		const item = makeItem({
			id: "ki-a",
			kind: "pattern",
			topic: "auth",
			confidence: 0.5,
			layer: "L2",
		});
		const lowRep = makeContext({
			crossScopeCountByKey: new Map([["L2|auth|pattern", 1]]),
		});
		const highRep = makeContext({
			crossScopeCountByKey: new Map([["L2|auth|pattern", 10]]),
		});
		const low = scoreAttention(item, lowRep, weights);
		const high = scoreAttention(item, highRep, weights);
		expect(low).toBeGreaterThan(high);
	});

	it("high confidence reduces score relative to low confidence", () => {
		const highConf = makeItem({ id: "ki-hc", confidence: 0.95 });
		const lowConf = makeItem({ id: "ki-lc", confidence: 0.1 });
		const ctx = makeContext();
		const h = scoreAttention(highConf, ctx, weights);
		const l = scoreAttention(lowConf, ctx, weights);
		expect(l).toBeGreaterThan(h);
	});

	it("high novelty (small cohort) increases score relative to low novelty", () => {
		const item = makeItem({
			id: "ki-n",
			layer: "L3",
			scopeId: "prod",
			topic: "auth",
			kind: "pattern",
			confidence: 0.5,
		});
		const key = "L3|prod|auth|pattern";
		const highNovelty = makeContext({ cohortSizeByKey: new Map([[key, 1]]) });
		const lowNovelty = makeContext({ cohortSizeByKey: new Map([[key, 50]]) });
		const hn = scoreAttention(item, highNovelty, weights);
		const ln = scoreAttention(item, lowNovelty, weights);
		expect(hn).toBeGreaterThan(ln);
	});

	it("totalWeight=0 returns 0 without crashing", () => {
		const zeroWeights: AttentionWeights = {
			novelty: 0,
			impact: 0,
			conflict: 0,
			repetition: 0,
			confidence: 0,
			tasteSensitivity: 0,
			recency: 0,
			usage: 0,
		};
		const item = makeItem({ confidence: 0.5 });
		const ctx = makeContext();
		expect(scoreAttention(item, ctx, zeroWeights)).toBe(0);
	});

	it("handles null knowledge_items.confidence as neutral 0.5", () => {
		const item = makeItem({ id: "ki-x", confidence: null });
		const ctx = makeContext();
		// Just assert it produces a finite number in [0,1]
		const s = scoreAttention(item, ctx, weights);
		expect(Number.isFinite(s)).toBe(true);
		expect(s).toBeGreaterThanOrEqual(0);
		expect(s).toBeLessThanOrEqual(1);
	});

	it("AC6: scoring 1000 synthetic items completes in <1000ms", () => {
		const items: KnowledgeItem[] = [];
		const cohort = new Map<string, number>();
		const crossScope = new Map<string, number>();
		const conflicted = new Set<string>();

		for (let i = 0; i < 1000; i++) {
			items.push(
				makeItem({
					id: `ki-${i}`,
					layer: "L3",
					scopeId: `scope-${i % 10}`,
					kind: i % 2 === 0 ? "pattern" : "brief",
					topic: i % 3 === 0 ? "brand" : "auth",
					confidence: (i % 100) / 100,
				}),
			);
			if (i % 5 === 0) {
				conflicted.add(`ki-${i}`);
			}
		}
		for (let i = 0; i < 10; i++) {
			cohort.set(`L3|scope-${i}|auth|pattern`, 5);
			cohort.set(`L3|scope-${i}|brand|brief`, 3);
		}
		crossScope.set("L3|auth|pattern", 7);
		crossScope.set("L3|brand|brief", 4);

		const ctx = makeContext({
			cohortSizeByKey: cohort,
			crossScopeCountByKey: crossScope,
			conflictedIds: conflicted,
		});

		const start = performance.now();
		const results = scoreAttentionBatch(items, ctx, weights);
		const duration = performance.now() - start;

		expect(results.length).toBe(1000);
		expect(duration).toBeLessThan(1000);
	});
});

describe("scoreAttention (parse boundaries)", () => {
	const weights: AttentionWeights = getDefaultAttentionWeights();

	// @lore G2: we removed the `meta.impact` override path. Agent-authored
	// meta cannot inflate impact regardless of content. This test pins that
	// behavior so a future refactor can't silently reinstate the trust path.
	it("ignores `meta.impact` — agent-authored meta cannot drive impact", () => {
		const withMeta = makeItem({
			id: "ki-meta",
			kind: "pattern",
			confidence: 0.5,
			meta: JSON.stringify({ impact: 1.0 }),
		});
		const noMeta = makeItem({
			id: "ki-plain",
			kind: "pattern",
			confidence: 0.5,
		});
		const ctx = makeContext();
		const metaScore = scoreAttention(withMeta, ctx, weights);
		const plainScore = scoreAttention(noMeta, ctx, weights);
		expect(metaScore).toBe(plainScore);
	});

	// @lore G2: `meta.usageCount` is likewise not trusted. Usage is zero until
	// G3 adds a trustworthy reference count.
	it("ignores `meta.usageCount` — agent-authored meta cannot drive usage", () => {
		const withUsage = makeItem({
			id: "ki-use",
			kind: "pattern",
			confidence: 0.5,
			meta: JSON.stringify({ usageCount: 1000 }),
		});
		const noUsage = makeItem({
			id: "ki-nouse",
			kind: "pattern",
			confidence: 0.5,
		});
		const ctx = makeContext();
		const a = scoreAttention(withUsage, ctx, weights);
		const b = scoreAttention(noUsage, ctx, weights);
		expect(a).toBe(b);
	});
});
