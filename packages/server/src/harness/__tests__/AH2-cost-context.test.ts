/**
 * AH2 RED — COST_PER_MILLION_TOKENS and MODEL_CONTEXT_WINDOWS re-keyed to current catalog ids
 *
 * AC4: Choices reflect current catalog — COST_PER_MILLION_TOKENS and MODEL_CONTEXT_WINDOWS
 * must contain no stale IDs and must resolve every catalog id to non-default values.
 *
 * These tests FAIL until:
 *  - builtin-harness-adapter.ts COST_PER_MILLION_TOKENS is re-keyed to catalog ids
 *  - context-window.ts MODEL_CONTEXT_WINDOWS is re-keyed to catalog ids
 */

import { MODEL_CATALOG } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import { contextWindowForModel, MODEL_CONTEXT_WINDOWS } from "../context-window.js";

describe("AH2 AC4: MODEL_CONTEXT_WINDOWS — current catalog ids", () => {
	it("contains no stale -20250514 keys", () => {
		for (const key of Object.keys(MODEL_CONTEXT_WINDOWS)) {
			expect(key).not.toContain("20250514");
		}
	});

	it("contains no stale claude-haiku-3-5 keys", () => {
		for (const key of Object.keys(MODEL_CONTEXT_WINDOWS)) {
			expect(key).not.toContain("haiku-3-5");
		}
	});

	it("contextWindowForModel('claude-opus-4-8') returns 1_000_000", () => {
		expect(contextWindowForModel("claude-opus-4-8")).toBe(1_000_000);
	});

	it("contextWindowForModel('claude-sonnet-4-6') returns 1_000_000", () => {
		expect(contextWindowForModel("claude-sonnet-4-6")).toBe(1_000_000);
	});

	it("contextWindowForModel('claude-haiku-4-5') returns 200_000", () => {
		expect(contextWindowForModel("claude-haiku-4-5")).toBe(200_000);
	});

	it("contextWindowForModel('claude-fable-5') returns 1_000_000", () => {
		expect(contextWindowForModel("claude-fable-5")).toBe(1_000_000);
	});

	it("every catalog id resolves to a non-default (> 128_000) or explicitly set context window", () => {
		// The default is 128_000; every catalog id should be explicitly mapped
		for (const entry of MODEL_CATALOG) {
			const resolved = contextWindowForModel(entry.id);
			// Must be in the explicit map (not falling through to default 128_000)
			expect(MODEL_CONTEXT_WINDOWS[entry.id]).toBeDefined();
			expect(resolved).toBe(entry.contextWindow);
		}
	});
});
