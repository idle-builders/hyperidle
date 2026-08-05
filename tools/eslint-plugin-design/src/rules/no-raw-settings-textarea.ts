/**
 * design/no-raw-settings-textarea
 *
 * AH3 D4: Prevents regression to raw DaisyUI <textarea className="textarea textarea-bordered">
 * in layers/web/src/settings/**. Settings textareas must use <Input textarea> from
 * @hyperidle/design-system (prose font, --r-default radius, design token colors).
 *
 * @lore AH3 D4: This guard was added after a code-review finding (H2) showed that
 * a raw textarea patch violated the design-system migration contract. The design-system
 * Input component's textarea prop provides correct styling without inline-style overrides.
 * Zero violations must be maintained in layers/web/src/settings/.
 */

import type { Rule } from "eslint";
import type { JSXAttribute } from "estree-jsx";
import { asReportNode, collectClassStringsFromJSXAttribute, createRule } from "../util.js";

// DaisyUI textarea class markers — signal a bypassed design-system primitive
const FORBIDDEN_PATTERNS = ["textarea-bordered", "textarea textarea", "textarea-sm"];

function isInSettingsSrc(filename: string): boolean {
	return filename.includes("layers/web/src/settings");
}

export const noRawSettingsTextarea: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid raw DaisyUI <textarea> elements (textarea-bordered, textarea-sm) in layers/web/src/settings/**. Use <Input textarea> from @hyperidle/design-system instead.",
			recommended: true,
		},
		schema: [],
		messages: {
			rawTextarea:
				"Raw DaisyUI textarea detected (className contains '{{cls}}'). Use <Input textarea> from @hyperidle/design-system instead.",
		},
	},
	create(context) {
		const filename = context.filename;
		if (!isInSettingsSrc(filename)) return {};

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
								messageId: "rawTextarea",
								data: { cls: forbidden },
							});
							return; // one report per attribute
						}
					}
				}
			},
		};
	},
});
