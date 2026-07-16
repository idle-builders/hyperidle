/**
 * authz/require-boundary-declaration
 *
 * Flags a data-route handler (router.get/post/patch/put/delete) in a
 * routes/*.ts file that neither wraps with requireBoundary(...) nor calls
 * authorizeRead/authorizeWrite, unless the route is on the explicit exempt
 * allowlist.
 *
 * @lore AF11: Deny-by-default in the lint. A brand-new route file under
 * packages/server/src/routes/ is automatically in scope. The exempt list is
 * a positive enumeration (no wildcards). Hard Rule 6: undeclared routes fail
 * closed.
 *
 * @lore AF11: Detection avoids false positives on `c.get("userId")`, `map.get(key)` etc.
 * by requiring the call pattern: identifier.method(string, ..., fn) where:
 *   - first arg is a string literal (route path)
 *   - last arg is an ArrowFunctionExpression or FunctionExpression (route handler)
 * This pattern is unique to Hono route registrations and not present in Drizzle queries,
 * Map.get calls, or other common method calls.
 *
 * Detection:
 *   A route handler is: router.method(path, [...middlewares], handlerFn)
 *   Valid if ANY of the non-path arguments is a requireBoundary(...) call,
 *   OR if the handler's body contains a call to authorizeRead/authorizeWrite.
 *   Otherwise: flag the route call expression.
 */

import type { Rule } from "eslint";
import type { ArrowFunctionExpression, CallExpression, FunctionExpression, Node } from "estree";

const ROUTE_METHODS = new Set(["get", "post", "patch", "put", "delete"]);
const AUTHZ_FNS = new Set(["authorizeRead", "authorizeWrite", "requireBoundary"]);

/**
 * Returns true if the node or any of its descendants contains a call
 * to one of the AUTHZ_FNs.
 */
function containsAuthzCall(node: Node): boolean {
	if (node.type === "CallExpression") {
		const call = node as CallExpression;
		const callee = call.callee;
		// Direct call: requireBoundary(...) or authorizeRead(...)
		if (callee.type === "Identifier" && AUTHZ_FNS.has(callee.name)) {
			return true;
		}
		// Member call: something.requireBoundary(...)
		if (
			callee.type === "MemberExpression" &&
			callee.property.type === "Identifier" &&
			AUTHZ_FNS.has(callee.property.name)
		) {
			return true;
		}
		// Recurse into arguments
		for (const arg of call.arguments) {
			if (containsAuthzCall(arg as Node)) return true;
		}
	}

	// Recurse into body nodes
	if ("body" in node && node.body !== null && node.body !== undefined) {
		const body = node.body as Node | Node[];
		if (Array.isArray(body)) {
			for (const child of body) {
				if (containsAuthzCall(child as Node)) return true;
			}
		} else if (containsAuthzCall(body)) return true;
	}
	if ("expression" in node && node.type === "ExpressionStatement") {
		const expr = (node as { expression: Node }).expression;
		if (containsAuthzCall(expr)) return true;
	}
	if ("declarations" in node) {
		const decls = (node as { declarations: Node[] }).declarations;
		for (const d of decls) {
			if (containsAuthzCall(d)) return true;
		}
	}
	if ("init" in node && (node as { init?: Node | null }).init) {
		if (containsAuthzCall((node as { init: Node }).init)) return true;
	}
	if ("consequent" in node) {
		if (containsAuthzCall((node as { consequent: Node }).consequent)) return true;
	}
	if ("alternate" in node && (node as { alternate?: Node | null }).alternate) {
		if (containsAuthzCall((node as { alternate: Node }).alternate)) return true;
	}
	if ("argument" in node && (node as { argument?: Node | null }).argument) {
		if (containsAuthzCall((node as { argument: Node }).argument)) return true;
	}

	return false;
}

/**
 * Checks if the route call has an authz declaration.
 * The args to router.method are: (path, [...middlewares], handler)
 * path is always the first arg (string). Remaining args are middlewares + handler.
 */
function hasBoundaryDeclaration(node: CallExpression): boolean {
	const args = node.arguments;
	if (args.length < 2) return false;

	// Check all non-path arguments (index 1+)
	for (let i = 1; i < args.length; i++) {
		const arg = args[i] as Node;
		// Is this arg a requireBoundary(...) call?
		if (arg.type === "CallExpression") {
			const call = arg as CallExpression;
			const callee = call.callee;
			if (callee.type === "Identifier" && AUTHZ_FNS.has(callee.name)) {
				return true;
			}
		}
		// Is this a handler function that contains an authz call?
		if (arg.type === "ArrowFunctionExpression" || arg.type === "FunctionExpression") {
			const fn = arg as ArrowFunctionExpression | FunctionExpression;
			if (containsAuthzCall(fn.body as Node)) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Returns true if the call expression looks like a Hono route registration:
 *   identifier.method(pathString, [...middlewares], handlerFn)
 * Requirements:
 *   - callee is a MemberExpression with Identifier object and route-method name
 *   - at least 2 args (path + handler)
 *   - first arg is a string literal (route path)
 *   - last arg is an ArrowFunctionExpression or FunctionExpression (route handler)
 * This pattern avoids false positives on c.get("userId"), map.get(key), etc.
 */
function isRouteCall(node: CallExpression): boolean {
	const callee = node.callee;
	if (callee.type !== "MemberExpression") return false;
	const obj = callee.object;
	const method = callee.property;
	if (obj.type !== "Identifier") return false;
	if (method.type !== "Identifier") return false;
	if (!ROUTE_METHODS.has(method.name)) return false;

	const args = node.arguments;
	if (args.length < 2) return false;

	// First arg must be a string literal (the route path)
	const firstArg = args[0] as (typeof args)[number] | undefined;
	if (firstArg?.type !== "Literal") return false;
	// estree Literal.value may be string | number | boolean | null | RegExp | bigint
	if (typeof (firstArg as { value?: unknown }).value !== "string") return false;

	// Last arg must be a function (the route handler)
	const lastArg = args[args.length - 1] as (typeof args)[number] | undefined;
	if (!lastArg) return false;
	if (lastArg.type !== "ArrowFunctionExpression" && lastArg.type !== "FunctionExpression") {
		return false;
	}

	return true;
}

export const requireBoundaryDeclaration: Rule.RuleModule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"data route must declare an access boundary; undeclared routes fail closed (Hard Rule 6)",
			recommended: true,
		},
		messages: {
			missingBoundary:
				"data route must declare an access boundary via requireBoundary(...) or authorizeRead/authorizeWrite. Undeclared routes fail closed (Hard Rule 6).",
		},
		schema: [
			{
				type: "object",
				properties: {
					exemptPatterns: {
						type: "array",
						items: { type: "string" },
					},
				},
				additionalProperties: false,
			},
		],
	},
	create(context) {
		// Only applies to files under packages/server/src/routes/
		// @lore AF11: ESLint 10 flat-config removed context.getFilename(). Use context.filename (property, not method).
		// @lore refactor/no-unknown-cast-eslint-plugins: context.filename is typed as string in Rule.RuleContext
		// (via CoreRuleContext from @eslint/core). The getFilename() fallback was dead code — removed.
		const filename = context.filename ?? "";
		if (!filename.includes("routes/")) return {};

		return {
			CallExpression(node: CallExpression) {
				if (!isRouteCall(node)) return;
				if (!hasBoundaryDeclaration(node)) {
					context.report({ node: node as Rule.Node, messageId: "missingBoundary" });
				}
			},
		};
	},
};
