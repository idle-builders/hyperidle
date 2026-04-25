/**
 * design/no-hardcoded-color
 *
 * Maps to AQ-008/AQ-009 in `.claude/rules/aesthetic-quality.md`.
 * Source: AESTHETICS.md § Color & Dark Mode — flag hex / rgb / hsl literals
 * inside .tsx component files. The tokens.css allowlist (semantic tokens) is
 * the only place hex values are permitted.
 */

import type { Rule } from "eslint";
import { createRule } from "../util.js";

const HEX_REGEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const RGB_REGEX = /\brgba?\s*\(/;
const HSL_REGEX = /\bhsla?\s*\(/;

function hasColorLiteral(text: string): boolean {
	return HEX_REGEX.test(text) || RGB_REGEX.test(text) || HSL_REGEX.test(text);
}

export const noHardcodedColor: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid hex / rgb / hsl color literals inside .tsx files (use semantic tokens from tokens.css).",
			recommended: true,
		},
		schema: [],
		messages: {
			hardcoded:
				"Hardcoded color literal '{{value}}' is not allowed in .tsx files.  → fix: use a semantic token from tokens.css (e.g., var(--text-hi), var(--surface-1)).",
		},
	},
	create(context) {
		const filename = context.filename ?? context.getFilename();
		// Rule only fires inside *.tsx; tokens.css and other CSS files are exempt
		// because that's where the canonical color values live.
		if (!filename.endsWith(".tsx")) {
			return {};
		}
		return {
			Literal(node) {
				if (typeof node.value !== "string") return;
				if (hasColorLiteral(node.value)) {
					context.report({
						node,
						messageId: "hardcoded",
						data: { value: node.value },
					});
				}
			},
			TemplateElement(node) {
				const raw = node.value.cooked ?? node.value.raw;
				if (typeof raw !== "string") return;
				if (hasColorLiteral(raw)) {
					context.report({
						node,
						messageId: "hardcoded",
						data: { value: raw },
					});
				}
			},
		};
	},
});
