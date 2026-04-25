/**
 * design/no-raw-tailwind-color
 *
 * Maps to AQ-008.
 * Source: AESTHETICS.md § Color & Dark Mode "Raw Tailwind color usage" lint
 * hint regex enumerates the disallowed palette names. Lucid semantic tokens
 * (e.g., `bg-surface-1`, `text-text-hi`) do NOT match the regex and pass.
 */

import type { Rule } from "eslint";
import { createRule, getClassNameLiteral, RAW_TAILWIND_PALETTE } from "../util.js";

const PALETTE_GROUP = RAW_TAILWIND_PALETTE.join("|");
const RAW_PALETTE_REGEX = new RegExp(
	`\\b(text|bg|border|ring|fill|stroke|from|to|via|divide|placeholder|caret|accent|outline|shadow|decoration)-(?:${PALETTE_GROUP})-\\d{2,3}\\b`,
	"g",
);

export const noRawTailwindColor: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid raw Tailwind palette color classes (e.g. bg-blue-500). Use Lucid semantic tokens.",
			recommended: true,
		},
		schema: [],
		messages: {
			rawColor:
				"Raw Tailwind color '{{cls}}' is not in the Lucid palette.  → fix: use a semantic class (bg-surface-1, text-text-hi, border-border-default) or a token (var(--primary), var(--danger)).",
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
				RAW_PALETTE_REGEX.lastIndex = 0;
				while ((match = RAW_PALETTE_REGEX.exec(literal)) !== null) {
					context.report({
						node,
						messageId: "rawColor",
						data: { cls: match[0] },
					});
				}
			},
		};
	},
});
