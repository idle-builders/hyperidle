/**
 * Hearth Token System Tests — U3
 *
 * These tests define the expected state AFTER U3 implementation.
 * They FAIL against the current Lucid tokens (TDD red phase).
 *
 * @protected All token name sets and WCAG ratios in this file are frozen.
 *   Token name sets and WCAG ratios must not drift without plan-level approval.
 *
 * @lore U3 — status-warning (#d97706), status-error (#dc4a3a), and
 *   status-info (#2e7dba) in LIGHT MODE fail WCAG AA for normal text on
 *   warm surfaces (surface-page, surface-container). These tokens are
 *   intentionally decorative/icon-only in light mode — they are NEVER
 *   used as standalone text on warm surfaces. They are exempt from AA
 *   normal text contrast. Dark mode status tokens do pass AA on all surfaces.
 *
 * @lore U3 — dark mode --text-on-accent (#fff) on --accent-primary (#2eaa7a)
 *   achieves 2.94:1, below AA-Large (3:1). Dark mode buttons should use the
 *   light-mode accent value (#16764f) as background (5.62:1 with white),
 *   not the dark-mode --accent-primary which is optimized for text contrast
 *   on dark surfaces. U7 should add --accent-primary-bg for this purpose.
 *
 * @lore U3 — --leading-normal (1.55) is the base value in :root (shared).
 *   --leading-body is the density-overridable alias that each density tier
 *   sets to 1.55/1.5/1.6. Both tokens coexist intentionally.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DS_ROOT = resolve(__dirname, "../..");
const SRC_TOKENS = readFileSync(resolve(DS_ROOT, "src/tokens.css"), "utf-8");
const HTML_TOKENS = readFileSync(resolve(DS_ROOT, "html/_tokens.css"), "utf-8");

function extractCustomProperties(css: string): string[] {
	const matches = css.match(/--[\w-]+(?=\s*:)/g);
	return [...new Set(matches ?? [])].sort();
}

/** Parse a CSS block between two markers; returns the block content or empty string */
function extractThemeBlock(css: string, selector: string): string {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "s");
	const m = css.match(re);
	return m ? m[1] : "";
}

