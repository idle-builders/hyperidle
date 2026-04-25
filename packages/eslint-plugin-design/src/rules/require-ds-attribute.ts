/**
 * design/require-ds-attribute
 *
 * Maps to K2 marker contract (see ds-attrs.ts). Fires only inside
 * `packages/design-system/src/**`. Looks at default-exported function
 * components and asserts that the outermost JSX element either carries
 * `data-ds-component` directly or spreads `dsProps(...)` / `dsShellProps(...)`.
 */

import type { Rule } from "eslint";
import type {
	ArrowFunctionExpression,
	ExportDefaultDeclaration,
	FunctionDeclaration,
	FunctionExpression,
	JSXElement,
	JSXFragment,
	Node,
	ReturnStatement,
} from "estree-jsx";
import { createRule } from "../util.js";

type Component =
	| FunctionDeclaration
	| FunctionExpression
	| ArrowFunctionExpression;

function findOutermostJSX(node: Component): JSXElement | JSXFragment | null {
	if (node.type === "ArrowFunctionExpression" && node.body.type !== "BlockStatement") {
		const body = node.body as Node;
		if (body.type === "JSXElement" || body.type === "JSXFragment") {
			return body as JSXElement | JSXFragment;
		}
		return null;
	}
	const body = (node.body as { body?: Node[] }).body;
	if (!Array.isArray(body)) return null;
	for (const stmt of body) {
		if (stmt.type === "ReturnStatement") {
			const arg = (stmt as ReturnStatement).argument;
			if (arg && (arg.type === "JSXElement" || arg.type === "JSXFragment")) {
				return arg as JSXElement | JSXFragment;
			}
		}
	}
	return null;
}

function hasDsAttribute(jsx: JSXElement): boolean {
	for (const attr of jsx.openingElement.attributes) {
		if (attr.type === "JSXSpreadAttribute") {
			const arg = attr.argument as Node;
			// {...dsProps("Name", "1")} or {...dsShellProps("Name")}
			if (
				arg.type === "CallExpression" &&
				arg.callee.type === "Identifier" &&
				(arg.callee.name === "dsProps" || arg.callee.name === "dsShellProps")
			) {
				return true;
			}
		} else if (attr.type === "JSXAttribute") {
			const name =
				attr.name.type === "JSXIdentifier"
					? attr.name.name
					: attr.name.type === "JSXNamespacedName"
						? attr.name.name.name
						: null;
			if (name === "data-ds-component" || name === "data-ds-shell") {
				return true;
			}
		}
	}
	return false;
}

export const requireDsAttribute: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Default-exported components in packages/design-system/src/ must mark their outermost JSX with data-ds-component (or spread dsProps/dsShellProps).",
			recommended: true,
		},
		schema: [],
		messages: {
			missing:
				"Outermost JSX of default-exported design-system component lacks data-ds-component.  → fix: spread {...dsProps('ComponentName', '1' | '2')} or add data-ds-component='ComponentName' on the root element.",
		},
	},
	create(context) {
		const filename = context.filename ?? context.getFilename();
		// Only fire inside packages/design-system/src/*.tsx — the rule is a
		// marker contract for design-system primitives.
		if (
			!/packages\/design-system\/src\/[^/]+\.tsx$/.test(filename) &&
			!filename.endsWith("__ds_component_test__.tsx")
		) {
			return {};
		}
		return {
			ExportDefaultDeclaration(node: ExportDefaultDeclaration) {
				const decl = node.declaration as Node;
				let component: Component | null = null;
				if (
					decl.type === "FunctionDeclaration" ||
					decl.type === "ArrowFunctionExpression" ||
					decl.type === "FunctionExpression"
				) {
					component = decl as Component;
				} else if (decl.type === "Identifier") {
					// `export default Foo` — try to find the binding declaration.
					const sourceCode = context.sourceCode ?? context.getSourceCode();
					const scope = sourceCode.getScope(node);
					const variable = scope.references
						.find((r) => r.identifier.name === (decl as { name: string }).name)
						?.resolved;
					const def = variable?.defs[0];
					if (def && def.node.type === "VariableDeclarator") {
						const init = def.node.init as Node | null | undefined;
						if (
							init &&
							(init.type === "ArrowFunctionExpression" ||
								init.type === "FunctionExpression")
						) {
							component = init as Component;
						}
					} else if (def && def.node.type === "FunctionDeclaration") {
						component = def.node as Component;
					}
				}
				if (!component) return;
				const jsx = findOutermostJSX(component);
				if (!jsx) return;
				if (jsx.type === "JSXFragment") {
					context.report({ node: jsx, messageId: "missing" });
					return;
				}
				if (!hasDsAttribute(jsx)) {
					context.report({ node: jsx, messageId: "missing" });
				}
			},
		};
	},
});
