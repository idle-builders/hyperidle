/**
 * design/no-off-scale-font-size
 *
 * Maps to AQ-004.
 * Source: AESTHETICS.md § Typography "Body size (default)" lint hint —
 * allowlist {11,12,13,14,15,16,18,20,24}.
 */

import type { Rule } from "eslint";
import { FONT_SIZE_ALLOWLIST, createRule, getClassNameLiteral } from "../util.js";

const ARBITRARY_FONT_SIZE = /\btext-\[(\d+)px\]/g;

export const noOffScaleFontSize: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid arbitrary text-[Npx] values not in the closed type scale (AESTHETICS.md § Typography).",
			recommended: true,
		},
		schema: [],
		messages: {
			offScale:
				"Font size {{n}}px is off-scale (allowed: {11,12,13,14,15,16,18,20,24}).  → fix: pick an allowed step or use a typography token.",
		},
	},
	create(context) {
		return {
			JSXAttribute(node) {
				const name = node.name && node.name.type === "JSXIdentifier" ? node.name.name : null;
				if (name !== "className") return;
				const literal = getClassNameLiteral(
					node as unknown as { value?: { type?: string; value?: unknown } | null },
				);
				if (literal === null) return;
				let match: RegExpExecArray | null;
				ARBITRARY_FONT_SIZE.lastIndex = 0;
				while ((match = ARBITRARY_FONT_SIZE.exec(literal)) !== null) {
					const n = Number(match[1]);
					if (!FONT_SIZE_ALLOWLIST.has(n)) {
						context.report({
							node,
							messageId: "offScale",
							data: { n: String(n) },
						});
					}
				}
			},
		};
	},
});
