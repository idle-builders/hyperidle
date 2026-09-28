/**
 * design/no-off-scale-font-size
 *
 * Maps to AQ-004.
 * Source: AESTHETICS.md § Typography — U10 Hearth override (§ U10 changelog).
 * Hearth type scale allowlist: {9,10,11,12,13,14,15,16,17,18,20,24,30}.
 *
 * @lore U10: Added 9px (count badges), 10px (micro-typography), 17px (--text-lg),
 * 30px (--text-3xl page title). Updated from old Lucid allowlist {11,12,13,14,15,16,18,20,24}.
 */

import type { Rule } from "eslint";
import type { JSXAttribute } from "estree-jsx";
import { createRule, FONT_SIZE_ALLOWLIST, getClassNameLiteral } from "../util.js";

const ARBITRARY_FONT_SIZE = /\btext-\[(\d+)px\]/g;

export const noOffScaleFontSize: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description: "Forbid arbitrary text-[Npx] values not in the closed type scale.",
			recommended: true,
		},
		schema: [],
		messages: {
			offScale:
				"Font size {{n}}px is off-scale (Hearth allowed: {9,10,11,12,13,14,15,16,17,18,20,24,30}).  → fix: pick an allowed step or use a typography token.",
		},
	},
	create(context) {
		return {
			JSXAttribute(rawNode: unknown) {
				const node = rawNode as JSXAttribute;
				const name =
					node.type === "JSXAttribute" && node.name.type === "JSXIdentifier"
						? node.name.name
						: null;
				if (name !== "className") return;
				const literal = getClassNameLiteral(node);
				if (literal === null) return;
				for (const match of literal.matchAll(ARBITRARY_FONT_SIZE)) {
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
