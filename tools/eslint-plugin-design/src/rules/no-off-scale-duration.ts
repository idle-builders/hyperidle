/**
 * design/no-off-scale-duration
 *
 * Maps to AI6 motion AC.
 * Source: tokens.css `--motion-fast:120ms --motion-default:240ms --motion-slow:450ms
 *                      --motion-ease:cubic-bezier(0.25,0.1,0.25,1)`.
 * Hearth rule: every `duration-[Nms]` must use a token form; `ease-[ease]` (CSS keyword
 * as arbitrary value) must use `ease-[var(--motion-ease)]`.
 *
 * Allowed: named Tailwind duration utilities (`duration-200`), named easing
 * utilities (`ease-in-out`), and token forms (`duration-[var(--motion-fast)]`).
 *
 * @lore AI6: Added to enforce the motion token migration. Only 4 sites in the
 * DS needed conversion: Checkbox.tsx (duration-[120ms]) and SearchField/NavItem
 * (ease-[ease]×3). The rule prevents regression from future contributors.
 */

import type { Rule } from "eslint";
import type { JSXAttribute } from "estree-jsx";
import { collectClassStringsFromJSXAttribute, createRule } from "../util.js";

// Matches duration-[<number>ms] — bare ms literal (not a var() token).
const HARDCODED_DURATION_REGEX = /\bduration-\[(\d+ms)\]/g;

// Matches ease-[ease] — the CSS keyword `ease` as an arbitrary Tailwind value.
// Does NOT match `ease-[var(...)]` or named utilities like `ease-in-out`.
const HARDCODED_EASE_REGEX = /\bease-\[ease\]/g;

export const noOffScaleDuration: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid hardcoded ms duration literals and bare `ease-[ease]` in className. Use Hearth motion tokens: duration-[var(--motion-fast/default/slow)] and ease-[var(--motion-ease)].",
			recommended: true,
		},
		schema: [],
		messages: {
			hardcodedDuration:
				"Hardcoded duration '{{cls}}' must use a Hearth token.  → fix: duration-[var(--motion-fast)] (120ms), duration-[var(--motion-default)] (240ms), or duration-[var(--motion-slow)] (450ms).",
			hardcodedEase:
				"Bare ease-[ease] must use the Hearth token.  → fix: ease-[var(--motion-ease)] (cubic-bezier(0.25,0.1,0.25,1)).",
		},
	},
	create(context) {
		function checkClassString(text: string, node: unknown): void {
			const reportNode = node as Rule.Node;
			for (const match of text.matchAll(HARDCODED_DURATION_REGEX)) {
				context.report({
					node: reportNode,
					messageId: "hardcodedDuration",
					data: { cls: match[0] },
				});
			}
			for (const match of text.matchAll(HARDCODED_EASE_REGEX)) {
				context.report({
					node: reportNode,
					messageId: "hardcodedEase",
					data: { cls: match[0] },
				});
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
				for (const { text, node: n } of strings) {
					checkClassString(text, n);
				}
			},
		};
	},
});
