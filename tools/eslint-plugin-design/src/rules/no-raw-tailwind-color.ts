/**
 * design/no-raw-tailwind-color
 *
 * Maps to AQ-008.
 * Source: AESTHETICS.md § Color & Dark Mode "Raw Tailwind color usage" lint
 * hint regex enumerates the disallowed palette names. Lucid semantic tokens
 * (e.g., `bg-surface-1`, `text-text-hi`) do NOT match the regex and pass.
 *
 * @lore AI6: Switched from `getClassNameLiteral` (literal-only) to
 * `collectClassStringsFromJSXAttribute` to cover template-string className
 * expressions (e.g., `` className={`bg-[var(--x)] ${active ? "bg-blue-500" : ""}`} ``).
 * Also added the `undefinedTokenClass` check for `bg-{success|warning|error|info}/NN`
 * opacity forms that silently render as nothing (not defined in Hearth's Tailwind
 * config — use color-mix instead).
 */

import type { Rule } from "eslint";
import type { JSXAttribute } from "estree-jsx";
import {
	asReportNode,
	collectClassStringsFromJSXAttribute,
	createRule,
	RAW_TAILWIND_PALETTE,
} from "../util.js";
import { isInForeignTokenSubject } from "./profile-rule-utils.js";

const PALETTE_GROUP = RAW_TAILWIND_PALETTE.join("|");
const RAW_PALETTE_REGEX = new RegExp(
	`\\b(text|bg|border|ring|fill|stroke|from|to|via|divide|placeholder|caret|accent|outline|shadow|decoration)-(?:${PALETTE_GROUP})-\\d{2,3}\\b`,
	"g",
);

// Catches `bg-success/10`, `text-warning/20`, `border-error/30`, etc.
// These are not defined Tailwind utilities in Hearth and silently render as nothing.
// The correct form uses color-mix: `bg-[color-mix(in_oklab,var(--status-success)_10%,transparent)]`.
const UNDEFINED_TOKEN_OPACITY_REGEX =
	/\b(text|bg|border|ring|fill|stroke|outline|shadow|divide)-(success|warning|error|info|accent|surface|danger)\/\d{1,3}\b/g;

export const noRawTailwindColor: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid raw Tailwind palette color classes (e.g. bg-blue-500) and undefined-semantic-token opacity forms (e.g. bg-success/10). Use Hearth semantic tokens.",
			recommended: true,
		},
		schema: [],
		messages: {
			rawColor:
				"Raw Tailwind color '{{cls}}' is not in the Lucid palette.  → fix: use a semantic class (bg-surface-1, text-text-hi, border-border-default) or a token (var(--primary), var(--danger)).",
			undefinedTokenClass:
				"'{{cls}}' is not a defined Tailwind utility — use color-mix(in oklab, var(--status-success) 10%, transparent). The bg-{token}/{opacity} form is undefined in Hearth's Tailwind config and renders as nothing.",
		},
	},
	create(context) {
		return {
			JSXAttribute(rawNode: unknown) {
				const node = rawNode as JSXAttribute;
				if (isInForeignTokenSubject(node)) return;
				const name =
					node.type === "JSXAttribute" && node.name.type === "JSXIdentifier"
						? node.name.name
						: null;
				if (name !== "className") return;
				const strings = collectClassStringsFromJSXAttribute(node);
				for (const { text, node: strNode } of strings) {
					for (const match of text.matchAll(RAW_PALETTE_REGEX)) {
						context.report({
							node: asReportNode(strNode),
							messageId: "rawColor",
							data: { cls: match[0] },
						});
					}
					for (const match of text.matchAll(UNDEFINED_TOKEN_OPACITY_REGEX)) {
						context.report({
							node: asReportNode(strNode),
							messageId: "undefinedTokenClass",
							data: { cls: match[0] },
						});
					}
				}
			},
		};
	},
});
