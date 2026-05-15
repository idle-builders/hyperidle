/**
 * Shared helpers for design-lint rules.
 *
 * @lore K6: every value here is sourced from `packages/design-system/AESTHETICS.md`
 * recommendations tables or `packages/design-system/src/tokens.css`. Do NOT add a
 * value here that is not in one of those two files — see CLAUDE.md "First Principle".
 */

import { basename } from "node:path";
import type { Rule } from "eslint";

/**
 * Allowed 4px-grid spacing values used by the spacing/density rule.
 * Source: AESTHETICS.md § Spacing & Density — "Grid base unit" lint hint
 *   `allowlist {4,8,12,16,20,24,32,40,48}` (closed set).
 *
 * @lore K6 review SEV-1: 0 was missing — `p-[0px]` is implicitly valid (the
 * zero case the spec table omits because nobody writes it explicitly, but it
 * is a real value a developer may type). Added per K6-adversary.md SEV-1 #4.
 */
export const SPACING_ALLOWLIST: ReadonlySet<number> = new Set([
	0, 4, 8, 12, 16, 20, 24, 32, 40, 48,
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
 * Files that are exempt from the "no heavy shadow on cards" rule.
 * Source: AESTHETICS.md § AI-Aesthetic tell #10 — "outside files matching
 * `/Modal|Dialog|Popover|Tooltip/`".
 *
 * @lore K6 review SEV-1: the spec's literal regex matches anywhere in the
 * file path, so e.g. `BetCardModalSummary.tsx` or `pages/dialog-bar/Card.tsx`
 * silently exempts every card. We anchor strictly to the basename and require
 * an exact `(Modal|Dialog|Popover|Tooltip|Sheet|Drawer).tsx` filename.
 */
const SHADOW_OVERLAY_BASENAME_REGEX = /^(Modal|Dialog|Popover|Tooltip|Sheet|Drawer)\.tsx$/;

/**
 * Returns true when the file is one of the overlay primitive component files
 * for which heavy shadow is permitted (Modal/Dialog/Popover/Tooltip/Sheet/Drawer).
 */
export function isShadowOverlayFile(filename: string): boolean {
	return SHADOW_OVERLAY_BASENAME_REGEX.test(basename(filename));
}

/**
 * Named Tailwind radii whose pixel value is on the closed scale {0,4,8,12,999}
 * derived from `tokens.css` (--r0..r3 + --r-pill). These named classes are
 * permitted; any other named class (e.g. `rounded-sm` = 2px, `rounded-md` = 6px,
 * `rounded-2xl` = 16px, `rounded-3xl` = 24px) must be flagged off-scale.
 *
 * Tailwind v3 named-radius pixel mapping (verified against Tailwind defaults):
 *   rounded-none = 0   ✓
 *   rounded      = 4   ✓
 *   rounded-sm   = 2   ✗ (off-scale; sub-grid)
 *   rounded-md   = 6   ✗ (off-scale)
 *   rounded-lg   = 8   ✓
 *   rounded-xl   = 12  ✓
 *   rounded-2xl  = 16  ✗ (covered by no-ai-aesthetic too)
 *   rounded-3xl  = 24  ✗ (covered by no-ai-aesthetic too)
 *   rounded-full = 9999 ✓ (pill)
 */
export const ALLOWED_NAMED_RADIUS: ReadonlySet<string> = new Set(["none", "", "lg", "xl", "full"]);

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
	if (!attr?.value) return null;
	const v = attr.value;
	if (v.type === "Literal" && typeof v.value === "string") {
		return v.value;
	}
	return null;
}

/**
 * Names of helper functions whose string-literal arguments should be treated
 * as className strings (per K6 review SEV-2 — class-string composition is the
 * common case in real components). Walked by `collectClassStringsFromExpression`.
 */
const CLASSNAME_HELPER_NAMES: ReadonlySet<string> = new Set([
	"cn",
	"clsx",
	"classnames",
	"twMerge",
	"twJoin",
]);

type AnyNode = { type: string; [k: string]: unknown };

/**
 * Walk an arbitrary expression and collect every static class-string we can
 * see: bare string literals, template-literal cooked text, members of arrays,
 * nested call arguments to `cn()`/`clsx()`. Used by rules to widen detection
 * beyond `className="literal"`. Returns each found string with its AST node so
 * the rule can report on the right location.
 */
export function collectClassStringsFromExpression(
	expr: unknown,
): Array<{ text: string; node: AnyNode }> {
	const out: Array<{ text: string; node: AnyNode }> = [];
	function walk(n: unknown): void {
		if (!n || typeof n !== "object") return;
		const node = n as AnyNode;
		switch (node.type) {
			case "Literal": {
				if (typeof node.value === "string") {
					out.push({ text: node.value as string, node });
				}
				return;
			}
			case "TemplateLiteral": {
				const quasis = node.quasis as Array<{
					value: { cooked?: string; raw: string };
				}>;
				for (const q of quasis) {
					const text = q.value.cooked ?? q.value.raw;
					if (typeof text === "string" && text.length > 0) {
						out.push({ text, node: q as unknown as AnyNode });
					}
				}
				const exprs = node.expressions as unknown[];
				for (const sub of exprs) walk(sub);
				return;
			}
			case "ArrayExpression": {
				const elements = node.elements as unknown[];
				for (const el of elements) walk(el);
				return;
			}
			case "ObjectExpression": {
				const props = node.properties as Array<{
					type: string;
					key?: unknown;
					value?: unknown;
				}>;
				// classnames/cn convention: { 'class-string': condition }
				for (const p of props) {
					if (p.type === "Property") {
						walk(p.key);
					}
				}
				return;
			}
			case "CallExpression": {
				const callee = node.callee as { type: string; name?: string };
				if (
					callee.type === "Identifier" &&
					callee.name &&
					CLASSNAME_HELPER_NAMES.has(callee.name)
				) {
					const args = node.arguments as unknown[];
					for (const a of args) walk(a);
				}
				return;
			}
			case "ConditionalExpression": {
				walk(node.consequent);
				walk(node.alternate);
				return;
			}
			case "LogicalExpression":
			case "BinaryExpression": {
				walk(node.left);
				walk(node.right);
				return;
			}
		}
	}
	walk(expr);
	return out;
}

/**
 * Returns true when the given AST node is contained within a `className=` (or
 * `style=`) JSXAttribute, so a separate visitor can avoid double-reporting on
 * cn()/clsx() args that the JSXAttribute visitor already handled.
 */
export function isInsideClassNameAttribute(node: { parent?: unknown }): boolean {
	let cur = (node as { parent?: AnyNode }).parent;
	while (cur) {
		if (cur.type === "JSXAttribute") {
			const name = (cur as { name?: { type?: string; name?: string } }).name;
			return name?.type === "JSXIdentifier" && (name.name === "className" || name.name === "style");
		}
		cur = (cur as { parent?: AnyNode }).parent;
	}
	return false;
}

/**
 * Collect every static class-string visible from a className JSXAttribute,
 * whether the value is a bare string literal or a `{cn(...)}`/template-literal
 * expression container. Replaces the literal-only `getClassNameLiteral` for
 * rules that want to widen coverage to dynamic compositions.
 */
export function collectClassStringsFromJSXAttribute(
	attr: unknown,
): Array<{ text: string; node: AnyNode }> {
	if (!attr || typeof attr !== "object") return [];
	const a = attr as { value?: AnyNode | null };
	const v = a.value;
	if (!v) return [];
	if (v.type === "Literal" && typeof v.value === "string") {
		return [{ text: v.value as string, node: v }];
	}
	if (v.type === "JSXExpressionContainer") {
		return collectClassStringsFromExpression(v.expression);
	}
	return [];
}

/**
 * Tiny helper so each rule can build a Rule.RuleModule without ts-eslint Utils.
 * Keeps the rule files free of boilerplate.
 */
export function createRule(rule: Rule.RuleModule): Rule.RuleModule {
	return rule;
}