/** Extract all hex colors from a CSS string */
function extractHexColors(css: string): string[] {
	const matches = css.match(/#[0-9a-fA-F]{6}\b/g);
	return matches ?? [];
}

/** Extract a CSS variable's value from a CSS block by name */
function extractTokenValue(css: string, tokenName: string): string | null {
	const re = new RegExp(`${tokenName}\\s*:\\s*([^;]+);`);
	const m = css.match(re);
	return m ? m[1].trim() : null;
}

// ── WCAG contrast helpers ─────────────────────────────────────────────────────

/** Convert hex #RRGGBB to sRGB [0..1] triple */
function hexToSrgb(hex: string): [number, number, number] {
	const h = hex.replace("#", "");
	const r = Number.parseInt(h.substring(0, 2), 16) / 255;
	const g = Number.parseInt(h.substring(2, 4), 16) / 255;
	const b = Number.parseInt(h.substring(4, 6), 16) / 255;
	return [r, g, b];
}

/** Convert sRGB channel value to linear light */
function toLinear(c: number): number {
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance per WCAG 2.1 */
function relativeLuminance(hex: string): number {
	const [r, g, b] = hexToSrgb(hex);
	return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2.1 contrast ratio between two hex colors */
function contrastRatio(hex1: string, hex2: string): number {
	const l1 = relativeLuminance(hex1);
	const l2 = relativeLuminance(hex2);
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);
	return (lighter + 0.05) / (darker + 0.05);
}

// ── Parse px value from a CSS value string ───────────────────────────────────

function parsePx(value: string): number | null {
	const m = value.match(/^([\d.]+)px$/);
	return m ? Number.parseFloat(m[1]) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — src/tokens.css token name assertions
// ─────────────────────────────────────────────────────────────────────────────

describe("tokens.css (TSX source) — Hearth token names", () => {
	const props = extractCustomProperties(SRC_TOKENS);

	it("defines Hearth surface tokens (NOT Lucid surface-0..6)", () => {
		for (const token of [
			"--surface-page",
			"--surface-container",
			"--surface-elevated",
			"--surface-overlay",
		]) {
			expect(props, `expected Hearth token ${token}`).toContain(token);
		}
		// Old Lucid tokens must NOT exist
		for (const n of [0, 1, 2, 3, 4, 5, 6]) {
			expect(props, `Lucid token --surface-${n} must not exist in Hearth`).not.toContain(
				`--surface-${n}`,
			);
		}
		expect(props, "Lucid token --surface-ghost must not exist").not.toContain("--surface-ghost");
	});

	it("defines Hearth text tokens (NOT Lucid hi/mid/lo)", () => {
		for (const token of [
			"--text-primary",
			"--text-secondary",
			"--text-tertiary",
			"--text-placeholder",
			"--text-on-accent",
		]) {
			expect(props, `expected Hearth token ${token}`).toContain(token);
		}
		// Old Lucid tokens must NOT exist
		for (const old of ["--text-hi", "--text-mid", "--text-lo"]) {
			expect(props, `Lucid token ${old} must not exist in Hearth`).not.toContain(old);
		}
	});

	it("defines Hearth accent tokens (NOT Lucid --primary/--warn/--ok/--danger)", () => {
		for (const token of [
			"--accent-primary",
			"--accent-primary-dim",
			"--accent-primary-hover",
			"--accent-secondary",
		]) {
			expect(props, `expected Hearth token ${token}`).toContain(token);
		}
		for (const old of [
			"--primary",
			"--primary-dim",
			"--primary-hover",
			"--warn",
			"--ok",
			"--danger",
		]) {
			expect(props, `Lucid token ${old} must not exist in Hearth`).not.toContain(old);
		}
	});

	it("defines Hearth status tokens", () => {
		for (const token of [
			"--status-success",
			"--status-warning",
			"--status-error",
			"--status-info",
		]) {
			expect(props, `expected Hearth status token ${token}`).toContain(token);
		}
	});

	it("defines Hearth border color tokens", () => {
		for (const token of ["--border-subtle", "--border-default", "--border-strong"]) {
			expect(props, `expected Hearth border token ${token}`).toContain(token);
		}
		expect(props, "Lucid --border-emphasis must not exist").not.toContain("--border-emphasis");
	});

	it("defines Hearth shadow tokens (NOT Lucid --float)", () => {
		for (const token of ["--shadow-subtle", "--shadow-default", "--shadow-elevated"]) {
			expect(props, `expected Hearth shadow token ${token}`).toContain(token);
		}
		expect(props, "Lucid --float must not exist in Hearth").not.toContain("--float");
	});

	it("defines Hearth radius tokens (NOT Lucid r0/r1/r2/r3)", () => {
		for (const token of ["--r-none", "--r-subtle", "--r-default", "--r-pill"]) {
			expect(props, `expected Hearth radius token ${token}`).toContain(token);
		}
		for (const old of ["--r0", "--r1", "--r2", "--r3"]) {
			expect(props, `Lucid token ${old} must not exist in Hearth`).not.toContain(old);
		}
	});

	it("defines Hearth motion tokens (--motion-default NOT --motion-medium)", () => {
		for (const token of ["--motion-fast", "--motion-default", "--motion-slow", "--motion-ease"]) {
			expect(props, `expected Hearth motion token ${token}`).toContain(token);
		}
		expect(props, "Lucid --motion-medium must not exist in Hearth").not.toContain(
			"--motion-medium",
		);
	});

	it("defines Hearth typography font tokens (--font-sans/mono NOT --ui/--mono)", () => {
		for (const token of ["--font-sans", "--font-mono"]) {
			expect(props, `expected Hearth font token ${token}`).toContain(token);
		}
		for (const old of ["--ui"]) {
			expect(props, `Lucid token ${old} must not exist in Hearth`).not.toContain(old);
		}
	});

	it("defines Hearth typography size tokens (text-xs through text-3xl)", () => {
		for (const token of [
			"--text-xs",
			"--text-sm",
			"--text-base",
			"--text-lg",
			"--text-xl",
			"--text-2xl",
			"--text-3xl",
		]) {
			expect(props, `expected Hearth size token ${token}`).toContain(token);
		}
	});

	it("defines Hearth typography weight tokens (fw-normal/medium/semibold/bold)", () => {
		for (const token of ["--fw-normal", "--fw-medium", "--fw-semibold", "--fw-bold"]) {
			expect(props, `expected Hearth weight token ${token}`).toContain(token);
		}
		for (const old of ["--fw-regular", "--fw-emphasis"]) {
			expect(props, `Lucid token ${old} must not exist in Hearth`).not.toContain(old);
		}
	});

	it("defines Hearth typography line-height tokens", () => {
		for (const token of ["--leading-tight", "--leading-normal", "--leading-relaxed"]) {
			expect(props, `expected Hearth leading token ${token}`).toContain(token);
		}
		// Old Lucid tokens must not exist
		for (const old of ["--leading-heading", "--leading-heading-lg"]) {
			expect(props, `Lucid token ${old} must not exist`).not.toContain(old);
		}
	});

	it("defines Hearth spacing tokens (space-1 through space-16)", () => {
		for (const token of [
			"--space-1",
			"--space-2",
			"--space-3",
			"--space-4",
			"--space-6",
			"--space-8",
			"--space-12",
			"--space-16",
		]) {
			expect(props, `expected Hearth spacing token ${token}`).toContain(token);
		}
	});

	it("defines Hearth border width tokens (--bw-thin/default/strong)", () => {
		for (const token of ["--bw-thin", "--bw-default", "--bw-strong"]) {
			expect(props, `expected Hearth border width token ${token}`).toContain(token);
		}
	});

	it("defines Hearth density tokens", () => {
		for (const token of [
			"--density-pad-x",
			"--density-pad-y",
			"--density-gap",
			"--density-row-h",
			"--density-text",
			"--density-card-pad",
			"--density-page-gutter",
			"--density-icon-size",
			"--density-avatar-size",
			"--density-card-gap",
		]) {
			expect(props, `expected density token ${token}`).toContain(token);
		}
	});

	it("uses @layer base for Tailwind integration", () => {
		expect(SRC_TOKENS).toContain("@layer base");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Theme selector assertions
// ─────────────────────────────────────────────────────────────────────────────

describe("tokens.css — theme selectors", () => {
	it('defines hearth-light theme block with data-theme="hearth-light"', () => {
		expect(SRC_TOKENS).toContain('[data-theme="hearth-light"]');
	});

	it('defines hearth-dark theme block with data-theme="hearth-dark"', () => {
		expect(SRC_TOKENS).toContain('[data-theme="hearth-dark"]');
	});

	it("does NOT contain Lucid theme selectors", () => {
		expect(SRC_TOKENS).not.toContain('[data-theme="lucid-dark"]');
		expect(SRC_TOKENS).not.toContain('[data-theme="lucid-light"]');
	});

	it("uses prefers-color-scheme: dark media query (NOT light — Hearth is light-first)", () => {
		expect(SRC_TOKENS).toContain("@media (prefers-color-scheme: dark)");
		// The old Lucid pattern (dark-default, override for light) must not exist
		expect(SRC_TOKENS).not.toContain("@media (prefers-color-scheme: light)");
	});

	it("has :root default pointing to light mode (color-scheme: light in :root block)", () => {
		// The :root,[data-theme="hearth-light"] block must contain color-scheme: light
		// This verifies Hearth is light-first (opposite of Lucid's dark-default)
		const _lightBlock = extractThemeBlock(SRC_TOKENS, ':root,\\s*\\[data-theme="hearth-light"\\]');
		// If block extraction fails, fall back to checking that color-scheme: light appears before color-scheme: dark
		const lightIdx = SRC_TOKENS.indexOf("color-scheme: light");
		const darkIdx = SRC_TOKENS.indexOf("color-scheme: dark");
		expect(
			lightIdx,
			"color-scheme: light must appear (and before dark) — Hearth is light-first",
		).toBeGreaterThan(-1);
		expect(
			lightIdx,
			"color-scheme: light must appear before color-scheme: dark (light-first default)",
		).toBeLessThan(darkIdx);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Token value assertions
// ─────────────────────────────────────────────────────────────────────────────

describe("tokens.css — light mode token values", () => {
	it("--surface-page is #f5f0e6 in hearth-light", () => {
		const val = extractTokenValue(SRC_TOKENS, "--surface-page");
		expect(val, "--surface-page must be #f5f0e6").toBe("#f5f0e6");
	});

	it("--surface-container is #ede7db in hearth-light", () => {
		const val = extractTokenValue(SRC_TOKENS, "--surface-container");
		expect(val, "--surface-container must be #ede7db").toBe("#ede7db");
	});

	it("--surface-elevated is #ffffff in hearth-light", () => {
		const val = extractTokenValue(SRC_TOKENS, "--surface-elevated");
		expect(val, "--surface-elevated must be #ffffff").toBe("#ffffff");
	});

	it("--surface-overlay is #ffffff in hearth-light", () => {
		const val = extractTokenValue(SRC_TOKENS, "--surface-overlay");
		expect(val, "--surface-overlay must be #ffffff").toBe("#ffffff");
	});

	it("--text-primary is #2c241a in hearth-light", () => {
		const val = extractTokenValue(SRC_TOKENS, "--text-primary");
		expect(val, "--text-primary must be #2c241a").toBe("#2c241a");
	});

	it("--accent-primary is #16764f in hearth-light", () => {
		const val = extractTokenValue(SRC_TOKENS, "--accent-primary");
		expect(val, "--accent-primary must be #16764f").toBe("#16764f");
	});

	it("--accent-secondary is #d97706 in hearth-light", () => {
		const val = extractTokenValue(SRC_TOKENS, "--accent-secondary");
		expect(val, "--accent-secondary must be #d97706").toBe("#d97706");
	});

	it("--r-none is 0 in shared tokens", () => {
		const val = extractTokenValue(SRC_TOKENS, "--r-none");
		expect(val, "--r-none must be 0").toBe("0");
	});

	it("--r-subtle is 10px in shared tokens", () => {
		const val = extractTokenValue(SRC_TOKENS, "--r-subtle");
		expect(val, "--r-subtle must be 10px").toBe("10px");
	});

	it("--r-default is 16px in shared tokens", () => {
		const val = extractTokenValue(SRC_TOKENS, "--r-default");
		expect(val, "--r-default must be 16px").toBe("16px");
	});

	it("--r-pill is 9999px in shared tokens", () => {
		const val = extractTokenValue(SRC_TOKENS, "--r-pill");
		expect(val, "--r-pill must be 9999px").toBe("9999px");
	});

	it("--motion-fast is 120ms in shared tokens", () => {
		const val = extractTokenValue(SRC_TOKENS, "--motion-fast");
		expect(val, "--motion-fast must be 120ms").toBe("120ms");
	});

	it("--motion-default is 240ms in shared tokens", () => {
		const val = extractTokenValue(SRC_TOKENS, "--motion-default");
		expect(val, "--motion-default must be 240ms").toBe("240ms");
	});

	it("--motion-slow is 450ms in shared tokens", () => {
		const val = extractTokenValue(SRC_TOKENS, "--motion-slow");
		expect(val, "--motion-slow must be 450ms").toBe("450ms");
	});
});

describe("tokens.css — dark mode token values (from hearth-dark block)", () => {
	// We find the hearth-dark block for more targeted parsing
	it("--surface-page is #1a1510 in hearth-dark", () => {
		// Get the index of hearth-dark selector
		const darkIdx = SRC_TOKENS.indexOf('[data-theme="hearth-dark"]');
		expect(darkIdx, "hearth-dark selector must exist").toBeGreaterThan(-1);
		// Extract substring starting from hearth-dark
		const darkSection = SRC_TOKENS.substring(darkIdx);
		const val = extractTokenValue(darkSection, "--surface-page");
		expect(val, "--surface-page must be #1a1510 in dark mode").toBe("#1a1510");
	});

	it("--text-primary is #ede5d8 in hearth-dark", () => {
		const darkIdx = SRC_TOKENS.indexOf('[data-theme="hearth-dark"]');
		const darkSection = SRC_TOKENS.substring(darkIdx);
		const val = extractTokenValue(darkSection, "--text-primary");
		expect(val, "--text-primary must be #ede5d8 in dark mode").toBe("#ede5d8");
	});

	it("--accent-primary is #2eaa7a in hearth-dark", () => {
		const darkIdx = SRC_TOKENS.indexOf('[data-theme="hearth-dark"]');
		const darkSection = SRC_TOKENS.substring(darkIdx);
		const val = extractTokenValue(darkSection, "--accent-primary");
		expect(val, "--accent-primary must be #2eaa7a in dark mode").toBe("#2eaa7a");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — WCAG contrast tests
// ─────────────────────────────────────────────────────────────────────────────

describe("tokens.css — WCAG contrast (dark mode text tokens)", () => {
	// Dark mode values from architecture section 4.3
	const darkSurfaces = {
		page: "#1a1510",
		elevated: "#2c261c",
	};
	const darkText = {
		primary: "#ede5d8",
		secondary: "#a89880",
		tertiary: "#9a8e7e",
	};

	it("--text-primary on --surface-page (dark) >= 4.5:1", () => {
		const ratio = contrastRatio(darkText.primary, darkSurfaces.page);
		expect(
			ratio,
			`--text-primary (${darkText.primary}) on --surface-page (${darkSurfaces.page}): ${ratio.toFixed(2)}:1 must be >= 4.5:1`,
		).toBeGreaterThanOrEqual(4.5);
	});

	it("--text-primary on --surface-elevated (dark) >= 4.5:1", () => {
		const ratio = contrastRatio(darkText.primary, darkSurfaces.elevated);
		expect(
			ratio,
			`--text-primary (${darkText.primary}) on --surface-elevated (${darkSurfaces.elevated}): ${ratio.toFixed(2)}:1 must be >= 4.5:1`,
		).toBeGreaterThanOrEqual(4.5);
	});

	it("--text-secondary on --surface-page (dark) >= 4.5:1", () => {
		const ratio = contrastRatio(darkText.secondary, darkSurfaces.page);
		expect(
			ratio,
			`--text-secondary (${darkText.secondary}) on --surface-page (${darkSurfaces.page}): ${ratio.toFixed(2)}:1 must be >= 4.5:1`,
		).toBeGreaterThanOrEqual(4.5);
	});

	it("--text-secondary on --surface-elevated (dark) >= 4.5:1", () => {
		const ratio = contrastRatio(darkText.secondary, darkSurfaces.elevated);
		expect(
			ratio,
			`--text-secondary (${darkText.secondary}) on --surface-elevated (${darkSurfaces.elevated}): ${ratio.toFixed(2)}:1 must be >= 4.5:1`,
		).toBeGreaterThanOrEqual(4.5);
	});

	it("--text-tertiary on --surface-page (dark) >= 4.5:1", () => {
		const ratio = contrastRatio(darkText.tertiary, darkSurfaces.page);
		expect(
			ratio,
			`--text-tertiary (${darkText.tertiary}) on --surface-page (${darkSurfaces.page}): ${ratio.toFixed(2)}:1 must be >= 4.5:1`,
		).toBeGreaterThanOrEqual(4.5);
	});

	it("--text-tertiary on --surface-elevated (dark) >= 4.5:1", () => {
		const ratio = contrastRatio(darkText.tertiary, darkSurfaces.elevated);
		expect(
			ratio,
			`--text-tertiary (${darkText.tertiary}) on --surface-elevated (${darkSurfaces.elevated}): ${ratio.toFixed(2)}:1 must be >= 4.5:1`,
		).toBeGreaterThanOrEqual(4.5);
	});
});

describe("tokens.css — WCAG contrast (light mode text-on-accent)", () => {
	// Light mode: text-on-accent (#ffffff) on accent-primary (#16764f)
	it("--text-on-accent (#ffffff) on --accent-primary light (#16764f) >= 4.5:1", () => {
		const ratio = contrastRatio("#ffffff", "#16764f");
		expect(
			ratio,
			`--text-on-accent (#ffffff) on --accent-primary (#16764f): ${ratio.toFixed(2)}:1 must be >= 4.5:1`,
		).toBeGreaterThanOrEqual(4.5);
	});
});

// Status tokens in light mode are EXEMPT from contrast tests:
// status-warning, status-error, status-info on light warm surfaces fail AA.
// These are icon/badge/decorative-only in light mode — never standalone text.
// See @lore comment at top of file. No tests added here for those pairs.

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — No cool grays detection
// ─────────────────────────────────────────────────────────────────────────────

describe("tokens.css — no cool grays in Hearth theme blocks", () => {
	/**
	 * Heuristic: a color is "cool-tinted" if its blue channel exceeds its red
	 * channel by more than 20 units. This catches neutral grays like #e8e8f0
	 * (B=240 > R=232+20=252 → passes... actually fails only if B > R+20).
	 * Example of a cool gray: #e8e8f0 → R=232, B=240 → B > R+20 = 252? No.
	 * Better example: #d0d0e0 → R=208, B=224 → B=224 > R+20=228? No.
	 * Try #c0c0d8 → R=192, B=216 → B=216 > R+20=212? Yes → cool-tinted.
	 *
	 * @lore The heuristic (B <= R + 20) is a smoke test, not a proof.
	 *   It works for the current Hearth palette. For high-lightness colors
	 *   like --text-primary dark (#ede5d8) R=237, B=216, the check passes
	 *   because B=216 << R+20=257. Near-white warm colors with small channel
	 *   differences still pass.
	 */
	function isCoolTinted(hex: string): boolean {
		const h = hex.replace("#", "");
		const r = Number.parseInt(h.substring(0, 2), 16);
		const g = Number.parseInt(h.substring(2, 4), 16);
		const b = Number.parseInt(h.substring(4, 6), 16);
		// Only flag near-neutral colors (where R and G are close) as potentially cool
		// to avoid flagging status-info (#2e7dba) which is intentionally blue
		const isNearNeutral = Math.abs(r - g) < 30 && Math.abs(g - b) < 30;
		return isNearNeutral && b > r + 20;
	}

	it("no cool-tinted hex colors in hearth-light block", () => {
		const lightIdx = SRC_TOKENS.indexOf('[data-theme="hearth-light"]');
		expect(lightIdx, "hearth-light selector must exist").toBeGreaterThan(-1);
		// Find the end of the hearth-light block
		const afterLight = SRC_TOKENS.indexOf("[data-theme=", lightIdx + 1);
		const lightBlock = SRC_TOKENS.substring(
			lightIdx,
			afterLight > lightIdx ? afterLight : undefined,
		);

		const hexColors = extractHexColors(lightBlock);
		const coolColors = hexColors.filter(isCoolTinted);
		expect(
			coolColors,
			`Found cool-tinted hex colors in hearth-light: ${coolColors.join(", ")} — Hearth uses warm earth tones only`,
		).toEqual([]);
	});

	it("no cool-tinted hex colors in hearth-dark block", () => {
		const darkIdx = SRC_TOKENS.indexOf('[data-theme="hearth-dark"]');
		expect(darkIdx, "hearth-dark selector must exist").toBeGreaterThan(-1);
		// Find end of hearth-dark block by finding next major block after it
		const mediaIdx = SRC_TOKENS.indexOf("@media (prefers-color-scheme:", darkIdx);
		const darkBlock = SRC_TOKENS.substring(darkIdx, mediaIdx > darkIdx ? mediaIdx : undefined);

		const hexColors = extractHexColors(darkBlock);
		const coolColors = hexColors.filter(isCoolTinted);
		expect(
			coolColors,
			`Found cool-tinted hex colors in hearth-dark: ${coolColors.join(", ")} — Hearth uses warm earth tones only`,
		).toEqual([]);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Spacing grid compliance
// ─────────────────────────────────────────────────────────────────────────────

describe("tokens.css — spacing tokens on 3px half-grid", () => {
	/**
	 * Architecture section 4.1 specifies a 6px grid.
	 * All --space-* values must be multiples of 3px (half the grid unit).
	 * Values: space-1=3, space-2=6, space-3=9, space-4=12, space-6=18,
	 *         space-8=24, space-12=36, space-16=48
	 */
	const expectedSpacing: Record<string, number> = {
		"--space-1": 3,
		"--space-2": 6,
		"--space-3": 9,
		"--space-4": 12,
		"--space-6": 18,
		"--space-8": 24,
		"--space-12": 36,
		"--space-16": 48,
	};

	for (const [token, expectedPx] of Object.entries(expectedSpacing)) {
		it(`${token} is ${expectedPx}px (multiple of 3)`, () => {
			const val = extractTokenValue(SRC_TOKENS, token);
			expect(val, `${token} must be defined`).not.toBeNull();
			const px = parsePx(val ?? "");
			expect(px, `${token} must have a px value`).not.toBeNull();
			expect((px as number) % 3, `${token} (${px}px) must be a multiple of 3px`).toBe(0);
			expect(px, `${token} must equal ${expectedPx}px`).toBe(expectedPx);
		});
	}
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — Density grid compliance
// ─────────────────────────────────────────────────────────────────────────────

describe("tokens.css — density tokens (K9/K11 spec)", () => {
	/**
	 * Density values are owned by K9 and K11 workpackages. U3 (Hearth) only
	 * changes colour tokens — density values must match K9/K11 spec exactly.
	 *
	 * @lore U3 — an earlier draft of U3 rebuilt density on a 6px grid, but
	 * density-tier.test.ts (K9) and the K11 spec pin exact px values that are
	 * not all 6px-grid multiples (row-h=44, text=15, page-gutter=16, etc.).
	 * The 6px-grid lore was reverted to preserve K9/K11 AC compliance. Any
	 * density-grid redesign must go through a K9/K11 update first.
	 */

	const defaultDensity: Record<string, number> = {
		"--density-pad-x": 16,
		"--density-pad-y": 12,
		"--density-gap": 12,
		"--density-row-h": 44,
		"--density-card-pad": 12,
		"--density-page-gutter": 16,
		"--density-icon-size": 16,
		"--density-avatar-size": 32,
		"--density-card-gap": 8,
	};

	it("default density values are correct px values (K9/K11 spec)", () => {
		// The :root,[data-density="default"] block must have K9/K11 spec values.
		for (const [token, expectedPx] of Object.entries(defaultDensity)) {
			const val = extractTokenValue(SRC_TOKENS, token);
			expect(val, `${token} must be defined`).not.toBeNull();
			// Verify it contains a px value
			const px = parsePx(val ?? "");
			expect(
				px,
				`${token} must have a px value — got: ${val}`,
			).not.toBeNull();
			expect(px, `${token} must equal ${expectedPx}px (K9/K11 spec)`).toBe(expectedPx);
		}
	});

	it("--density-row-h default is 44px (AQ-015 touch-target floor)", () => {
		// K9 requires default row-h >= 44px for AQ-015 touch-target compliance.
		const val = extractTokenValue(SRC_TOKENS, "--density-row-h");
		expect(val, "--density-row-h must be defined").not.toBeNull();
		expect(val, "--density-row-h must be 44px").toBe("44px");
	});

	it("compact density --density-card-gap is 4px (K11 spec)", () => {
		// K11 spec: compact card-gap = 4px (within 0.5× of default 8px).
		const compactIdx = SRC_TOKENS.indexOf('[data-density="compact"]');
		expect(compactIdx, "compact density block must exist").toBeGreaterThan(-1);
		const compactBlock = SRC_TOKENS.substring(compactIdx);
		const val = extractTokenValue(compactBlock, "--density-card-gap");
		expect(val, "--density-card-gap in compact must be defined").not.toBeNull();
		expect(val, "--density-card-gap in compact must be 4px").toBe("4px");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — html/_tokens.css (HTML components) — Hearth tokens
// ─────────────────────────────────────────────────────────────────────────────

describe("_tokens.css (HTML components) — Hearth tokens", () => {
	const htmlProps = extractCustomProperties(HTML_TOKENS);

	it("defines the same core Hearth tokens as src/tokens.css", () => {
		const required = [
			"--surface-page",
			"--surface-container",
			"--surface-elevated",
			"--surface-overlay",
			"--text-primary",
			"--text-secondary",
			"--text-tertiary",
			"--text-placeholder",
			"--text-on-accent",
			"--accent-primary",
			"--accent-primary-dim",
			"--accent-primary-hover",
			"--accent-secondary",
			"--status-success",
			"--status-warning",
			"--status-error",
			"--status-info",
			"--border-subtle",
			"--border-default",
			"--border-strong",
			"--shadow-subtle",
			"--shadow-default",
			"--shadow-elevated",
			"--r-none",
			"--r-subtle",
			"--r-default",
			"--r-pill",
			"--motion-fast",
			"--motion-default",
			"--motion-slow",
			"--font-sans",
			"--font-mono",
			"--space-1",
			"--space-2",
			"--space-4",
			"--space-8",
			"--bw-thin",
			"--bw-default",
			"--bw-strong",
		];
		const missing = required.filter((t) => !htmlProps.includes(t));
		expect(missing, `HTML _tokens.css is missing Hearth tokens: ${missing.join(", ")}`).toEqual([]);
	});

	it("does NOT contain Google Fonts import for Geist (system-ui only in Hearth)", () => {
		// Hearth uses system-ui, no external font import needed
		expect(HTML_TOKENS).not.toContain("fonts.googleapis.com");
		expect(HTML_TOKENS).not.toContain("Geist");
	});

	it("defines hearth-light theme block", () => {
		expect(HTML_TOKENS).toContain('[data-theme="hearth-light"]');
	});

	it("defines hearth-dark theme block", () => {
		expect(HTML_TOKENS).toContain('[data-theme="hearth-dark"]');
	});

	it("does NOT contain Lucid theme blocks", () => {
		expect(HTML_TOKENS).not.toContain('[data-theme="lucid-dark"]');
		expect(HTML_TOKENS).not.toContain('[data-theme="lucid-light"]');
	});

	it("uses prefers-color-scheme: dark media query (NOT light)", () => {
		expect(HTML_TOKENS).toContain("@media (prefers-color-scheme: dark)");
		expect(HTML_TOKENS).not.toContain("@media (prefers-color-scheme: light)");
	});

	it("sets body background to --surface-page (NOT --surface-0)", () => {
		expect(HTML_TOKENS).toContain("background: var(--surface-page)");
		expect(HTML_TOKENS).not.toContain("background: var(--surface-0)");
	});

	it("includes box-sizing reset", () => {
		expect(HTML_TOKENS).toContain("box-sizing: border-box");
	});

	it("includes demo layout classes", () => {
		expect(HTML_TOKENS).toContain(".demo-grid");
		expect(HTML_TOKENS).toContain(".demo-section");
		expect(HTML_TOKENS).toContain(".demo-section-title");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 — Token sync: src/tokens.css ↔ html/_tokens.css
// ─────────────────────────────────────────────────────────────────────────────

describe("token sync: src/tokens.css ↔ html/_tokens.css", () => {
	const htmlProps = extractCustomProperties(HTML_TOKENS);

	it("every core Hearth token in src/tokens.css exists in html/_tokens.css", () => {
		const required = [
			"--surface-page",
			"--surface-container",
			"--surface-elevated",
			"--surface-overlay",
			"--text-primary",
			"--text-secondary",
			"--text-tertiary",
			"--text-placeholder",
			"--text-on-accent",
			"--accent-primary",
			"--accent-primary-dim",
			"--accent-primary-hover",
			"--accent-secondary",
			"--status-success",
			"--status-warning",
			"--status-error",
			"--status-info",
			"--border-subtle",
			"--border-default",
			"--border-strong",
			"--shadow-subtle",
			"--shadow-default",
			"--shadow-elevated",
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
		const missing = required.filter((t) => !htmlProps.includes(t));
		expect(
			missing,
			`html/_tokens.css missing required Hearth tokens: ${missing.join(", ")}`,
		).toEqual([]);
	});
});
