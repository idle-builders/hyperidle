/**
 * design/no-off-grid-spacing
 *
 * Maps to AQ-001 / AQ-002.
 * Source: AESTHETICS.md § Spacing & Density — U10 Hearth override (§ U10 changelog).
 * Hearth 6px grid allowlist: {0,3,6,9,12,18,24,36,48} px. No 2px sub-grid.
 *
 * @lore U10: Updated from 4px grid to Hearth 6px grid. The SUB_GRID_VALUE
 * constant and `subGrid` messageId are removed — Hearth has no 2px sub-grid
 * as a general rule. Values 4px, 8px, and 16px (formerly on the 4px grid)
 * are now off-grid. Component-internal padding (buttons: 10px/7px, inputs: 10px)
 * and sub-element gaps (badges: 4px, toggle-text: 2px) are exempt per AQ-001;
 * use a `// hearth-internal-padding` file-level directive in component files.
 */

import type { Rule } from "eslint";
import type { JSXAttribute } from "estree-jsx";
import { collectClassStringsFromJSXAttribute, createRule, SPACING_ALLOWLIST } from "../util.js";

// (p|m|gap)(x|y|t|r|b|l)?-[Npx]
const ARBITRARY_SPACING = /\b(p|m|gap)([xytrbl])?-\[(\d+)px\]/g;

export const noOffGridSpacing: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid arbitrary spacing values that are not on the Hearth 6px grid (allowlist from AESTHETICS.md § Spacing & Density — U10 Hearth override).",
			recommended: true,
		},
		schema: [],
		messages: {
			offGrid:
				"Spacing class '{{cls}}' uses {{n}}px which is off the Hearth 6px grid.  → fix: pick one of {3,6,9,12,18,24,36,48}px or use a Hearth spacing token (var(--space-1) through var(--space-16)).",
		},
	},
	create(context) {
		// When a file carries the `// hearth-internal-padding` file-level directive
		// (AQ-001 component-internal exemption), suppress the specific off-grid values
		// that are optically tuned rather than layout-grid values:
		//   • vertical padding (py/pt/pb) at 7px and 10px — button/input optical tuning
		//   • gap at 4px — badge sub-element gap
		//   • gap at 2px — toggle label-stack gap
		// Horizontal padding (px) and margin are never exempt — the directive only covers
		// the two named exemption families in AQ-001.
		const sourceText: string = (context.sourceCode as { text: string }).text;
		const hasInternalPaddingDirective = sourceText.includes("hearth-internal-padding");

		function isExemptInternalPadding(prop: string, dir: string | undefined, n: number): boolean {
			if (!hasInternalPaddingDirective) return false;
			// Vertical-only padding in buttons/inputs: py/pt/pb at 7px or 10px.
			if (prop === "p" && (dir === "y" || dir === "t" || dir === "b") && (n === 7 || n === 10))
				return true;
			// Sub-element gaps in badges (4px) and toggle label stacks (2px).
			if (prop === "gap" && dir === undefined && (n === 4 || n === 2)) return true;
			return false;
		}

		function checkClassString(text: string, node: unknown): void {
			const reportNode = node as Rule.Node;
			for (const match of text.matchAll(ARBITRARY_SPACING)) {
				const [cls, prop, dir, nStr] = match;
				const n = Number(nStr);
				if (!SPACING_ALLOWLIST.has(n) && !isExemptInternalPadding(prop, dir, n)) {
					context.report({
						node: reportNode,
						messageId: "offGrid",
						data: { cls, n: String(n) },
					});
				}
			}
		}
		return {
			JSXAttribute(rawNode: unknown) {
				const node = rawNode as JSXAttribute;
				const name =
					node.type === "JSXAttribute" && node.name.type === "JSXIdentifier"
						? node.name.name
						: null;
				if (name !== "className") return;
				const strings = collectClassStringsFromJSXAttribute(node);
				for (const { text } of strings) {
					checkClassString(text, node);
				}
			},
		};
	},
});
