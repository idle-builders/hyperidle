/**
 * J8 — motion tokens live in tokens.css as three CSS custom properties:
 * --motion-fast (120ms), --motion-default (240ms), --motion-slow (450ms).
 *
 * U3: Hearth values are gentler than Lucid (80/150/250ms → 120/240/450ms).
 * --motion-medium renamed to --motion-default.
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

	it("declares --motion-default as 240ms", () => {
		expect(INDEX_CSS).toMatch(/--motion-default:\s*240ms/);
	});

	it("declares --motion-slow as 450ms", () => {
		expect(INDEX_CSS).toMatch(/--motion-slow:\s*450ms/);
	});
});
