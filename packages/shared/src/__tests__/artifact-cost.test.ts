// L3 RED — formatter contract for ArtifactCostFromSession.
// Source of truth: plans/architecture-plans/L3.md §3.3.

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

describe("formatArtifactCost — money formatting", () => {
	it("420000 micros -> '$0.42'", () => {
		const out = formatArtifactCost({
			money_micros: 420_000,
			tokens_input: null,
			tokens_output: null,
		});
		expect(out.money).toBe("$0.42");
	});

	it("12000000 micros -> '$12.00'", () => {
		const out = formatArtifactCost({
			money_micros: 12_000_000,
			tokens_input: null,
			tokens_output: null,
		});
		expect(out.money).toBe("$12.00");
	});

	it("0 micros renders '$0.00' (not null) — an explicit zero is data, not pending", () => {
		const out = formatArtifactCost({
			money_micros: 0,
			tokens_input: null,
			tokens_output: null,
		});
		expect(out.money).toBe("$0.00");
	});
});

describe("formatArtifactCost — token short form", () => {
	it("sums input + output", () => {
		const out = formatArtifactCost({
			money_micros: null,
			tokens_input: 100,
			tokens_output: 148,
		});
		expect(out.tokens).toBe("248");
	});

	it("12k+ uses '12.4k' short form", () => {
		const out = formatArtifactCost({
			money_micros: null,
			tokens_input: 6_000,
			tokens_output: 6_400,
		});
		expect(out.tokens).toBe("12.4k");
	});

	it("under 1k stays as integer", () => {
		const out = formatArtifactCost({
			money_micros: null,
			tokens_input: 100,
			tokens_output: 0,
		});
		expect(out.tokens).toBe("100");
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
