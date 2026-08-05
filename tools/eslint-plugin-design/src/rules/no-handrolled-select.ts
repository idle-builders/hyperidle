/**
 * design/no-handrolled-select
 *
 * Maps to AG5 AC: "No hand-rolled <select> elements remain in layers/web/src/**".
 * Source: plans/AG5/architecture.md § 5 (AC → verification) + § ESLint rule.
 *
 * Forbidden patterns (layers/web/src/** only; design-system itself is exempt):
 *   1. className containing "select-bordered" — DaisyUI hand-roll marker.
 *   2. className containing "select select-sm" — combined DaisyUI classes.
 *   3. className containing "select-sm" alone — DaisyUI size-only shortcut.
 *   4. Variable declaration named /selectStyle/i — SettingsOrgChart inline-style pattern.
 *
 * @lore AG5: Rule enforces the "one canonical primitive" AC for selects. The
 * design-system/src/** is exempt because Select.tsx itself uses custom classes.
 * layers/web/src/** must use <Select> from @hyperidle/design-system.
 */

import type { Rule } from "eslint";
import type { VariableDeclarator } from "estree";
import type { JSXAttribute } from "estree-jsx";
import { asReportNode, collectClassStringsFromJSXAttribute, createRule } from "../util.js";

// DaisyUI hand-roll markers that indicate a bypassed primitive
const FORBIDDEN_PATTERNS = ["select-bordered", "select-sm"];

function isInWebSrc(filename: string): boolean {
	return filename.includes("layers/web/src");
}

export const noHandrolledSelect: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid hand-rolled <select> elements using DaisyUI classes (select-bordered, select-sm) in layers/web/src/**. Use <Select> from @hyperidle/design-system instead. Also forbids inline selectStyle objects (SettingsOrgChart pattern).",
			recommended: true,
		},
		schema: [],
		messages: {
			handrolledSelect:
				"Hand-rolled select detected (className contains '{{cls}}'). Use <Select> from @hyperidle/design-system instead.",
			handrolledSelectStyle:
				"Inline 'selectStyle' object detected. Use <Select> from @hyperidle/design-system and remove the inline style.",
		},
	},
	create(context) {
		const filename = context.filename;
		if (!isInWebSrc(filename)) return {};

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
					for (const forbidden of FORBIDDEN_PATTERNS) {
						if (text.includes(forbidden)) {
							context.report({
								node: asReportNode(node),
								messageId: "handrolledSelect",
								data: { cls: forbidden },
							});
							return; // one report per attribute
						}
					}
				}
			},

			VariableDeclarator(rawNode: unknown) {
				const node = rawNode as VariableDeclarator;
				if (
					node.type === "VariableDeclarator" &&
					node.id.type === "Identifier" &&
					/selectStyle/i.test(node.id.name)
				) {
					context.report({
						node: asReportNode(node),
						messageId: "handrolledSelectStyle",
					});
				}
			},
		};
	},
});
