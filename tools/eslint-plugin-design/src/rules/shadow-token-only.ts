/** design/shadow-token-only — AZ15 Hearth elevation vocabulary. */

import type { Rule } from "eslint";
import type { JSXAttribute } from "estree-jsx";
import {
	asReportNode,
	collectClassStringsFromJSXAttributeDeep,
	createConstIdentifierResolver,
	createRule,
} from "../util.js";

const TOKEN_SHADOW = /^shadow-\[var\(--shadow-(?:subtle|default|elevated)\)\]$/;
const STATE_RING = /var\(--(?:accent-[a-z-]+|status-[a-z-]+)-dim\)/;
const SUBJECT_CONTENT_PATHS = [
	"layers/core-ui/src/pages/review/ReviewBrowserPreview.tsx",
	"layers/core-ui/src/pages/review/ReviewRenderedInContext.tsx",
] as const;

function isSubjectContentFile(filename: string): boolean {
	const normalized = filename.replace(/\\/g, "/");
	return SUBJECT_CONTENT_PATHS.some((path) => normalized.endsWith(path));
}

function stripVariants(raw: string): string {
	let token = raw;
	while (/^[^:[\]]+:/.test(token)) token = token.replace(/^[^:[\]]+:/, "");
	return token;
}

function isRawShadowClass(raw: string): boolean {
	const token = stripVariants(raw);
	if (!token.startsWith("shadow")) return false;
	if (token === "shadow-none" || TOKEN_SHADOW.test(token)) return false;
	if (STATE_RING.test(token) && /(?:focus|focus-visible|invalid):/.test(raw)) return false;
	return true;
}

function staticStrings(node: unknown): Array<{ value: string; node: { type: string } }> {
	if (!node || typeof node !== "object") return [];
	const valueNode = node as {
		type?: string;
		value?: unknown;
		consequent?: unknown;
		alternate?: unknown;
	};
	if (valueNode.type === "Literal" && typeof valueNode.value === "string") {
		return [{ value: valueNode.value, node: valueNode as { type: string } }];
	}
	if (valueNode.type === "ConditionalExpression") {
		return [...staticStrings(valueNode.consequent), ...staticStrings(valueNode.alternate)];
	}
	return [];
}

function isInsideStyleAttribute(node: { parent?: unknown }): boolean {
	let current = node.parent as
		| { type?: string; parent?: unknown; name?: { type?: string; name?: string } }
		| undefined;
	while (current) {
		if (current.type === "JSXAttribute") {
			return current.name?.type === "JSXIdentifier" && current.name.name === "style";
		}
		current = current.parent as typeof current;
	}
	return false;
}

export const shadowTokenOnly: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Require shipping Hearth chrome to use none or the subtle/default/elevated shadow tokens.",
			recommended: true,
		},
		schema: [],
		messages: {
			rawShadow:
				"Raw shadow '{{shadow}}' is outside the Hearth elevation vocabulary. Use none or var(--shadow-subtle|default|elevated); state rings and subject-authored content are separate narrow cases.",
		},
	},
	create(context) {
		const resolveIdentifier = createConstIdentifierResolver(context);
		const subjectContent = isSubjectContentFile(context.filename);
		return {
			JSXAttribute(rawNode: unknown) {
				const node = rawNode as JSXAttribute;
				if (node.type !== "JSXAttribute") return;
				const name = node.name.type === "JSXIdentifier" ? node.name.name : null;
				if (name !== "className") return;
				for (const { text, node: stringNode } of collectClassStringsFromJSXAttributeDeep(
					node,
					resolveIdentifier,
				)) {
					for (const raw of text.split(/\s+/).filter(Boolean)) {
						if (isRawShadowClass(raw)) {
							context.report({
								node: asReportNode(stringNode),
								messageId: "rawShadow",
								data: { shadow: stripVariants(raw) },
							});
						}
					}
				}
			},
			Property(rawNode: unknown) {
				if (subjectContent) return;
				const node = rawNode as {
					type: string;
					key?: { type?: string; name?: string; value?: unknown };
					value?: unknown;
					parent?: unknown;
				};
				if (!isInsideStyleAttribute(node)) return;
				const key = node.key;
				const keyName =
					key?.type === "Identifier" ? key.name : key?.type === "Literal" ? key.value : null;
				if (keyName !== "boxShadow") return;
				for (const entry of staticStrings(node.value)) {
					if (
						entry.value === "none" ||
						TOKEN_SHADOW.test(`shadow-[${entry.value}]`) ||
						STATE_RING.test(entry.value)
					)
						continue;
					context.report({
						node: asReportNode(entry.node),
						messageId: "rawShadow",
						data: { shadow: entry.value },
					});
				}
			},
		};
	},
});
