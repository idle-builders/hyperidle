/**
 * K9 — Density tier ladder coherence + heading-scale tokens.
 *
 * Parses `packages/design-system/src/tokens.css` and asserts the new K9 ratio
 * holds for the three density tiers:
 *
 *   compact ≈ default × 0.75   (within 4 px tolerance)
 *   comfortable ≈ default × 1.5 (within 4 px tolerance)
 *
 * For `pad-x`, `pad-y`, `gap`. The `row-h` token is exempt from the upper
 * bound — comfortable's 56 px is a designer call (>= AQ-015's 44 px floor),
 * not the strict 1.5× ratio result (44 × 1.5 = 66 → 64). The lower bound on
 * row-h still holds (compact 32 px ≈ default 44 px × 0.75 = 33 within 4 px).
 *
 * Body text progresses 14 → 15 → 16. The new heading-scale density tokens
 * (`--density-text-h1`, `--density-text-h2`) progress 24 → 26 → 28 and
 * 18 → 20 → 22 respectively.
 *
 * @lore Each gate maps 1:1 to a K9 acceptance criterion in
 *   `docs/work-packages/TRACK-K.md` story K9 ("`tokens.css` density tier
 *   values" + "AQ-003 ratio enforcement"). The 4 px tolerance on the ratio
 *   matches the AESTHETICS.md § Spacing & Density "Density tier ratio" lint
 *   hint ("each value equals default × 0.75 ±2 px") rounded up to the 4 px
 *   grid step the K9 tier deltas were quantised to.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DS_ROOT = resolve(__dirname, "../..");
const SRC_TOKENS = readFileSync(resolve(DS_ROOT, "src/tokens.css"), "utf-8");

type DensityBlock = Record<string, number>;

const REM_PX = 16;
const TOLERANCE_PX = 4;

function remToPx(value: string): number {
	const trimmed = value.trim();
	const m = trimmed.match(/^([\d.]+)(rem|px)?$/);
	if (!m) throw new Error(`Cannot parse length: "${value}"`);
	const n = Number.parseFloat(m[1]);
	if (m[2] === "rem" || !m[2]) return n * REM_PX;
	return n;
}

/**
 * Extract a single `[data-density="..."]` (or `:root` fallback) block from
 * tokens.css and return its custom properties as a {name → px} map. The
 * `default` block is the `:root, [data-density="default"]` group, so the
 * selector matcher accepts either form.
 */
function extractDensityBlock(css: string, selector: string): DensityBlock {
	// Build a flexible regex: match a selector list that contains the wanted
	// selector (possibly preceded/followed by other selectors like `:root`),
	// then the body up to the next `}` at column zero of the block.
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(`(?:[^{}]*?,\\s*)?${escaped}(?:\\s*,\\s*[^{}]*?)?\\s*\\{([^}]*)\\}`, "m");
	const m = css.match(re);
	if (!m) throw new Error(`Cannot find density block "${selector}" in tokens.css`);
	const body = m[1];
	const props: DensityBlock = {};
	const propRe = /--([\w-]+)\s*:\s*([^;]+);/g;
	let pm: RegExpExecArray | null = propRe.exec(body);
	while (pm) {
		const [, name, value] = pm;
		// Only numeric length values; skip line-height (1.55) etc by trying parse.
		try {
			props[`--${name}`] = remToPx(value);
		} catch {
			// non-length value — keep raw string in a separate map if needed.
		}
		pm = propRe.exec(body);
	}
	return props;
}

describe("K9 density tier ladder", () => {
	const compact = extractDensityBlock(SRC_TOKENS, '[data-density="compact"]');
	const def = extractDensityBlock(SRC_TOKENS, '[data-density="default"]');
	const comfy = extractDensityBlock(SRC_TOKENS, '[data-density="comfortable"]');

	it("defines the five density spacing tokens in every tier", () => {
		const required = [
			"--density-pad-x",
			"--density-pad-y",
			"--density-gap",
			"--density-row-h",
			"--density-text",
		];
		for (const name of required) {
			expect(compact, `compact.${name}`).toHaveProperty(name);
			expect(def, `default.${name}`).toHaveProperty(name);
			expect(comfy, `comfortable.${name}`).toHaveProperty(name);
		}
	});

	it("compact ≈ default × 0.75 within 4 px on pad-x / pad-y / gap", () => {
		for (const token of ["--density-pad-x", "--density-pad-y", "--density-gap"]) {
			const expected = def[token] * 0.75;
			const actual = compact[token];
			expect(
				Math.abs(actual - expected),
				`${token}: compact=${actual}, default=${def[token]}, want ≈ ${expected} (±${TOLERANCE_PX})`,
			).toBeLessThanOrEqual(TOLERANCE_PX);
		}
	});

	it("comfortable ≈ default × 1.5 within 4 px on pad-x / pad-y / gap", () => {
		for (const token of ["--density-pad-x", "--density-pad-y", "--density-gap"]) {
			const expected = def[token] * 1.5;
			const actual = comfy[token];
			expect(
				Math.abs(actual - expected),
				`${token}: comfortable=${actual}, default=${def[token]}, want ≈ ${expected} (±${TOLERANCE_PX})`,
			).toBeLessThanOrEqual(TOLERANCE_PX);
		}
	});

	it("row-h: compact ≈ default × 0.75 within 4 px (lower bound)", () => {
		const expected = def["--density-row-h"] * 0.75;
		const actual = compact["--density-row-h"];
		expect(
			Math.abs(actual - expected),
			`row-h compact=${actual}, default=${def["--density-row-h"]}, want ≈ ${expected}`,
		).toBeLessThanOrEqual(TOLERANCE_PX);
	});

	it("row-h: comfortable is a designer-call 56 px (exempt from upper-bound 1.5× rule)", () => {
		// Spec: comfortable row-h is 3.5rem (56 px), explicitly NOT default × 1.5
		// (which would be 44 × 1.5 = 66 → 64). The 56 px sits above AQ-015's 44 px
		// floor and below the 1.5× cap; it is the designer call.
		expect(comfy["--density-row-h"]).toBe(56);
		expect(comfy["--density-row-h"]).toBeGreaterThanOrEqual(44);
	});

	it("body text progresses upward 14 → 15 → 16 px across compact / default / comfortable", () => {
		expect(compact["--density-text"]).toBe(14);
		expect(def["--density-text"]).toBe(15);
		expect(comfy["--density-text"]).toBe(16);
	});

	it("--density-text-h1 progresses 24 → 26 → 28 px across compact / default / comfortable", () => {
		expect(compact["--density-text-h1"]).toBe(24);
		expect(def["--density-text-h1"]).toBe(26);
		expect(comfy["--density-text-h1"]).toBe(28);
	});

	it("--density-text-h2 progresses 18 → 20 → 22 px across compact / default / comfortable", () => {
		expect(compact["--density-text-h2"]).toBe(18);
		expect(def["--density-text-h2"]).toBe(20);
		expect(comfy["--density-text-h2"]).toBe(22);
	});

	it("default tier already meets AQ-015 44 px touch-target floor on row-h", () => {
		expect(def["--density-row-h"]).toBeGreaterThanOrEqual(44);
	});
});
