/**
 * AG2 — Pure unit tests for portfolioFilters.ts predicates.
 *
 * These tests are RED until portfolioFilters.ts is implemented.
 * Each predicate is the testable seam for the derived-visibility model.
 *
 * AC-2: outcome-verdict filters only appear when ≥1 bet has recorded outcome
 * AC-3: status filter only when ≥2 distinct status buckets; team filter only when ≥2 team ids
 */

import { describe, expect, it } from "vitest";
import {
	distinctStatusBuckets,
	distinctTeamIds,
	formatPortfolioCount,
	hasAnyRecordedOutcome,
} from "../portfolioFilters";

// Minimal bet shape for predicate tests
type MinBet = Parameters<typeof hasAnyRecordedOutcome>[0][0];

// ─── hasAnyRecordedOutcome ───────────────────────────────────────────────────

describe("hasAnyRecordedOutcome", () => {
	it("returns false for empty array", () => {
		expect(hasAnyRecordedOutcome([])).toBe(false);
	});

	it("returns false when all bets have null outcomeVerdict", () => {
		const bets: MinBet[] = [
			{ id: "b1", teamId: "t1", status: "active", outcomeVerdict: null },
			{ id: "b2", teamId: "t1", status: "completed", outcomeVerdict: null },
			{ id: "b3", teamId: "t2", status: "draft", outcomeVerdict: null },
		];
		expect(hasAnyRecordedOutcome(bets)).toBe(false);
	});

	it("returns true when at least one bet has outcomeVerdict set (validated)", () => {
		const bets: MinBet[] = [
			{ id: "b1", teamId: "t1", status: "completed", outcomeVerdict: "validated" },
			{ id: "b2", teamId: "t1", status: "active", outcomeVerdict: null },
		];
		expect(hasAnyRecordedOutcome(bets)).toBe(true);
	});

	it("returns true for refuted verdict", () => {
		const bets: MinBet[] = [
			{ id: "b1", teamId: "t1", status: "killed", outcomeVerdict: "refuted" },
		];
		expect(hasAnyRecordedOutcome(bets)).toBe(true);
	});

	it("returns true for partial verdict", () => {
		const bets: MinBet[] = [
			{ id: "b1", teamId: "t1", status: "completed", outcomeVerdict: "partial" },
		];
		expect(hasAnyRecordedOutcome(bets)).toBe(true);
	});

	it("returns true for inconclusive verdict", () => {
		const bets: MinBet[] = [
			{ id: "b1", teamId: "t1", status: "completed", outcomeVerdict: "inconclusive" },
		];
		expect(hasAnyRecordedOutcome(bets)).toBe(true);
	});
});

// ─── distinctStatusBuckets ───────────────────────────────────────────────────

