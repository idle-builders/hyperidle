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
		function checkClassString(text: string, node: unknown): void {
			const reportNode = node as Rule.Node;
			for (const match of text.matchAll(ARBITRARY_SPACING)) {
				const [cls, , , nStr] = match;
				const n = Number(nStr);
				if (!SPACING_ALLOWLIST.has(n)) {
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
