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
	/^border(?:(?:Top|Right|Bottom|Left|Inline|InlineStart|InlineEnd|Block|BlockStart|BlockEnd)(?:Width)?|Width)?$/;
const PROFILE_VALUE =
	/^(?:none|var\(--bw-(?:thin|default|strong)\)(?:\s+\w+\s+.+)?|BORDER_WIDTH_STYLE\.(?:thin|default|strong))$/;

function hasRawBorderWidth(text: string): boolean {
	return text.split(/\s+/).some((raw) => {
		const token = raw.replace(/^(?:[a-z-]+:)+/, "");
		if (token === "border-none") return false;
		// Old Tailwind v4 syntax — kept for backward compat; note that
		// border-[var(--bw-*)] resolves to border-color in v4 (not border-width).
		// Prefer the @utility class approach (border-width-thin/default/strong) instead.
		if (/^border(?:-(?:x|y|t|r|b|l|s|e))?-\[var\(--bw-(?:thin|default|strong)\)\]$/.test(token))
			return false;
		// @lore Tailwind v4: `border-[var(--bw-*)]` sets border-color, not border-width.
		// Use `border-width-thin/default/strong` (@utility in tokens.css) for correct
		// border-width via CSS variable. These are the only allowed border-width classes.
		if (/^border-width-(?:thin|default|strong)$/.test(token)) return false;
		if (/^border(?:-(?:x|y|t|r|b|l|s|e))?$/.test(token)) return true;
		if (/^border(?:-(?:x|y|t|r|b|l|s|e))?-(?:0|2|4|8)$/.test(token)) return true;
		if (/^border-width-/.test(token)) return true;
		return /^border(?:-(?:x|y|t|r|b|l|s|e))?-\[(?:\d|length:|var\(--bw-)/.test(token);
	});
}

function rawInlineBorderFields(context: Rule.RuleContext, node: AstNode): string[] {
	const fields = stylePropertyNames(node).filter((name) => RAW_STYLE_FIELDS.test(name));
	if (fields.length === 0) return [];
	const text = context.sourceCode.getText(node as Rule.Node);
	return fields.filter((field) => {
		const match = new RegExp(
			`${field}\\s*:\\s*(?:["'\x60]([^"'\x60]+)["'\x60]|([A-Z_]+\\.[a-z-]+))`,
		).exec(text);
		if (match && PROFILE_VALUE.test(match[1] ?? match[2] ?? "")) return false;
		return !new RegExp(`${field}[\\s\\S]*var\\(--bw-(?:thin|default|strong)\\)`).test(text);
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
				const fields = rawInlineBorderFields(context, node);
				if (fields.length > 0) {
					reportProfileViolation(context, node, "rawBorderWidth", fields.join(", "));
				}
			},
			Property: visitors.property,
			VariableDeclarator: visitors.variableDeclarator,
		};
	},
});
