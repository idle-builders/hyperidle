/**
 * X6: Tests for context-window.ts — contextWindowForModel() and isAboveThreshold().
 *
 * These fail (red phase) until context-window.ts is implemented.
 */

import { describe, expect, it } from "vitest";
import {
	DEFAULT_CONTEXT_WINDOW,
	isAboveThreshold,
	MODEL_CONTEXT_WINDOWS,
	modelContextWindow,
} from "../context-window.js";

// ── contextWindowForModel ────────────────────────────────────────────────────

describe("contextWindowForModel", () => {
	// AH2: Re-keyed to current catalog IDs.
	it("returns 1_000_000 for claude-opus-4-8", () => {
		expect(modelContextWindow("claude-opus-4-8")).toBe(1_000_000);
	});

	it("returns 1_000_000 for claude-sonnet-4-6", () => {
		expect(modelContextWindow("claude-sonnet-4-6")).toBe(1_000_000);
	});

	it("returns 200_000 for claude-haiku-4-5", () => {
		expect(modelContextWindow("claude-haiku-4-5")).toBe(200_000);
	});

	it("returns 1_000_000 for claude-fable-5", () => {
		expect(modelContextWindow("claude-fable-5")).toBe(1_000_000);
	});

	it("returns DEFAULT_CONTEXT_WINDOW (128_000) for an unknown model", () => {
		expect(modelContextWindow("gpt-4-turbo-unknown")).toBe(DEFAULT_CONTEXT_WINDOW);
		expect(DEFAULT_CONTEXT_WINDOW).toBe(128_000);
	});

	it("returns DEFAULT_CONTEXT_WINDOW for an empty string", () => {
		expect(modelContextWindow("")).toBe(DEFAULT_CONTEXT_WINDOW);
	});

	it("MODEL_CONTEXT_WINDOWS includes claude-opus-4-8", () => {
		expect(MODEL_CONTEXT_WINDOWS["claude-opus-4-8"]).toBe(1_000_000);
	});

	it("MODEL_CONTEXT_WINDOWS includes claude-sonnet-4-6", () => {
		expect(MODEL_CONTEXT_WINDOWS["claude-sonnet-4-6"]).toBe(1_000_000);
	});

	it("MODEL_CONTEXT_WINDOWS includes claude-haiku-4-5", () => {
		expect(MODEL_CONTEXT_WINDOWS["claude-haiku-4-5"]).toBe(200_000);
	});
});

// ── isAboveThreshold ─────────────────────────────────────────────────────────

describe("isAboveThreshold", () => {
	// At 80% threshold on a 100_000 context window:
	// threshold is 80_000 tokens
	const contextWindow = 100_000;
	const threshold = 0.8;

	it("returns false when tokens are below the threshold (79%)", () => {
		// 79% of 100_000 = 79_000
		expect(isAboveThreshold(79_000, contextWindow, threshold)).toBe(false);
	});

	it("returns false when tokens are exactly at threshold (80%)", () => {
		// 80% of 100_000 = 80_000 — NOT above threshold
		expect(isAboveThreshold(80_000, contextWindow, threshold)).toBe(false);
	});

	it("returns true when tokens are above the threshold (81%)", () => {
		// 81% of 100_000 = 81_000
		expect(isAboveThreshold(81_000, contextWindow, threshold)).toBe(true);
	});

	it("returns true at 100% (full context)", () => {
		expect(isAboveThreshold(100_000, contextWindow, threshold)).toBe(true);
	});

	it("returns false at 0 tokens", () => {
		expect(isAboveThreshold(0, contextWindow, threshold)).toBe(false);
	});

	it("works correctly with the default 80% threshold on a 200_000 context window", () => {
		// 200_000 * 0.8 = 160_000
		expect(isAboveThreshold(159_999, 200_000, 0.8)).toBe(false);
		expect(isAboveThreshold(160_001, 200_000, 0.8)).toBe(true);
	});

	it("works with a 50% threshold", () => {
		expect(isAboveThreshold(49_999, 100_000, 0.5)).toBe(false);
		expect(isAboveThreshold(50_001, 100_000, 0.5)).toBe(true);
	});

	it("uses the LATEST call's input tokens, not a cumulative sum", () => {
		// Critique CRITICAL-1: the signal must be the most recent inputTokens value.
		// This test validates the contract: if the last call sent 40_000 tokens
		// (40% of 100_000), it is NOT above an 80% threshold, even if 5 prior calls
		// each sent 40_000 tokens (which would sum to 200_000 — a false positive).
		const latestInputTokens = 40_000; // 40% fill
		expect(isAboveThreshold(latestInputTokens, contextWindow, threshold)).toBe(false);
	});
});
