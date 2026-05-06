/**
 * L22 red phase — golden fixture tests for computeRelevanceScore.
 *
 * These tests fail until packages/fabric/src/relevance-engine.ts is
 * implemented. They pin the L5 formula to 6-decimal golden values.
 */
import { describe, expect, it } from "vitest";
import {
	computeRelevanceScore,
	type RelevanceConfig,
	type RelevanceInput,
} from "../relevance-engine.js";

/** Default config matching L5 spec constants. */
const DEFAULT_CONFIG: RelevanceConfig = {
	weights: { recency: 0.4, frequency: 0.4, citation: 0.2 },
	shape: {
		recencyHalflifeDays: 14,
		frequencySaturation: 5,
		frequencyWindowDays: 30,
		citationSaturation: 5,
	},
};

function clamp01(x: number): number {
	return Math.max(0, Math.min(1, x));
}

function round6(x: number): number {
	return Math.round(x * 1_000_000) / 1_000_000;
}

/**
 * Hand-calculate the expected score from L5 formula.
 *
 * relevance = (w_r * recency + w_f * frequency + w_c * citation) / denominator
 * recency   = exp(-ln(2) * ageDays / halflife)
 * frequency = clamp01(accessCount / saturation)
 * citation  = citationCount != null ? clamp01(citationCount / saturation) : 0
 * denominator = w_r + w_f + (citationCount != null ? w_c : 0)
 */
function handCalculate(
	ageDays: number,
	accessCount: number,
	citationCount: number | null,
	config: RelevanceConfig = DEFAULT_CONFIG,
): number {
	const { weights, shape } = config;
	const recency = Math.exp((-Math.LN2 * ageDays) / shape.recencyHalflifeDays);
	const frequency = clamp01(accessCount / shape.frequencySaturation);
	const citation = citationCount != null ? clamp01(citationCount / shape.citationSaturation) : 0;
	const denominator =
		weights.recency + weights.frequency + (citationCount != null ? weights.citation : 0);
	return round6(
		clamp01(
			(weights.recency * recency + weights.frequency * frequency + weights.citation * citation) /
				denominator,
		),
	);
}

