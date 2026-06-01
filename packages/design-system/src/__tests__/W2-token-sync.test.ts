/**
 * W2 — Token sync tests.
 *
 * AC-2: _tokens.css synced to tokens.css — zero drift.
 *       Every CSS custom property in _tokens.css must have a matching
 *       name+value entry in tokens.css (shared :root section).
 * AC-3: --easing-expressive token added to both files.
 * AC-3: --tracking-caps is 0.08em in both files.
 * AC-3: --tracking-caps-sm exists in both files (0.06em).
 * AC-3: --leading-body exists in tokens.css :root block.
 * AC-3: --card-max-h exists in tokens.css :root block.
 *
 * These tests FAIL in the red phase because:
 * - _tokens.css has --tracking-caps: 0.02em (wrong, should be 0.08em)
 * - _tokens.css is missing --tracking-caps-sm
 * - tokens.css and _tokens.css are missing --easing-expressive
 * - tokens.css has --leading-body and --card-max-h inside density blocks,
 *   not in :root shared section
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DS_ROOT = resolve(__dirname, "../..");
const SRC_TOKENS = readFileSync(resolve(DS_ROOT, "src/tokens.css"), "utf-8");
const HTML_TOKENS = readFileSync(resolve(DS_ROOT, "html/_tokens.css"), "utf-8");

/** Extract all CSS custom property name→value pairs from the :root block only. */
function extractRootTokens(css: string): Map<string, string> {
	// Match the :root { ... } block (the first one, shared tokens)
	// We need the shared :root block, not the per-theme one.
	// In tokens.css: "@layer base { :root { ... }"
	// In _tokens.css: ":root { ... }" at top
	const rootRe = /:root\s*\{([^}]*)\}/s;
	const m = css.match(rootRe);
	if (!m) return new Map();

	const body = m[1];
	const result = new Map<string, string>();
	const propRe = /--([\w-]+)\s*:\s*([^;]+);/g;
	let pm: RegExpExecArray | null = propRe.exec(body);
	while (pm) {
		result.set(`--${pm[1]}`, pm[2].trim());
		pm = propRe.exec(body);
	}
	return result;
}

/** Extract a specific token value from the global CSS (first occurrence). */
function extractTokenValue(css: string, tokenName: string): string | null {
	const re = new RegExp(`${tokenName}\\s*:\\s*([^;]+);`);
	const m = css.match(re);
	return m ? m[1].trim() : null;
}

/** Extract all CSS custom property names from the full file. */
function extractCustomPropertyNames(css: string): string[] {
	const matches = css.match(/--[\w-]+(?=\s*:)/g);
	return [...new Set(matches ?? [])].sort();
}

// ── AC-2: Token name presence sync ──────────────────────────────────────────

describe("W2 AC-2 — _tokens.css ↔ tokens.css shared token name sync", () => {
	// These shared tokens must exist in both files with identical values.
	// _tokens.css is the HTML reference; tokens.css must match.
	const SHARED_TOKENS = [
		"--r-none",
		"--r-subtle",
		"--r-default",
		"--r-pill",
		"--motion-fast",
		"--motion-default",
		"--motion-slow",
		"--motion-ease",
		"--font-sans",
		"--font-mono",
		"--text-xs",
		"--text-sm",
		"--text-base",
		"--text-lg",
		"--text-xl",
		"--text-2xl",
		"--text-3xl",
		"--fw-normal",
		"--fw-medium",
		"--fw-semibold",
		"--fw-bold",
		"--leading-tight",
		"--leading-normal",
		"--leading-relaxed",
		"--tracking-caps",
		"--tracking-caps-sm",
		"--space-1",
		"--space-2",
		"--space-3",
		"--space-4",
		"--space-6",
		"--space-8",
		"--space-12",
		"--space-16",
		"--bw-thin",
		"--bw-default",
		"--bw-strong",
	];

	for (const token of SHARED_TOKENS) {
		it(`${token} exists in both _tokens.css and tokens.css`, () => {
			const htmlNames = extractCustomPropertyNames(HTML_TOKENS);
			const srcNames = extractCustomPropertyNames(SRC_TOKENS);
			expect(htmlNames, `${token} missing from html/_tokens.css`).toContain(token);
			expect(srcNames, `${token} missing from src/tokens.css`).toContain(token);
		});
	}
});

// ── AC-2: Token value sync — critical tokens must match exactly ──────────────

