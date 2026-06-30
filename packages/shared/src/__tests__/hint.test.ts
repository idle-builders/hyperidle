/**
 * P5 — Hint catalog tests (Task 2, AC2)
 *
 * AC coverage:
 * AC2a: HINT_CATALOG has >= 5 entries.
 * AC2b: Each entry has id, copy, testId fields.
 * AC2c: isHintId("create-bet") === true.
 * AC2d: isHintId("nonexistent") === false.
 * AC2e: All HintId values appear in HINT_IDS.
 * AC2f: Each entry's id is unique within the catalog.
 * AC2g: Each entry's testId is unique within the catalog.
 */

import { describe, expect, it } from "vitest";
import { HINT_CATALOG, HINT_IDS, type HintCatalogEntry, type HintId, isHintId } from "../hint.js";

describe("P5 AC2: HINT_CATALOG", () => {
	it("has at least 5 entries", () => {
		expect(HINT_CATALOG.length).toBeGreaterThanOrEqual(5);
	});

	it("each entry has id, copy, and testId fields", () => {
		for (const entry of HINT_CATALOG) {
			expect(typeof entry.id).toBe("string");
			expect(entry.id.length).toBeGreaterThan(0);
			expect(typeof entry.copy).toBe("string");
			expect(entry.copy.length).toBeGreaterThan(0);
			expect(typeof entry.testId).toBe("string");
			expect(entry.testId.length).toBeGreaterThan(0);
		}
	});

	it("contains all 5 expected hint IDs", () => {
		const ids = HINT_CATALOG.map((h) => h.id);
		const expected: HintId[] = [
			"create-bet",
			"add-credential",
			"knowledge-empty",
			"review-verdict",
			"review-agents", // AB3: agent customization first-time hint
		];
		for (const id of expected) {
			expect(ids).toContain(id);
		}
	});

	it("each entry has a unique id", () => {
		const ids = HINT_CATALOG.map((h) => h.id);
		const uniqueIds = new Set<HintId>(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it("each entry has a unique testId", () => {
		const testIds = HINT_CATALOG.map((h) => h.testId);
		const uniqueTestIds = new Set<string>(testIds);
		expect(uniqueTestIds.size).toBe(testIds.length);
	});

	it("copy strings are non-empty strings with meaningful content", () => {
		for (const entry of HINT_CATALOG) {
			expect(entry.copy.trim().length).toBeGreaterThan(10);
		}
	});
});

describe("P5 AC2: HINT_IDS", () => {
	it("is an array of strings matching HINT_CATALOG ids", () => {
		expect(Array.isArray(HINT_IDS)).toBe(true);
		const catalogIds = HINT_CATALOG.map((h) => h.id);
		for (const id of catalogIds) {
			expect(HINT_IDS).toContain(id);
		}
	});

	it("has the same length as HINT_CATALOG", () => {
		expect(HINT_IDS.length).toBe(HINT_CATALOG.length);
	});
});

describe("P5 AC2: isHintId", () => {
	it('isHintId("create-bet") returns true', () => {
		expect(isHintId("create-bet")).toBe(true);
	});

	it('isHintId("add-credential") returns true', () => {
		expect(isHintId("add-credential")).toBe(true);
	});

	it('isHintId("knowledge-empty") returns true', () => {
		expect(isHintId("knowledge-empty")).toBe(true);
	});

	it('isHintId("review-verdict") returns true', () => {
		expect(isHintId("review-verdict")).toBe(true);
	});

	// AB3: new hint ID
	it('isHintId("review-agents") returns true', () => {
		expect(isHintId("review-agents")).toBe(true);
	});

	it('isHintId("nonexistent") returns false', () => {
		expect(isHintId("nonexistent")).toBe(false);
	});

	it('isHintId("") returns false', () => {
		expect(isHintId("")).toBe(false);
	});

	it("isHintId with an arbitrary string returns false", () => {
		expect(isHintId("some-random-string-that-is-not-a-hint")).toBe(false);
	});

	it("acts as a type guard — all catalog IDs pass, non-catalog IDs fail", () => {
		const knownBadValues = ["Create-Bet", "CREATE-BET", " create-bet", "create-bet "];
		for (const v of knownBadValues) {
			expect(isHintId(v)).toBe(false);
		}
	});

	it("all HINT_IDS pass isHintId", () => {
		for (const id of HINT_IDS) {
			expect(isHintId(id)).toBe(true);
		}
	});
});

describe("P5 AC2: HintCatalogEntry shape compliance", () => {
	it("HINT_CATALOG is readonly", () => {
		// TypeScript-level assertion — the array is typed as readonly.
		// We verify the runtime object by checking it's array-like and non-empty.
		const catalog: readonly HintCatalogEntry[] = HINT_CATALOG;
		expect(catalog.length).toBeGreaterThan(0);
	});

	it("create-bet entry has expected copy and testId", () => {
		const entry = HINT_CATALOG.find((h) => h.id === "create-bet");
		expect(entry).toBeDefined();
		expect(entry?.testId).toBe("hint-create-bet");
		expect(entry?.copy.length).toBeGreaterThan(0);
	});
});
