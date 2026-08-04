/**
 * AU27 Increment 9 — the return-enforcement naming guard: unit tests.
 *
 * Tests the checkContent() / runCheck() functions from scripts/al6-naming-guard.ts.
 * This is a RUNTIME TEST of the guard FUNCTION — it imports and asserts behaviour,
 * distinct from the guard CLI run itself (which is exercised via `npm run lint`).
 *
 * The guard's own AC: no historical work-package-ID naming remains in the
 * return-enforcement production code. The mechanism is "return enforcement",
 * not a work-package id.
 */

import { describe, expect, test } from "vitest";
import { checkContent, runCheck } from "../../../../scripts/al6-naming-guard.js";

const HISTORICAL_WP_ID = "AL6";

describe("return-enforcement naming guard checkContent — flags the historical identifier", () => {
	test("flags the identifier in a code comment (uppercase)", () => {
		const result = checkContent(`// ${HISTORICAL_WP_ID}: return-gate escape surface`);
		expect(result.clean).toBe(false);
		expect(result.hits.length).toBeGreaterThan(0);
	});

	test("flags the identifier lowercased, e.g. a reintroduced identifier prefix", () => {
		const result = checkContent("const sessionId = `al6-test-${id}`;");
		expect(result.clean).toBe(false);
	});

	test("flags the identifier baked into an old-style constant name", () => {
		const result = checkContent(`export const ${HISTORICAL_WP_ID}_FORCE_RETURN_MESSAGE = '...';`);
		expect(result.clean).toBe(false);
	});

	test("flags the identifier baked into an old-style lint-rule marker string", () => {
		const result = checkContent(`// ${HISTORICAL_WP_ID}-relay`);
		expect(result.clean).toBe(false);
	});

	test("flags the identifier baked into an old-style HTTP header name", () => {
		const result = checkContent(`"X-${HISTORICAL_WP_ID}-Budget-Left": String(budgetLeft),`);
		expect(result.clean).toBe(false);
	});
});

describe("return-enforcement naming guard checkContent — does not flag the renamed vocabulary", () => {
	test("does not flag the renamed constant", () => {
		const result = checkContent("export const FORCE_RETURN_MESSAGE = '...';");
		expect(result.clean).toBe(true);
	});

	test("does not flag the renamed lint-rule marker", () => {
		const result = checkContent("// return-relay");
		expect(result.clean).toBe(true);
	});

	test("does not flag the renamed HTTP header", () => {
		const result = checkContent('"X-Return-Budget-Left": String(budgetLeft),');
		expect(result.clean).toBe(true);
	});

	test("does not flag a different work-package id sharing the same letter prefix", () => {
		const result = checkContent("// @lore AL7 real-harness: uses the same wiring");
		expect(result.clean).toBe(true);
	});

	test("does not flag ordinary 'return enforcement' prose", () => {
		const result = checkContent("// the return enforcement mechanism, adjusted in place");
		expect(result.clean).toBe(true);
	});

	test("returns clean for an empty string", () => {
		const result = checkContent("");
		expect(result.clean).toBe(true);
	});
});

describe("return-enforcement naming guard checkContent — hit reporting", () => {
	test("reports the offending line content and line number", () => {
		const content = `// good line\nconst ${HISTORICAL_WP_ID}_MAX_FORCE_RETURNS = 2;\n// fine`;
		const result = checkContent(content);
		expect(result.clean).toBe(false);
		expect(result.hits[0]).toMatch(/line 2/);
		expect(result.hits.some((h) => h.includes("MAX_FORCE_RETURNS"))).toBe(true);
	});
});

describe("return-enforcement naming guard runCheck — smoke test", () => {
	test("runCheck returns an object with ok and hits properties", () => {
		// runCheck scans the filesystem — pass a non-existent directory so it
		// returns ok:true trivially (no packages/ subdirectory to walk).
		const result = runCheck("/nonexistent-dir-naming-guard-smoke");
		expect(result).toHaveProperty("ok");
		expect(result).toHaveProperty("hits");
		expect(Array.isArray(result.hits)).toBe(true);
		expect(result.ok).toBe(true);
	});
});
