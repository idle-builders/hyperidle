import type { Rule } from "eslint";
import {
	asReportNode,
	collectClassStringsFromExpressionDeep,
	collectClassStringsFromJSXAttributeDeep,
	createConstIdentifierResolver,
	type IdentifierResolver,
} from "../util.js";

type AstNode = { type: string; parent?: AstNode; [key: string]: unknown };

function jsxAttributeName(node: AstNode): string | null {
	if (node.type !== "JSXAttribute") return null;
	const name = node.name as { type?: string; name?: string } | undefined;
	return name?.type === "JSXIdentifier" ? (name.name ?? null) : null;
}

function hasForeignMarker(opening: AstNode): boolean {
	const attributes = (opening.attributes as AstNode[] | undefined) ?? [];
	return attributes.some((attribute) => {
		if (jsxAttributeName(attribute) !== "data-token-subject") return false;
		const value = attribute.value as { type?: string; value?: unknown } | undefined;
		return value?.type === "Literal" && value.value === "foreign";
	});
}

/** Foreign content exempts only color, typography, and border declarations in its subtree. */
export function isInForeignTokenSubject(node: AstNode): boolean {
	let current: AstNode | undefined = node;
	while (current) {
		if (current.type === "JSXElement") {
			const opening = current.openingElement as AstNode | undefined;
			if (opening && hasForeignMarker(opening)) return true;
		}
		current = current.parent;
	}
	return false;
}

function staticPropertyName(node: AstNode): string | null {
	const key = node.key as { type?: string; name?: string; value?: unknown } | undefined;
	if (key?.type === "Identifier") return key.name ?? null;
	if (key?.type === "Literal" && typeof key.value === "string") return key.value;
	return null;
}

export function stylePropertyNames(attribute: AstNode): string[] {
	if (jsxAttributeName(attribute) !== "style") return [];
	const value = attribute.value as AstNode | undefined;
	if (value?.type !== "JSXExpressionContainer") return [];
	const expression = value.expression as AstNode | undefined;
	if (expression?.type !== "ObjectExpression") return [];
	const properties = (expression.properties as AstNode[] | undefined) ?? [];
	return properties
		.filter((property) => property.type === "Property")
		.map(staticPropertyName)
		.filter((name): name is string => name !== null);
}

export interface StyleStringVisitors {
	jsxAttribute: (node: unknown) => void;
	property: (node: unknown) => void;
	variableDeclarator: (node: unknown) => void;
}

export function createStyleStringVisitors(
	context: Rule.RuleContext,
	check: (text: string, node: AstNode) => void,
): StyleStringVisitors {
	const resolveIdentifier: IdentifierResolver = createConstIdentifierResolver(context);
	return {
		jsxAttribute(rawNode: unknown) {
			const node = rawNode as AstNode;
			if (jsxAttributeName(node) !== "className") return;
			for (const item of collectClassStringsFromJSXAttributeDeep(node, resolveIdentifier)) {
				check(item.text, item.node as AstNode);
			}
		},
		variableDeclarator(rawNode: unknown) {
			const node = rawNode as AstNode;
			const id = node.id as { type?: string; name?: string } | undefined;
			if (id?.type !== "Identifier" || !/(?:class|style|motion|transition)/i.test(id.name ?? "")) {
				return;
			}
			for (const item of collectClassStringsFromExpressionDeep(node.init, resolveIdentifier)) {
				check(item.text, item.node as AstNode);
			}
		},
		property(rawNode: unknown) {
			const node = rawNode as AstNode;
			const name = staticPropertyName(node);
			if (name !== "className") return;
			for (const item of collectClassStringsFromExpressionDeep(node.value, resolveIdentifier)) {
				check(item.text, item.node as AstNode);
			}
		},
	};
}

export function reportProfileViolation(
	context: Rule.RuleContext,
	node: AstNode,
	messageId: string,
	value: string,
): void {
	context.report({ node: asReportNode(node), messageId, data: { value } });
}
