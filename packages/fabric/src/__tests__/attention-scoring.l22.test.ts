/**
 * L22 red phase — tests for IMPACT_BY_KIND deletion in attention-scoring.ts.
 *
 * AC-2: IMPACT_BY_KIND must be deleted. scoreAttention still returns [0,1]
 * with impact contributing 0.
 */
import type { KnowledgeItem } from "@hyperidle/db";
import { describe, expect, it } from "vitest";
import * as attentionScoring from "../attention-scoring.js";
import { type AttentionScoringContext, scoreAttention } from "../attention-scoring.js";
import { getDefaultAttentionWeights } from "../scoring-config.js";

function makeItem(overrides: Partial<KnowledgeItem> = {}): KnowledgeItem {
	return {
		id: overrides.id ?? "ki-l22-test",
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
		createdAt: overrides.createdAt ?? "2026-05-06T00:00:00.000Z",
		updatedAt: overrides.updatedAt ?? "2026-05-06T00:00:00.000Z",
		meta: overrides.meta ?? null,
	};
}

function makeContext(overrides: Partial<AttentionScoringContext> = {}): AttentionScoringContext {
	return {
		now: overrides.now ?? new Date("2026-05-06T00:00:00.000Z").getTime(),
		cohortSizeByKey: overrides.cohortSizeByKey ?? new Map<string, number>(),
		crossScopeCountByKey: overrides.crossScopeCountByKey ?? new Map<string, number>(),
		conflictedIds: overrides.conflictedIds ?? new Set<string>(),
		recentlyHumanEditedIds: overrides.recentlyHumanEditedIds ?? new Set<string>(),
		lastHumanEditAt: overrides.lastHumanEditAt ?? new Map<string, number>(),
	};
}

describe("AC-2: IMPACT_BY_KIND deletion", () => {
	// IMPACT_BY_KIND must NOT be exported from the module
	it("IMPACT_BY_KIND is NOT exported from attention-scoring module", () => {
		expect("IMPACT_BY_KIND" in attentionScoring).toBe(false);
	});

	// AC-2: After deletion, items of DIFFERENT kinds must score identically
	// when using the DEFAULT weights (which have impact=0.2).
	// Before deletion: principle (impact=1.0) vs brief (impact=0.5) score differently.
	// After deletion: both get impact=0, so all other factors equal → same score.
	it("AC-2: 'principle' and 'brief' items score identically with default weights after IMPACT_BY_KIND deletion", () => {
		const weights = getDefaultAttentionWeights();
		// Default weights have impact: 0.2 — so if computeImpact still returns kind-based values,
		// principle (1.0) and brief (0.5) would score differently.
		// After deletion, computeImpact is gone and impact always contributes 0.
		const principle = makeItem({ id: "ki-principle", kind: "principle", confidence: 0.5 });
		const brief = makeItem({ id: "ki-brief", kind: "brief", confidence: 0.5 });
		const ctx = makeContext();

		const scoreP = scoreAttention(principle, ctx, weights);
		const scoreB = scoreAttention(brief, ctx, weights);
		// After IMPACT_BY_KIND deletion: identical scores (impact contributes 0 for all kinds)
		expect(scoreP).toBe(scoreB);
	});

	// scoreAttention still returns a valid [0,1] score with impact=0
	it("scoreAttention returns valid [0,1] after IMPACT_BY_KIND deletion", () => {
		const weights = getDefaultAttentionWeights();
		const kinds = [
			"principle",
			"pattern",
			"anti_pattern",
			"decision",
			"failure",
			"reflection",
			"brief",
			"focus",
		] as const;

		for (const kind of kinds) {
			const item = makeItem({ kind, confidence: 0.5 });
			const ctx = makeContext();
			const score = scoreAttention(item, ctx, weights);
			expect(score).toBeGreaterThanOrEqual(0);
			expect(score).toBeLessThanOrEqual(1);
			expect(Number.isFinite(score)).toBe(true);
		}
	});

	// scoreAttention with totalWeight=0 still returns 0 (regression guard)
	it("totalWeight=0 returns 0 without crashing (regression guard)", () => {
		const zeroWeights = {
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
});
