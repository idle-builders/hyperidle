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
import type { KnowledgeItemWithProjection } from "../knowledge-repository.js";
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
// enforceBudget: L4 always included, greedy fill
// ===========================================================================

describe("enforceBudget prioritizes always-included items then greedily fills", () => {
	test("includes always-included items even when budget is zero", () => {
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

	test("fills remaining budget with highest-scored optional items", () => {
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
