/** design/shadow-token-only — Hearth elevation vocabulary. */

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
function stripVariants(raw: string): string {
	let depth = 0;
	let lastVariant = -1;
	for (let index = 0; index < raw.length; index += 1) {
		const character = raw[index];
		if (character === "[") depth += 1;
		else if (character === "]") depth = Math.max(0, depth - 1);
		else if (character === ":" && depth === 0) lastVariant = index;
	}
	return raw.slice(lastVariant + 1);
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
	if (valueNode.type === "TemplateLiteral") {
		return [{ value: "<dynamic-template-shadow>", node: valueNode as { type: string } }];
	}
	return [];
}

type ParentNode = {
	type?: string;
	parent?: unknown;
	attributes?: Array<{
		type?: string;
		name?: { type?: string; name?: string };
		value?: { type?: string; value?: unknown } | null;
	}>;
};

function isInsideSubjectNode(node: object): boolean {
	let current = (node as ParentNode).parent as ParentNode | undefined;
	while (current) {
		if (
			current.type === "JSXOpeningElement" &&
			current.attributes?.some(
				(attribute) =>
					attribute.type === "JSXAttribute" &&
					attribute.name?.type === "JSXIdentifier" &&
					attribute.name.name === "data-shadow-subject" &&
					attribute.value?.type === "Literal" &&
					attribute.value.value === "true",
			)
		)
			return true;
		current = current.parent as ParentNode | undefined;
	}
	return false;
}

function hasRawStylesheetShadow(text: string): boolean {
	for (const match of text.matchAll(/box-shadow\s*:\s*([^;}]+)/gi)) {
		const value = match[1]?.trim() ?? "";
		if (
			value !== "none" &&
			!/^var\(--shadow-(?:subtle|default|elevated)\)$/.test(value) &&
			!STATE_RING.test(value)
		)
			return true;
	}
	return false;
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
		return {
			JSXAttribute(rawNode: unknown) {
				const node = rawNode as JSXAttribute;
				if (node.type !== "JSXAttribute") return;
				const name = node.name.type === "JSXIdentifier" ? node.name.name : null;
				if (name !== "className") return;
				if (isInsideSubjectNode(node)) return;
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
				const node = rawNode as {
					type: string;
					key?: { type?: string; name?: string; value?: unknown };
					value?: unknown;
					parent?: unknown;
				};
				if (!isInsideStyleAttribute(node)) return;
				if (isInsideSubjectNode(node)) return;
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
			Literal(rawNode: unknown) {
				const node = rawNode as { type: string; value?: unknown; parent?: unknown };
				if (typeof node.value !== "string" || !hasRawStylesheetShadow(node.value)) return;
				if (isInsideSubjectNode(node)) return;
				context.report({
					node: asReportNode(node),
					messageId: "rawShadow",
					data: { shadow: "box-shadow declaration" },
				});
			},
			TemplateElement(rawNode: unknown) {
				const node = rawNode as {
					type: string;
					value?: { cooked?: string | null; raw?: string };
					parent?: unknown;
				};
				const text = node.value?.cooked ?? node.value?.raw ?? "";
				if (!hasRawStylesheetShadow(text) || isInsideSubjectNode(node)) return;
				context.report({
					node: asReportNode(node),
					messageId: "rawShadow",
					data: { shadow: "box-shadow declaration" },
				});
			},
		};
	},
});
