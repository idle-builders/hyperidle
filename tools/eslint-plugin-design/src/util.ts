/**
 * Shared helpers for design-lint rules.
 */

import type { JSSyntaxElement, Rule, Scope } from "eslint";
import type { Node as ESTreeNode } from "estree";
import type { JSXAttribute } from "estree-jsx";

/**
 * Class-name string extractor: returns the literal text of `className="..."`.
 * Returns null if the JSXAttribute value is not a static string literal we can
 * parse.
 */
export function getClassNameLiteral(attr: JSXAttribute | null): string | null {
	if (!attr) return null;
	if (attr.type !== "JSXAttribute") return null;
	const v = attr.value;
	if (!v) return null;
	const vAny = v as { type?: string; value?: unknown };
	if (vAny.type === "Literal" && typeof vAny.value === "string") {
		return vAny.value as string;
	}
	return null;
}

/**
 * Resolves a bare `Identifier` to the initializer expression of the single
 * same-file `const` it is bound to, using ESLint's scope manager.
 */
export type IdentifierResolver = (identifierNode: unknown) => { type: string } | null;

/**
 * Builds an `IdentifierResolver` bound to a specific rule's `context`.
 */
export function createConstIdentifierResolver(context: Rule.RuleContext): IdentifierResolver {
	return (identifierNode: unknown): { type: string } | null => {
		const node = identifierNode as { type?: string; name?: string };
		if (node?.type !== "Identifier" || typeof node.name !== "string") return null;
		const scope: Scope.Scope = context.sourceCode.getScope(identifierNode as ESTreeNode);
		let cur: Scope.Scope | null = scope;
		let variable: Scope.Variable | undefined;
		while (cur) {
			variable = cur.variables.find((v) => v.name === node.name);
			if (variable) break;
			cur = cur.upper;
		}
		if (!variable) return null;
		if (variable.defs.length !== 1) return null;
		const def = variable.defs[0];
		if (def?.type !== "Variable") return null;
		const declaration = (def as { parent?: { kind?: string } }).parent;
		if (declaration?.kind !== "const") return null;
		const writes = variable.references.filter((r) => r.isWrite());
		if (writes.length !== 1) return null;
		const declarator = def.node as { init?: { type: string } } | null;
		return declarator?.init ?? null;
	};
}

/**
 * Tiny helper so each rule can build a Rule.RuleModule without ts-eslint Utils.
 */
export function createRule(rule: Rule.RuleModule): Rule.RuleModule {
	return rule;
}

/**
 * Cast any ESTree / estree-jsx node to `JSSyntaxElement` for passing to
 * `context.report({ node })`. This is the single audited boundary replacing
 * all `node as unknown as Rule.Node` casts in rule files.
 *
 * @lore refactor/no-unknown-cast-eslint-plugins: Replaces all `node as unknown
 * as Rule.Node` double-casts spread across rule files. Centralising the cast
 * makes it auditable and eliminates the `unknown` intermediate.
 */
export function asReportNode(node: { type: string }): JSSyntaxElement {
	return node as JSSyntaxElement;
}