describe("computeRelevanceScore — golden fixture tests (AC-4, AC-8)", () => {
	// Golden fixture 1: all signals present — ageDays=7, accessCount=3, citationCount=2
	it("fixture 1: all signals present — ageDays=7, accessCount=3, citationCount=2", () => {
		const input: RelevanceInput = { ageDays: 7, accessCount: 3, citationCount: 2 };
		const expected = handCalculate(7, 3, 2);
		const result = computeRelevanceScore(input, DEFAULT_CONFIG);
		expect(result).not.toBeNull();
		expect(result).toBeCloseTo(expected, 6);
	});

	// Golden fixture 2: citation null — effective denominator drops w_c (AC-3)
	it("fixture 2: citationCount null — denominator excludes w_c", () => {
		const input: RelevanceInput = { ageDays: 7, accessCount: 3, citationCount: null };
		const expected = handCalculate(7, 3, null);
		const result = computeRelevanceScore(input, DEFAULT_CONFIG);
		expect(result).not.toBeNull();
		expect(result).toBeCloseTo(expected, 6);

		// Must differ from citationCount=0 because denominator changes
		const withZeroCitation = handCalculate(7, 3, 0);
		expect(expected).not.toBe(withZeroCitation);
	});

	// Golden fixture 3: all null inputs → returns null (fake-zero guard, AC-8)
	it("fixture 3: all null inputs → returns null (fake-zero guard)", () => {
		const input: RelevanceInput = { ageDays: null, accessCount: null, citationCount: null };
		const result = computeRelevanceScore(input, DEFAULT_CONFIG);
		expect(result).toBeNull();
	});

	// Golden fixture 4: ageDays=0 → recency=1.0
	it("fixture 4: ageDays=0 → recency signal is 1.0", () => {
		const input: RelevanceInput = { ageDays: 0, accessCount: 0, citationCount: null };
		const result = computeRelevanceScore(input, DEFAULT_CONFIG);
		expect(result).not.toBeNull();
		// With ageDays=0: recency=1.0, frequency=0, no citation
		// denominator = 0.4 + 0.4 = 0.8; numerator = 0.4*1.0 + 0.4*0 = 0.4
		// score = 0.4 / 0.8 = 0.5
		expect(result).toBeCloseTo(0.5, 6);
	});

	// Golden fixture 5: accessCount >= saturation → frequency=1.0
	it("fixture 5: accessCount >= saturation → frequency signal is 1.0", () => {
		const input: RelevanceInput = { ageDays: 0, accessCount: 5, citationCount: null };
		const result = computeRelevanceScore(input, DEFAULT_CONFIG);
		expect(result).not.toBeNull();
		// ageDays=0 → recency=1.0, accessCount=5 >= sat=5 → frequency=1.0, no citation
		// denominator = 0.8; numerator = 0.4*1.0 + 0.4*1.0 = 0.8
		// score = 0.8 / 0.8 = 1.0
		expect(result).toBeCloseTo(1.0, 6);
	});

	// Golden fixture 6: citationCount >= saturation → citation=1.0
	it("fixture 6: citationCount >= saturation → citation signal is 1.0", () => {
		const input: RelevanceInput = { ageDays: 0, accessCount: 5, citationCount: 5 };
		const result = computeRelevanceScore(input, DEFAULT_CONFIG);
		expect(result).not.toBeNull();
		// All signals max → score = 1.0
		expect(result).toBeCloseTo(1.0, 6);
	});

	// Edge: accessCount above saturation still clamps at 1.0
	it("edge: accessCount > saturation clamps frequency to 1.0", () => {
		const input: RelevanceInput = { ageDays: 0, accessCount: 100, citationCount: null };
		const result = computeRelevanceScore(input, DEFAULT_CONFIG);
		expect(result).not.toBeNull();
		// Same as frequency=5 case — clamp prevents > 1.0
		expect(result).toBeLessThanOrEqual(1.0);
	});

	// Edge: citationCount above saturation still clamps at 1.0
	it("edge: citationCount > saturation clamps citation to 1.0", () => {
		const input: RelevanceInput = { ageDays: 0, accessCount: 0, citationCount: 100 };
		const result = computeRelevanceScore(input, DEFAULT_CONFIG);
		expect(result).not.toBeNull();
		expect(result).toBeLessThanOrEqual(1.0);
		expect(result).toBeGreaterThanOrEqual(0);
	});

	// Edge: very old item → recency near 0 but not negative
	it("edge: very old item (ageDays=365) → recency near 0, score in [0,1]", () => {
		const input: RelevanceInput = { ageDays: 365, accessCount: 0, citationCount: null };
		const result = computeRelevanceScore(input, DEFAULT_CONFIG);
		expect(result).not.toBeNull();
		expect(result).toBeGreaterThanOrEqual(0);
		expect(result).toBeLessThanOrEqual(1);
	});

	// Negative ageDays should be rejected / return null or treated as 0
	it("negative ageDays is treated as 0 or returns null — never crashes", () => {
		const input: RelevanceInput = { ageDays: -5, accessCount: 2, citationCount: null };
		// The implementation must not throw and must return a valid [0,1] or null
		const result = computeRelevanceScore(input, DEFAULT_CONFIG);
		if (result !== null) {
			expect(result).toBeGreaterThanOrEqual(0);
			expect(result).toBeLessThanOrEqual(1);
		}
	});

	// Negative accessCount is rejected — returns null or clamps to 0
	it("negative accessCount is clamped or input rejected — result in [0,1] or null", () => {
		const input: RelevanceInput = { ageDays: 7, accessCount: -1, citationCount: null };
		const result = computeRelevanceScore(input, DEFAULT_CONFIG);
		if (result !== null) {
			expect(result).toBeGreaterThanOrEqual(0);
			expect(result).toBeLessThanOrEqual(1);
		}
	});

	// NaN inputs must not propagate
	it("NaN ageDays is rejected — returns null or valid [0,1]", () => {
		const input: RelevanceInput = { ageDays: Number.NaN, accessCount: 2, citationCount: null };
		const result = computeRelevanceScore(input, DEFAULT_CONFIG);
		if (result !== null) {
			expect(Number.isFinite(result)).toBe(true);
			expect(result).toBeGreaterThanOrEqual(0);
			expect(result).toBeLessThanOrEqual(1);
		}
	});

	// Result is always rounded to 6 decimal places (determinism)
	it("result is rounded to 6 decimal places for cross-platform determinism", () => {
		const input: RelevanceInput = { ageDays: 7, accessCount: 3, citationCount: 2 };
		const result = computeRelevanceScore(input, DEFAULT_CONFIG);
		if (result !== null) {
			// Rounded to 6 decimals means: Math.round(result * 1e6) / 1e6 === result
			expect(Math.round(result * 1_000_000) / 1_000_000).toBe(result);
		}
	});

	// Custom weights: citation weight = 0 should ignore citation
	it("custom config: w_citation=0 ignores citation signal", () => {
		const config: RelevanceConfig = {
			weights: { recency: 0.5, frequency: 0.5, citation: 0 },
			shape: DEFAULT_CONFIG.shape,
		};
		const withCitation: RelevanceInput = { ageDays: 7, accessCount: 3, citationCount: 5 };
		const withoutCitation: RelevanceInput = { ageDays: 7, accessCount: 3, citationCount: null };
		// When citation weight is 0, citationCount present vs null should give same result
		// (since w_c=0, denominator is same either way)
		const a = computeRelevanceScore(withCitation, config);
		const b = computeRelevanceScore(withoutCitation, config);
		expect(a).toBe(b);
	});

	// All signals present with specific values — hand-calculated exact value
	it("fixture: ageDays=14, accessCount=5, citationCount=5 → max recency halflife = 0.5 recency", () => {
		// recency = exp(-ln2 * 14 / 14) = exp(-ln2) = 0.5
		// frequency = 5/5 = 1.0
		// citation = 5/5 = 1.0
		// denominator = 0.4+0.4+0.2 = 1.0
		// score = (0.4*0.5 + 0.4*1.0 + 0.2*1.0) / 1.0 = (0.2 + 0.4 + 0.2) / 1.0 = 0.8
		const input: RelevanceInput = { ageDays: 14, accessCount: 5, citationCount: 5 };
		const result = computeRelevanceScore(input, DEFAULT_CONFIG);
		expect(result).not.toBeNull();
		expect(result).toBeCloseTo(0.8, 5);
	});
});
