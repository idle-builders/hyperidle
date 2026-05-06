// L3 RED — formatter contract for ArtifactCostFromSession.
// Source of truth: plans/L3/architecture.md §3.3.
// L17: updated to reflect WireMoney + TokenUsage output contract.

import { describe, expect, it } from "vitest";
import { type ArtifactCostInput, formatArtifactCost } from "../format/artifact-cost.js";
import type { ArtifactCostFromSession } from "../types/artifact.js";

describe("formatArtifactCost — null inputs", () => {
	it("returns money:null when cost_money_micros is null", () => {
		const out = formatArtifactCost({
			money_micros: null,
			tokens_input: 100,
			tokens_output: 100,
		});
		expect(out.money).toBeNull();
	});

	it("returns tokens:null only when BOTH token columns are null", () => {
		const a = formatArtifactCost({
			money_micros: 1000,
			tokens_input: null,
			tokens_output: null,
		});
		expect(a.tokens).toBeNull();

		const b = formatArtifactCost({
			money_micros: 1000,
			tokens_input: 50,
			tokens_output: null,
		});
		expect(b.tokens).not.toBeNull();
	});

	it("all-null input maps to {money:null, tokens:null}", () => {
		const out: ArtifactCostFromSession = formatArtifactCost({
			money_micros: null,
			tokens_input: null,
			tokens_output: null,
		});
		expect(out).toEqual({ money: null, tokens: null });
	});
});

describe("formatArtifactCost — money formatting (L17: WireMoney output)", () => {
	it("420000 micros -> WireMoney {minor:42, currency:'USD'}", () => {
		const out = formatArtifactCost({
			money_micros: 420_000,
			tokens_input: null,
			tokens_output: null,
		});
		// 420_000 micros / 10_000 = 42 cents = $0.42
		expect(out.money).toEqual({ minor: 42, currency: "USD" });
	});

	it("12000000 micros -> WireMoney {minor:1200, currency:'USD'}", () => {
		const out = formatArtifactCost({
			money_micros: 12_000_000,
			tokens_input: null,
			tokens_output: null,
		});
		// 12_000_000 micros / 10_000 = 1200 cents = $12.00
		expect(out.money).toEqual({ minor: 1200, currency: "USD" });
	});

	it("0 micros renders WireMoney {minor:0} (not null) — an explicit zero is data, not pending", () => {
		const out = formatArtifactCost({
			money_micros: 0,
			tokens_input: null,
			tokens_output: null,
		});
		expect(out.money).toEqual({ minor: 0, currency: "USD" });
	});
});

describe("formatArtifactCost — token usage (L17: TokenUsage output)", () => {
	it("sums input + output into workhorse tier", () => {
		const out = formatArtifactCost({
			money_micros: null,
			tokens_input: 100,
			tokens_output: 148,
		});
		expect(out.tokens).not.toBeNull();
		if (out.tokens !== null) {
			expect(out.tokens.byTier.workhorse?.prompt).toBe(100);
			expect(out.tokens.byTier.workhorse?.completion).toBe(148);
		}
	});

	it("returns TokenUsage with correct prompt/completion counts", () => {
		const out = formatArtifactCost({
			money_micros: null,
			tokens_input: 6_000,
			tokens_output: 6_400,
		});
		expect(out.tokens).not.toBeNull();
		if (out.tokens !== null) {
			expect(out.tokens.byTier.workhorse?.prompt).toBe(6_000);
			expect(out.tokens.byTier.workhorse?.completion).toBe(6_400);
		}
	});

	it("under 1k prompt still maps to byTier", () => {
		const out = formatArtifactCost({
			money_micros: null,
			tokens_input: 100,
			tokens_output: 0,
		});
		expect(out.tokens).not.toBeNull();
		if (out.tokens !== null) {
			expect(out.tokens.byTier.workhorse?.prompt).toBe(100);
			expect(out.tokens.byTier.workhorse?.completion).toBe(0);
		}
	});
});

describe("formatArtifactCost — type contract", () => {
	it("ArtifactCostInput accepts the precision-safe integer columns", () => {
		const input: ArtifactCostInput = {
			money_micros: 1,
			tokens_input: 1,
			tokens_output: 1,
		};
		expect(input).toBeDefined();
	});
});
