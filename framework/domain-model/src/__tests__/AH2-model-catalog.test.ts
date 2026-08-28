/**
 * AH2 RED — Model catalog unit tests
 *
 * AC4: Choices reflect current catalog; defaults point at current
 * - MODEL_CATALOG contains exactly the 4 current Claude models
 * - catalogEntry / isCatalogModel helpers work correctly
 * - DEFAULT_AGENT_MODEL_ID / DEFAULT_AGENT_MODEL_PROVIDER
 *
 * These tests FAIL until:
 *  - framework/domain-model/src/model-gateway.ts adds MODEL_CATALOG, isCatalogModel, catalogEntry, DEFAULT_AGENT_*
 *  - framework/domain-model/src/index.ts exports the new symbols
 */

import { describe, expect, it } from "vitest";
import {
	catalogEntry,
	DEFAULT_AGENT_MODEL_ID,
	DEFAULT_AGENT_MODEL_PROVIDER,
	isCatalogModel,
	MODEL_CATALOG,
} from "../model-gateway.js";

describe("AH2 AC4: MODEL_CATALOG entries", () => {
	it("contains exactly the 4 current Claude model ids", () => {
		const ids = MODEL_CATALOG.map((m) => m.id);
		expect(ids).toEqual([
			"claude-opus-4-8",
			"claude-sonnet-4-6",
			"claude-haiku-4-5",
			"claude-fable-5",
		]);
	});

	it("all entries have provider 'anthropic'", () => {
		for (const entry of MODEL_CATALOG) {
			expect(entry.provider).toBe("anthropic");
		}
	});

	it("all entries have a non-empty label", () => {
		for (const entry of MODEL_CATALOG) {
			expect(entry.label.length).toBeGreaterThan(0);
		}
	});

	it("all entries have contextWindow > 0", () => {
		for (const entry of MODEL_CATALOG) {
			expect(entry.contextWindow).toBeGreaterThan(0);
		}
	});

	it("claude-opus-4-8 has 1_000_000 context window", () => {
		const entry = MODEL_CATALOG.find((m) => m.id === "claude-opus-4-8");
		expect(entry?.contextWindow).toBe(1_000_000);
	});

	it("claude-sonnet-4-6 has 1_000_000 context window", () => {
		const entry = MODEL_CATALOG.find((m) => m.id === "claude-sonnet-4-6");
		expect(entry?.contextWindow).toBe(1_000_000);
	});

	it("claude-haiku-4-5 has 200_000 context window", () => {
		const entry = MODEL_CATALOG.find((m) => m.id === "claude-haiku-4-5");
		expect(entry?.contextWindow).toBe(200_000);
	});

	it("claude-fable-5 has 1_000_000 context window", () => {
		const entry = MODEL_CATALOG.find((m) => m.id === "claude-fable-5");
		expect(entry?.contextWindow).toBe(1_000_000);
	});

	it("contains no stale -20250514 model ids", () => {
		for (const entry of MODEL_CATALOG) {
			expect(entry.id).not.toContain("20250514");
		}
	});

	it("contains no stale haiku-3-5 model ids", () => {
		for (const entry of MODEL_CATALOG) {
			expect(entry.id).not.toContain("haiku-3-5");
		}
	});
});

describe("AH2 AC4: isCatalogModel helper", () => {
	it("returns true for every catalog id", () => {
		for (const entry of MODEL_CATALOG) {
			expect(isCatalogModel(entry.id)).toBe(true);
		}
	});

	it("returns false for stale claude-opus-4-20250514", () => {
		expect(isCatalogModel("claude-opus-4-20250514")).toBe(false);
	});

	it("returns false for stale claude-sonnet-4-20250514", () => {
		expect(isCatalogModel("claude-sonnet-4-20250514")).toBe(false);
	});

	it("returns false for stale claude-haiku-3-5-20241022", () => {
		expect(isCatalogModel("claude-haiku-3-5-20241022")).toBe(false);
	});

	it("returns false for arbitrary string", () => {
		expect(isCatalogModel("gpt-4o")).toBe(false);
	});

	it("returns false for empty string", () => {
		expect(isCatalogModel("")).toBe(false);
	});
});

describe("AH2 AC4: catalogEntry helper", () => {
	it("returns entry for claude-opus-4-8", () => {
		const entry = catalogEntry("claude-opus-4-8");
		expect(entry).toBeDefined();
		expect(entry?.id).toBe("claude-opus-4-8");
	});

	it("returns entry for claude-fable-5", () => {
		const entry = catalogEntry("claude-fable-5");
		expect(entry).toBeDefined();
		expect(entry?.contextWindow).toBe(1_000_000);
	});

	it("returns undefined for unknown id", () => {
		expect(catalogEntry("not-a-model")).toBeUndefined();
	});
});

describe("AH2 AC4: DEFAULT_AGENT_* constants", () => {
	it("DEFAULT_AGENT_MODEL_ID is claude-sonnet-4-6", () => {
		expect(DEFAULT_AGENT_MODEL_ID).toBe("claude-sonnet-4-6");
	});

	it("DEFAULT_AGENT_MODEL_PROVIDER is anthropic", () => {
		expect(DEFAULT_AGENT_MODEL_PROVIDER).toBe("anthropic");
	});
});
