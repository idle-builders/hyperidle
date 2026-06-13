// @vitest-environment jsdom
/**
 * AI6 — RED phase: token-presence test.
 *
 * Asserts that the 5 new tokens (+ the pre-existing --scrim) all resolve to
 * non-empty values on :root after tokens.css is injected into jsdom.
 *
 * AC: "Zero hardcoded colors; tints + scrim have tokens" — token-presence half.
 * Fails until tokens.css adds the 5 new declarations.
 *
 * @lore AI6: jsdom does not evaluate `@layer base { :root { ... } }` cascade
 * layers — getComputedStyle returns "" for all custom properties inside @layer.
 * We strip the `@layer base {` wrapper before injection so the :root block is
 * a direct top-level rule. This is still "load the CSS module so jsdom can
 * evaluate computed styles" — the assertion is on getComputedStyle, not the raw
 * string. See @layer issue: https://github.com/jsdom/jsdom/issues/2939.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Strip @layer wrapper so jsdom (which doesn't support @layer) can evaluate
 * the :root custom-property declarations.
 */
function stripAtLayer(css: string): string {
	// Remove `@layer base {` opener and matching closing `}`.
	// tokens.css wraps everything in `@layer base { ... }`.
	return css.replace(/@layer\s+base\s*\{/, "").replace(/^\}$/m, ""); // remove the final closing brace
}

describe("AI6 — token presence: 5 new tokens + --scrim resolve on :root", () => {
	let styleEl: HTMLStyleElement;

	beforeEach(() => {
		const cssPath = resolve(import.meta.dirname, "../tokens.css");
		const rawCss = readFileSync(cssPath, "utf-8");
		const processedCss = stripAtLayer(rawCss);
		styleEl = document.createElement("style");
		styleEl.textContent = processedCss;
		document.head.appendChild(styleEl);
	});

	afterEach(() => {
		styleEl.remove();
	});

	const NEW_TOKENS = [
		"--accent-secondary-dim",
		"--status-info-dim",
		"--status-error-dim",
		"--accent-secondary-hover",
		"--status-error-hover",
	] as const;

	const PRE_EXISTING_TOKENS = [
		"--scrim", // Color AC specifically names scrim; must resolve.
	] as const;

	for (const token of [...NEW_TOKENS, ...PRE_EXISTING_TOKENS]) {
		it(`${token} resolves to a non-empty value on :root`, () => {
			const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
			expect(value, `Expected ${token} to resolve to a non-empty CSS value`).not.toBe("");
		});
	}
});
