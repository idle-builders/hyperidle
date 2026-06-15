/**
 * design/no-hardcoded-color
 *
 * Maps to AQ-008/AQ-009 in `.claude/rules/aesthetic-quality.md`.
 * Source: AESTHETICS.md § Color & Dark Mode — flag hex / rgb / hsl literals
 * inside .tsx component files when they appear in a STYLING context. The
 * tokens.css allowlist (semantic tokens) is the only place hex values are
 * permitted.
 *
 * @lore K6 review SEV-1: original implementation fired on every string Literal
 * in .tsx, producing false positives for JSX text content (`<code>#fff</code>`),
 * `aria-label`, `id`, `data-*` attributes, etc. We now only fire when the hex
 * literal is in a styling position:
 *   - `style={{ color: "#fff" }}` — value of an inline style object property.
 *   - `className="text-[#fff]"` — inside a className string (literal or
 *     composed via cn()/clsx()/template literal).
 *   - `cn("...#fff...")` / `clsx("...#fff...")` arguments outside a JSX context.
 * Plain text content, accessible names, and identifiers no longer trigger.
 */

import type { Rule } from "eslint";
import { createRule } from "../util.js";

const HEX_REGEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const RGB_REGEX = /\brgba?\s*\(/;
const HSL_REGEX = /\bhsla?\s*\(/;

function hasColorLiteral(text: string): boolean {
	return HEX_REGEX.test(text) || RGB_REGEX.test(text) || HSL_REGEX.test(text);
}

function findColorLiteral(text: string): string | null {
	const hex = HEX_REGEX.exec(text);
	if (hex) return hex[0];
	const rgb = RGB_REGEX.exec(text);
	if (rgb) return text.slice(rgb.index, Math.min(rgb.index + 32, text.length));
	const hsl = HSL_REGEX.exec(text);
	if (hsl) return text.slice(hsl.index, Math.min(hsl.index + 32, text.length));
	return null;
}

/**
 * Internal traversal node type. ESLint attaches `parent` to every visited node
 * at runtime; `WalkNode` reflects that for the `isInStylingContext` parent-chain
 * traversal without requiring estree's closed union.
 *
 * @lore refactor/no-unknown-cast-eslint-plugins: Replaced the old `AnyNode`
 * (index-signature type) that forced `as unknown as AnyNode` at every call site.
 * `WalkNode` is private to this file; callers pass nodes directly since the helper
 * parameter is `unknown` — no cast needed at call sites.
 */
type WalkNode = { type: string; parent?: WalkNode; [k: string]: unknown };

/**
 * Walk up the AST from a string literal to determine whether it sits in a
 * styling context: inside a `style={{...}}` object, inside a `className`
 * attribute (literal/expression), or inside a `cn()`/`clsx()` arg.
 *
 * Accepts `unknown` so the ESLint visitor can pass the typed node directly
 * without a cast at the call site. The function narrows internally via WalkNode.
 */
function isInStylingContext(startNode: unknown): boolean {
	const asWalk = (n: unknown): WalkNode | undefined =>
		n && typeof n === "object" ? (n as WalkNode) : undefined;
	let cur: WalkNode | undefined = asWalk((startNode as { parent?: unknown } | null)?.parent);
	while (cur) {
		// `style={{ color: "#fff" }}` — value of a Property whose containing
		// JSXAttribute name is `style`.
		if (cur.type === "Property") {
			let p: WalkNode | undefined = cur.parent;
			while (p) {
				if (p.type === "JSXAttribute") {
					const name = p.name as { type?: string; name?: string } | undefined;
					if (name?.type === "JSXIdentifier" && name.name === "style") {
						return true;
					}
					return false;
				}
				if (
					p.type === "ObjectExpression" ||
					p.type === "Property" ||
					p.type === "JSXExpressionContainer"
				) {
					p = p.parent;
					continue;
				}
				return false;
			}
			return false;
		}
		// `className="bg-[#fff]"` — direct value or expression-container value.
		if (cur.type === "JSXAttribute") {
			const name = cur.name as { type?: string; name?: string } | undefined;
			return name?.type === "JSXIdentifier" && (name.name === "className" || name.name === "style");
		}
		// `cn("...#fff...")` / `clsx("...")` argument — treat as className.
		if (cur.type === "CallExpression") {
			const callee = cur.callee as { type?: string; name?: string } | undefined;
			if (
				callee?.type === "Identifier" &&
				callee.name &&
				(callee.name === "cn" ||
					callee.name === "clsx" ||
					callee.name === "classnames" ||
					callee.name === "twMerge" ||
					callee.name === "twJoin")
			) {
				return true;
			}
		}
		// Tagged template `` css`color: #fff;` `` — treat as styling.
		if (cur.type === "TaggedTemplateExpression") {
			const tag = cur.tag as { type?: string; name?: string } | undefined;
			if (tag?.type === "Identifier" && tag.name && (tag.name === "css" || tag.name === "styled")) {
				return true;
			}
		}
		cur = cur.parent;
	}
	return false;
}

export const noHardcodedColor: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid hex / rgb / hsl color literals inside .tsx files when used in a styling context (style={{…}}, className, cn()/clsx(), css``). Use semantic tokens from tokens.css.",
			recommended: true,
		},
		schema: [],
		messages: {
			hardcoded:
				"Hardcoded color literal '{{value}}' is not allowed in styling positions.  → fix: use a semantic token from tokens.css (e.g., var(--text-hi), var(--surface-1)).",
		},
	},
	create(context) {
		const filename = context.filename;
		// Rule only fires inside *.tsx; tokens.css and other CSS files are exempt
		// because that's where the canonical color values live.
		if (!filename.endsWith(".tsx")) {
			return {};
		}
		return {
			Literal(node) {
				if (typeof node.value !== "string") return;
				if (!hasColorLiteral(node.value)) return;
				if (!isInStylingContext(node)) return;
				const found = findColorLiteral(node.value) ?? node.value;
				context.report({
					node,
					messageId: "hardcoded",
					data: { value: found },
				});
			},
			TemplateElement(node) {
				const raw = node.value.cooked ?? node.value.raw;
				if (typeof raw !== "string") return;
				if (!hasColorLiteral(raw)) return;
				// TemplateElement's parent is TemplateLiteral; for styling-context
				// detection we walk from the enclosing TemplateLiteral.
				const tpl = (node as { parent?: unknown }).parent;
				if (!tpl) return;
				if (!isInStylingContext(tpl)) return;
				const found = findColorLiteral(raw) ?? raw;
				context.report({
					node,
					messageId: "hardcoded",
					data: { value: found },
				});
			},
			// Note: cn()/clsx() argument literals are already visited by the
			// `Literal` handler above (the AST walker visits every node). The
			// `isInStylingContext` walk-up correctly returns true for any literal
			// nested inside a cn()/clsx() call, so a separate CallExpression
			// visitor would double-report. The Literal handler is sufficient.
		};
	},
});