describe("W2 AC-2 — shared token values must match between files", () => {
	const SYNCED_VALUES: Array<{ token: string; expected: string }> = [
		{ token: "--tracking-caps", expected: "0.08em" },
		{ token: "--tracking-caps-sm", expected: "0.06em" },
		{ token: "--r-none", expected: "0" },
		{ token: "--r-subtle", expected: "10px" },
		{ token: "--r-default", expected: "16px" },
		{ token: "--r-pill", expected: "9999px" },
		{ token: "--motion-fast", expected: "120ms" },
		{ token: "--motion-default", expected: "240ms" },
		{ token: "--motion-slow", expected: "450ms" },
		{ token: "--space-1", expected: "3px" },
		{ token: "--space-2", expected: "6px" },
		{ token: "--space-4", expected: "12px" },
		{ token: "--space-8", expected: "24px" },
	];

	for (const { token, expected } of SYNCED_VALUES) {
		it(`${token} is "${expected}" in both _tokens.css and tokens.css`, () => {
			const htmlVal = extractTokenValue(HTML_TOKENS, token);
			const srcVal = extractTokenValue(SRC_TOKENS, token);
			expect(
				htmlVal,
				`${token} in html/_tokens.css: expected "${expected}", got "${htmlVal}"`,
			).toBe(expected);
			expect(srcVal, `${token} in src/tokens.css: expected "${expected}", got "${srcVal}"`).toBe(
				expected,
			);
		});
	}
});

// ── AC-3: --easing-expressive token ─────────────────────────────────────────

describe("W2 AC-3 — --easing-expressive token", () => {
	const EASING_VALUE = "cubic-bezier(0.34, 1.56, 0.64, 1)";

	it("--easing-expressive exists in src/tokens.css", () => {
		const names = extractCustomPropertyNames(SRC_TOKENS);
		expect(names, "--easing-expressive must be in tokens.css").toContain("--easing-expressive");
	});

	it("--easing-expressive exists in html/_tokens.css", () => {
		const names = extractCustomPropertyNames(HTML_TOKENS);
		expect(names, "--easing-expressive must be in html/_tokens.css").toContain(
			"--easing-expressive",
		);
	});

	it(`--easing-expressive is "${EASING_VALUE}" in tokens.css`, () => {
		const val = extractTokenValue(SRC_TOKENS, "--easing-expressive");
		expect(val, `--easing-expressive must be "${EASING_VALUE}"`).toBe(EASING_VALUE);
	});

	it(`--easing-expressive is "${EASING_VALUE}" in _tokens.css`, () => {
		const val = extractTokenValue(HTML_TOKENS, "--easing-expressive");
		expect(val, `--easing-expressive must be "${EASING_VALUE}"`).toBe(EASING_VALUE);
	});
});

// ── AC-3: --leading-body must be in :root (shared) not only density blocks ──

describe("W2 AC-3 — --leading-body in :root shared section of tokens.css", () => {
	it("--leading-body: 1.55 is in the :root section (not only inside density blocks)", () => {
		const rootTokens = extractRootTokens(SRC_TOKENS);
		// After density strip, --leading-body must live in the shared :root
		expect(
			rootTokens.has("--leading-body"),
			"--leading-body must be in the :root block (not only inside [data-density] blocks)",
		).toBe(true);
		expect(rootTokens.get("--leading-body")).toBe("1.55");
	});
});

// ── AC-3: --card-max-h must be in :root (shared) after density strip ─────────

describe("W2 AC-3 — --card-max-h in :root shared section of tokens.css", () => {
	it("--card-max-h: 70vh is in the :root section (not only inside density blocks)", () => {
		const rootTokens = extractRootTokens(SRC_TOKENS);
		expect(
			rootTokens.has("--card-max-h"),
			"--card-max-h must be in the :root block after density strip",
		).toBe(true);
		expect(rootTokens.get("--card-max-h")).toBe("70vh");
	});
});

// ── AC-1: No density blocks in tokens.css ────────────────────────────────────

describe("W2 AC-1 — density blocks removed from tokens.css", () => {
	it('tokens.css contains no [data-density="compact"] block', () => {
		expect(SRC_TOKENS).not.toContain('[data-density="compact"]');
	});

	it('tokens.css contains no [data-density="comfortable"] block', () => {
		expect(SRC_TOKENS).not.toContain('[data-density="comfortable"]');
	});

	it('tokens.css contains no [data-density="default"] block', () => {
		expect(SRC_TOKENS).not.toContain('[data-density="default"]');
	});

	it("tokens.css contains no --density- custom properties", () => {
		// After density strip, no --density-* tokens should remain in tokens.css
		const hasAnyDensityToken = /--density-/.test(SRC_TOKENS);
		expect(
			hasAnyDensityToken,
			"tokens.css must not contain any --density-* tokens after W2 strip",
		).toBe(false);
	});
});

// ── AC-1: No density tokens in _tokens.css ────────────────────────────────────

describe("W2 AC-1 — density tokens removed from html/_tokens.css", () => {
	it("_tokens.css contains no --density- custom properties in :root", () => {
		const hasAnyDensityToken = /--density-/.test(HTML_TOKENS);
		expect(
			hasAnyDensityToken,
			"html/_tokens.css must not contain --density-* tokens after W2 strip",
		).toBe(false);
	});
});
