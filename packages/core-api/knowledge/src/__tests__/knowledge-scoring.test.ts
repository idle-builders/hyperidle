/**
 * AU20 completeness contract — pure-logic unit tests for the knowledge service.
 *
 * These tests cover capabilities that are pure functions (no DB needed):
 *   - sanitizeFtsQuery: FTS injection prevention + token normalization
 *   - countTokens: token estimation for budget enforcement
 *   - rankAndBudget / enforceBudget: L4 always included, greedy budget fill
 *
 * These tests pin the pure algorithmic behavior the rewrite must preserve.
 * They deliberately import from individual source modules (not the barrel) so
 * they survive barrel reorganization during Stage 2.
 */
import { describe, expect, test } from "vitest";
import { FTS_MAX_QUERY_CHARS, FTS_MAX_TOKENS, sanitizeFtsQuery } from "../fts.js";
import type { KnowledgeItemWithProjection } from "../knowledge-repository.js";
import { rankAndBudget } from "../relevance-scoring.js";
import type { ScoringContext, ScoringWeights } from "../scoring-config.js";
import { countTokens, enforceBudget } from "../token-budget.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(
	id: string,
	overrides: Partial<KnowledgeItemWithProjection> = {},
): KnowledgeItemWithProjection {
	const now = new Date().toISOString();
	return {
		id,
		scopeKind: "factory",
		scopeId: null,
		topic: null,
		title: `Title ${id}`,
		body: `Body ${id}`,
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "u-1",
		createdAt: now,
		updatedAt: now,
		layer: null,
		kind: null,
		attentionScore: null,
		confidence: null,
		meta: null,
		...overrides,
	};
}

const BASE_WEIGHTS: ScoringWeights = {
	tagMatch: 0.35,
	roleMatch: 0.15,
	recency: 0.15,
	confidence: 0.1,
	layerProximity: 0.15,
	attentionScore: 0.1,
};

const BASE_CONTEXT: ScoringContext = {
	taskDescription: "test task",
	taskTags: [],
	agentRole: "engineer",
	productId: "prod-1",
};

// ===========================================================================
// sanitizeFtsQuery
// ===========================================================================

describe("sanitizeFtsQuery: FTS injection prevention + token normalization", () => {
	test("returns empty string for empty/whitespace input", () => {
		expect(sanitizeFtsQuery("")).toBe("");
		expect(sanitizeFtsQuery("   ")).toBe("");
	});

	test("joins valid word tokens with &", () => {
		expect(sanitizeFtsQuery("foo bar baz")).toBe("foo & bar & baz");
	});

	test("strips SQL/tsquery injection characters", () => {
		// Raw tsquery operators must be stripped so injection is impossible.
		const result = sanitizeFtsQuery("foo | bar");
		expect(result).not.toContain("|");
		// 'foo' and 'bar' survive as tokens joined by &.
		expect(result).toContain("foo");
		expect(result).toContain("bar");
	});

	test("preserves trailing * as prefix-match operator", () => {
		const result = sanitizeFtsQuery("deploy*");
		expect(result).toBe("deploy:*");
	});

	test("strips * when it is the entire token (single-char)", () => {
		// A bare '*' stripped of its prefix role has no surviving chars.
		const result = sanitizeFtsQuery("*");
		expect(result).toBe("");
	});

	test("strips leading/trailing hyphens from tokens", () => {
		const result = sanitizeFtsQuery("-foo- bar");
		// '-foo-' → 'foo', 'bar' stays.
		expect(result).toContain("foo");
		expect(result).not.toContain("-foo-");
	});

	test("preserves internal hyphens (identifiers like react-router)", () => {
		const result = sanitizeFtsQuery("react-router");
		expect(result).toContain("react-router");
	});

	test("truncates input at FTS_MAX_QUERY_CHARS", () => {
		const long = "a".repeat(FTS_MAX_QUERY_CHARS + 100);
		const result = sanitizeFtsQuery(long);
		// Should produce a single token 'a...a' truncated to FTS_MAX_QUERY_CHARS chars.
		expect(result.length).toBeLessThanOrEqual(FTS_MAX_QUERY_CHARS + 10); // with & separators
	});

	test("truncates token list at FTS_MAX_TOKENS", () => {
		const manyWords = Array.from({ length: FTS_MAX_TOKENS + 20 }, (_, i) => `word${i}`).join(" ");
		const result = sanitizeFtsQuery(manyWords);
		const tokenCount = result.split(" & ").length;
		expect(tokenCount).toBeLessThanOrEqual(FTS_MAX_TOKENS);
	});
});
// ===========================================================================
// countTokens
// ===========================================================================

