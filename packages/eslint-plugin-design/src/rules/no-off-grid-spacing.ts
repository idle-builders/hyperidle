/**
 * design/no-off-grid-spacing
 *
 * Maps to AQ-001 / AQ-002.
 * Source: AESTHETICS.md § Spacing & Density — "Grid base unit" lint hint.
 * Allowlist: {4,8,12,16,20,24,32,40,48} px. 2px is a sub-grid value; the
 * recommendations table reserves it for chip/icon internals — that contextual
 * predicate is left to the higher-level `/design-lint` skill (see
 * AESTHETICS.md "Sub-grid 2px allowance" Lintable=partial).
 */

import type { Rule } from "eslint";
import {
	collectClassStringsFromJSXAttribute,
	createRule,
	SPACING_ALLOWLIST,
	SUB_GRID_VALUE,
} from "../util.js";

// (p|m|gap)(x|y|t|r|b|l)?-[Npx]
const ARBITRARY_SPACING = /\b(p|m|gap)([xytrbl])?-\[(\d+)px\]/g;

export const noOffGridSpacing: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid arbitrary spacing values that are not on the 4px grid (allowlist from AESTHETICS.md § Spacing & Density).",
			recommended: true,
		},
		schema: [],
		messages: {
			offGrid:
				"Spacing class '{{cls}}' uses {{n}}px which is off the 4px grid.  → fix: pick one of {4,8,12,16,20,24,32,40,48}px or use a density token (var(--density-pad-*), var(--density-gap)).",
			subGrid:
				"Spacing class '{{cls}}' uses 2px (sub-grid). Reserved for chip/icon internals only.  → fix: use a 4px-grid value, or move this style into a StatusChip/Tag-internal context.",
		},
	},
	create(context) {
		function checkClassString(text: string, node: unknown): void {
			const reportNode = node as Rule.Node;
			let match: RegExpExecArray | null;
			ARBITRARY_SPACING.lastIndex = 0;
			while ((match = ARBITRARY_SPACING.exec(text)) !== null) {
				const [cls, , , nStr] = match;
				const n = Number(nStr);
				if (n === SUB_GRID_VALUE) {
					context.report({ node: reportNode, messageId: "subGrid", data: { cls } });
					continue;
				}
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
			JSXAttribute(node) {
				const name = node.name && node.name.type === "JSXIdentifier" ? node.name.name : null;
				if (name !== "className") return;
				const strings = collectClassStringsFromJSXAttribute(node);
				for (const { text } of strings) {
					checkClassString(text, node);
				}
			},
		};
	},
});
