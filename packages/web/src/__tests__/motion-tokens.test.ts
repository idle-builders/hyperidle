/**
 * J8 — motion tokens live in index.css as three CSS custom properties:
 * --motion-fast (120ms), --motion-medium (200ms), --motion-slow (320ms).
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
	it("declares --motion-fast as 120ms", () => {
		expect(INDEX_CSS).toMatch(/--motion-fast:\s*120ms/);
	});

	it("declares --motion-medium as 200ms", () => {
		expect(INDEX_CSS).toMatch(/--motion-medium:\s*200ms/);
	});

	it("declares --motion-slow as 320ms", () => {
		expect(INDEX_CSS).toMatch(/--motion-slow:\s*320ms/);
	});
});
