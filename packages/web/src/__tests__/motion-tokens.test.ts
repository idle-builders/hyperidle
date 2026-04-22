/**
 * J8 — motion tokens live in tokens.css as three CSS custom properties:
 * --motion-fast (80ms), --motion-medium (150ms), --motion-slow (250ms).
 *
 * This test reads the source file to assert the tokens exist with the
 * specified values. The runtime check is not portable via jsdom because
 * `getComputedStyle` does not evaluate `@layer` cascade rules.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const INDEX_CSS = readFileSync(resolve(__dirname, "../../../design-system/src/tokens.css"), "utf8");

describe("J8 motion tokens", () => {
	it("declares --motion-fast as 80ms", () => {
		expect(INDEX_CSS).toMatch(/--motion-fast:\s*80ms/);
	});

	it("declares --motion-medium as 150ms", () => {
		expect(INDEX_CSS).toMatch(/--motion-medium:\s*150ms/);
	});

	it("declares --motion-slow as 250ms", () => {
		expect(INDEX_CSS).toMatch(/--motion-slow:\s*250ms/);
	});
});