describe("distinctStatusBuckets", () => {
	it("returns empty set for empty array", () => {
		expect(distinctStatusBuckets([]).size).toBe(0);
	});

	it("returns size 1 for all-active bets", () => {
		const bets: MinBet[] = [
			{ id: "b1", teamId: "t1", status: "active", outcomeVerdict: null },
			{ id: "b2", teamId: "t1", status: "active", outcomeVerdict: null },
		];
		expect(distinctStatusBuckets(bets).size).toBe(1);
	});

	it("returns size 1 for all-draft bets", () => {
		const bets: MinBet[] = [{ id: "b1", teamId: "t1", status: "draft", outcomeVerdict: null }];
		expect(distinctStatusBuckets(bets).size).toBe(1);
	});

	it("returns size 2 for active + completed bets", () => {
		const bets: MinBet[] = [
			{ id: "b1", teamId: "t1", status: "active", outcomeVerdict: null },
			{ id: "b2", teamId: "t1", status: "completed", outcomeVerdict: "validated" },
		];
		expect(distinctStatusBuckets(bets).size).toBe(2);
	});

	it("folds killed into the completed bucket (size stays 2 for active+killed)", () => {
		const bets: MinBet[] = [
			{ id: "b1", teamId: "t1", status: "active", outcomeVerdict: null },
			{ id: "b2", teamId: "t1", status: "killed", outcomeVerdict: "refuted" },
		];
		const buckets = distinctStatusBuckets(bets);
		// killed folds into "completed" bucket — so we have active + completed = 2
		expect(buckets.size).toBe(2);
		expect(buckets.has("completed")).toBe(true);
	});

	it("folds completed and killed into same bucket (size 2 for active+completed+killed)", () => {
		const bets: MinBet[] = [
			{ id: "b1", teamId: "t1", status: "active", outcomeVerdict: null },
			{ id: "b2", teamId: "t1", status: "completed", outcomeVerdict: "validated" },
			{ id: "b3", teamId: "t1", status: "killed", outcomeVerdict: "refuted" },
		];
		const buckets = distinctStatusBuckets(bets);
		// killed folds into completed — only 2 distinct buckets
		expect(buckets.size).toBe(2);
	});

	it("returns size 3 for active + completed + draft", () => {
		const bets: MinBet[] = [
			{ id: "b1", teamId: "t1", status: "active", outcomeVerdict: null },
			{ id: "b2", teamId: "t1", status: "completed", outcomeVerdict: "validated" },
			{ id: "b3", teamId: "t1", status: "draft", outcomeVerdict: null },
		];
		expect(distinctStatusBuckets(bets).size).toBe(3);
	});
});

// ─── distinctTeamIds ─────────────────────────────────────────────────────────

describe("distinctTeamIds", () => {
	it("returns empty set for empty array", () => {
		expect(distinctTeamIds([]).size).toBe(0);
	});

	it("returns size 1 for single team", () => {
		const bets: MinBet[] = [
			{ id: "b1", teamId: "t1", status: "active", outcomeVerdict: null },
			{ id: "b2", teamId: "t1", status: "completed", outcomeVerdict: null },
		];
		expect(distinctTeamIds(bets).size).toBe(1);
	});

	it("returns size 2 for two distinct team ids", () => {
		const bets: MinBet[] = [
			{ id: "b1", teamId: "t1", status: "active", outcomeVerdict: null },
			{ id: "b2", teamId: "t2", status: "active", outcomeVerdict: null },
		];
		expect(distinctTeamIds(bets).size).toBe(2);
	});

	it("returns size 3 for three distinct team ids", () => {
		const bets: MinBet[] = [
			{ id: "b1", teamId: "t1", status: "active", outcomeVerdict: null },
			{ id: "b2", teamId: "t2", status: "active", outcomeVerdict: null },
			{ id: "b3", teamId: "t3", status: "active", outcomeVerdict: null },
		];
		expect(distinctTeamIds(bets).size).toBe(3);
	});
});

// ─── formatPortfolioCount ────────────────────────────────────────────────────

describe("formatPortfolioCount", () => {
	it("returns empty string for empty bets", () => {
		expect(formatPortfolioCount([])).toBe("");
	});

	it("singular bet, singular team", () => {
		const bets: MinBet[] = [{ id: "b1", teamId: "t1", status: "active", outcomeVerdict: null }];
		expect(formatPortfolioCount(bets)).toBe("1 bet · 1 team");
	});

	it("plural bets, singular team", () => {
		const bets: MinBet[] = [
			{ id: "b1", teamId: "t1", status: "active", outcomeVerdict: null },
			{ id: "b2", teamId: "t1", status: "completed", outcomeVerdict: null },
		];
		expect(formatPortfolioCount(bets)).toBe("2 bets · 1 team");
	});

	it("plural bets, plural teams", () => {
		const bets: MinBet[] = [
			{ id: "b1", teamId: "t1", status: "active", outcomeVerdict: null },
			{ id: "b2", teamId: "t2", status: "active", outcomeVerdict: null },
			{ id: "b3", teamId: "t1", status: "draft", outcomeVerdict: null },
		];
		expect(formatPortfolioCount(bets)).toBe("3 bets · 2 teams");
	});
});
