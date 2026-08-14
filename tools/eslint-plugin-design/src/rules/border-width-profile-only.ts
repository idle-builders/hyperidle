import type { Rule } from "eslint";
import { createRule } from "../util.js";
import {
	createStyleStringVisitors,
	isInForeignTokenSubject,
	reportProfileViolation,
	stylePropertyNames,
} from "./profile-rule-utils.js";

type AstNode = { type: string; parent?: AstNode; [key: string]: unknown };

const RAW_STYLE_FIELDS =
	/^(?:border(?:Top|Right|Bottom|Left|Inline|InlineStart|InlineEnd|Block|BlockStart|BlockEnd)?Width|border)$/;

function hasRawBorderWidth(text: string): boolean {
	return text.split(/\s+/).some((raw) => {
		const token = raw.replace(/^(?:[a-z-]+:)+/, "");
		if (token.startsWith("border-width-")) return false;
		if (/^border(?:-(?:x|y|t|r|b|l|s|e))?$/.test(token)) return true;
		if (/^border(?:-(?:x|y|t|r|b|l|s|e))?-(?:0|2|4|8)$/.test(token)) return true;
		return /^border(?:-(?:x|y|t|r|b|l|s|e))?-\[(?:\d|var\(--bw-)/.test(token);
	});
}

export const borderWidthProfileOnly: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: { description: "Require semantic border-width profiles.", recommended: true },
		schema: [],
		messages: {
			rawBorderWidth:
				"Raw border width '{{value}}' is not public API. Consume border-width-thin/default/strong.",
		},
	},
	create(context) {
		if (context.filename.replace(/\\/g, "/").endsWith("/token-profiles.ts")) return {};
		const visitors = createStyleStringVisitors(context, (text, node) => {
			if (isInForeignTokenSubject(node)) return;
			if (hasRawBorderWidth(text)) {
				reportProfileViolation(context, node, "rawBorderWidth", text);
			}
		});
		return {
			JSXAttribute(rawNode: unknown) {
				visitors.jsxAttribute(rawNode);
				const node = rawNode as AstNode;
				if (isInForeignTokenSubject(node)) return;
				const fields = stylePropertyNames(node).filter((name) => RAW_STYLE_FIELDS.test(name));
				if (fields.length > 0) {
					reportProfileViolation(context, node, "rawBorderWidth", fields.join(", "));
				}
			},
			Property: visitors.property,
			VariableDeclarator: visitors.variableDeclarator,
		};
	},
});
