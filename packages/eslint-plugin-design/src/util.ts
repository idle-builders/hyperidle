/**
 * Shared helpers for design-lint rules.
 *
 * @lore K6: every value here is sourced from `packages/design-system/AESTHETICS.md`
 * recommendations tables or `packages/design-system/src/tokens.css`. Do NOT add a
 * value here that is not in one of those two files — see CLAUDE.md "First Principle".
 */

import type { Rule } from "eslint";

/**
 * Allowed 4px-grid spacing values used by the spacing/density rule.
 * Source: AESTHETICS.md § Spacing & Density — "Grid base unit" lint hint
 *   `allowlist {4,8,12,16,20,24,32,40,48}` (closed set).
 */
export const SPACING_ALLOWLIST: ReadonlySet<number> = new Set([
	4, 8, 12, 16, 20, 24, 32, 40, 48,
]);

/**
 * 2px sub-grid is allowed only inside chip / icon internals.
 * Source: AESTHETICS.md § Spacing & Density — "Sub-grid 2px allowance" row.
 */
export const SUB_GRID_VALUE = 2;

/**
 * Closed radius scale from `packages/design-system/src/tokens.css`:
 *   --r0:0 --r1:4px --r2:8px --r3:12px --r-pill:999px
 * pill (>=999) is permitted.
 */
export const RADIUS_ALLOWLIST: ReadonlySet<number> = new Set([0, 4, 8, 12, 999]);

/**
 * Type-scale allowlist from AESTHETICS.md § Typography "Body size (default)" lint
 * hint: `allowlist {11,12,13,14,15,16,18,20,24}`.
 */
export const FONT_SIZE_ALLOWLIST: ReadonlySet<number> = new Set([
	11, 12, 13, 14, 15, 16, 18, 20, 24,
]);

/**
 * Raw Tailwind palette names that are NOT part of the Lucid semantic token set.
 * Source: AESTHETICS.md § Color & Dark Mode — "Raw Tailwind color usage" lint hint
 * regex enumerates these palette names.
 */
export const RAW_TAILWIND_PALETTE = [
	"slate",
	"gray",
	"zinc",
	"neutral",
	"stone",
	"red",
	"orange",
	"amber",
	"yellow",
	"lime",
	"green",
	"emerald",
	"teal",
	"cyan",
	"sky",
	"blue",
	"indigo",
	"violet",
	"purple",
	"fuchsia",
	"pink",
	"rose",
] as const;

/**
 * AI-aesthetic gradient palette per AESTHETICS.md § AI-Aesthetic — tell #2.
 */
export const GRADIENT_AI_PALETTE = [
	"indigo",
	"purple",
	"violet",
	"fuchsia",
	"pink",
] as const;

/**
 * Files that are exempt from the "no heavy shadow on cards" rule.
 * Source: AESTHETICS.md § AI-Aesthetic tell #10 — "outside files matching
 * `/Modal|Dialog|Popover|Tooltip/`".
 */
export const SHADOW_OVERLAY_FILE_REGEX = /(Modal|Dialog|Popover|Tooltip)/;

/**
 * Class-name string extractor: returns the literal text of `className="..."`.
 * Returns null if the JSXAttribute value is not a static string literal we can
 * parse. We intentionally do not chase template literals or `clsx()` — those
 * are out of scope for the regex-based screenshot-detectable tells (the
 * higher-level `/design-lint` skill catches dynamic cases).
 */
export function getClassNameLiteral(
	attr: { value?: { type?: string; value?: unknown } | null } | null,
): string | null {
	if (!attr || !attr.value) return null;
	const v = attr.value;
	if (v.type === "Literal" && typeof v.value === "string") {
		return v.value;
	}
	return null;
}

/**
 * Tiny helper so each rule can build a Rule.RuleModule without ts-eslint Utils.
 * Keeps the rule files free of boilerplate.
 */
export function createRule(rule: Rule.RuleModule): Rule.RuleModule {
	return rule;
}