describe("countTokens: approximate token count via whitespace split", () => {
	test("returns 0 for empty or whitespace-only string", () => {
		expect(countTokens("")).toBe(0);
		expect(countTokens("   ")).toBe(0);
	});

	test("counts whitespace-separated tokens", () => {
		expect(countTokens("one two three")).toBe(3);
		expect(countTokens("single")).toBe(1);
	});

	test("handles multiple spaces between tokens", () => {
		expect(countTokens("a  b   c")).toBe(3);
	});
});

// ===========================================================================
// enforceBudget / rankAndBudget: L4 always included, greedy fill
// ===========================================================================

describe("enforceBudget: L4 items are always included first; greedy fill for others", () => {
	test("includes L4 items even when budget is zero", () => {
		const l4 = makeItem("l4", { layer: "L4", title: "L4 principle", body: "Factory knowledge." });
		const other = makeItem("other", { layer: "L2", title: "L2 item", body: "Team finding." });

		const result = enforceBudget(
			[
				{ item: other, score: 100 },
				{ item: l4, score: 50 },
			],
			0, // zero budget
		);

		const ids = result.map((r) => r.id);
		expect(ids).toContain("l4");
		// L2 item excluded because budget is 0 after L4.
	});

	test("fills remaining budget with highest-scored non-L4 items", () => {
		const l4 = makeItem("l4", { layer: "L4", title: "L4", body: "Principle." });
		// Two L2 items with different scores; only one fits budget.
		const hi = makeItem("hi", {
			layer: "L2",
			title: "Hi score",
			body: "Short.", // ~2 tokens title + ~1 body = 3
		});
		const lo = makeItem("lo", {
			layer: "L2",
			title: "Lo score",
			body: "Short.", // also ~3 tokens
		});

		// Budget: enough for L4 (3 tokens) + hi (3 tokens) = 6 tokens.
		// 'lo' would push us to 9 — too much for budget=6.
		const l4Tokens = 2 + 1; // "L4" title + "Principle." body
		const hiTokens = 2 + 1; // "Hi score" title + "Short." body
		const budget = l4Tokens + hiTokens;

		const result = enforceBudget(
			[
				{ item: l4, score: 50 },
				{ item: hi, score: 90 },
				{ item: lo, score: 10 },
			],
			budget,
		);

		const ids = result.map((r) => r.id);
		expect(ids).toContain("l4");
		expect(ids).toContain("hi");
		expect(ids).not.toContain("lo");
	});

	test("handles empty input gracefully", () => {
		const result = enforceBudget([], 1000);
		expect(result).toHaveLength(0);
	});
});

describe("rankAndBudget: scores items and applies budget enforcement", () => {
	test("returns empty array for empty input", () => {
		const result = rankAndBudget([], BASE_CONTEXT, BASE_WEIGHTS, 10_000);
		expect(result).toHaveLength(0);
	});

	test("returns items when within budget", () => {
		const items = [makeItem("a"), makeItem("b")];
		const result = rankAndBudget(items, BASE_CONTEXT, BASE_WEIGHTS, 100_000);
		expect(result.length).toBe(2);
	});

	test("L4 items appear in result regardless of score", () => {
		const now = Date.now();
		const l4 = makeItem("l4", {
			layer: "L4",
			title: "Factory principle",
			body: "Always applicable.",
			// old item — low recency score
			updatedAt: new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString(),
		});
		const fresh = makeItem("fresh", {
			layer: "L2",
			title: "Fresh team finding",
			body: "Recent discovery.",
			updatedAt: new Date(now - 1000).toISOString(),
		});

		// Very tight budget — just enough for one item's tokens.
		const tightBudget = 4; // "Fresh team finding" (3 tokens) + "Recent discovery." (2 tokens) = 5 > 4
		const result = rankAndBudget([l4, fresh], BASE_CONTEXT, BASE_WEIGHTS, tightBudget);

		// L4 item must be included (non-negotiable), even though budget is tight.
		expect(result.map((r) => r.id)).toContain("l4");
	});
});
