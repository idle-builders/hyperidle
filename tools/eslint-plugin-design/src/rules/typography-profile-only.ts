import type { Rule } from "eslint";
import { createRule } from "../util.js";
import {
	createStyleStringVisitors,
	isInForeignTokenSubject,
	reportProfileViolation,
	stylePropertyNames,
} from "./profile-rule-utils.js";

type AstNode = { type: string; parent?: AstNode; [key: string]: unknown };

const RAW_TYPE_TOKEN =
	/(?:^|\s)(?:[a-z-]+:)*(?:font-(?:sans|mono|thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[(?:\d+|var\(--font-[^)]+\)|[^\]]*,[^\]]*)\])|text-(?:xs|sm|base|lg|xl|2xl|3xl|\[(?:length:)?(?:-?\d|var\(--text-(?:xs|sm|base|lg|xl|2xl|3xl)\))[^\]]*\])|leading-(?:none|tight|snug|normal|relaxed|loose|\[[^\]]+\])|tracking-(?:tighter|tight|normal|wide|wider|widest|\[[^\]]+\])|\[letter-spacing:[^\]]+\])/;

const RAW_STYLE_FIELDS = new Set([
	"font",
	"fontFamily",
	"fontSize",
	"fontWeight",
	"letterSpacing",
	"lineHeight",
]);

export const typographyProfileOnly: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: { description: "Require one complete semantic typography profile.", recommended: true },
		schema: [],
		messages: {
			rawTypography:
				"Raw typography '{{value}}' is not public API. Consume one type-<role> profile or TYPE_STYLE.<role>.",
		},
	},
	create(context) {
		if (context.filename.replace(/\\/g, "/").endsWith("/token-profiles.ts")) return {};
		const visitors = createStyleStringVisitors(context, (text, node) => {
			if (isInForeignTokenSubject(node)) return;
			if (RAW_TYPE_TOKEN.test(text)) {
				reportProfileViolation(context, node, "rawTypography", text);
			}
		});
		return {
			JSXAttribute(rawNode: unknown) {
				visitors.jsxAttribute(rawNode);
				const node = rawNode as AstNode;
				if (isInForeignTokenSubject(node)) return;
				const fields = stylePropertyNames(node).filter((name) => RAW_STYLE_FIELDS.has(name));
				if (fields.length > 0) {
					reportProfileViolation(context, node, "rawTypography", fields.join(", "));
				}
			},
			Property: visitors.property,
			VariableDeclarator: visitors.variableDeclarator,
		};
	},
});
