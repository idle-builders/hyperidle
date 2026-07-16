/**
 * authz/no-raw-db-in-route-bypassing-policy
 *
 * Flags a participant-scope route handler (declared requireBoundary({ kind: "enforced" }))
 * that performs a db.select/insert/update/delete without a corresponding
 * authorizeRead/authorizeWrite call in the same handler.
 *
 * @lore AF11: Narrow scope to avoid false positives on host-scope public-data routes.
 * High precision over recall (architecture §60). Runtime fail-closed assertion +
 * integration tests cover what the lint can't see statically.
 *
 * @lore AF11: Detection is scoped to Hono instance variables only (tracks `new Hono(...)`)
 * to avoid false positives on c.get(...), map.get(key), etc.
 *
 * Detection:
 *   1. Track `const router = new Hono(...)` declarations.
 *   2. Find router.method(path, ..., handlerFn) where one of the non-path args
 *      is requireBoundary({ kind: "enforced" }).
 *   3. In the handler function body, check if db.select/insert/update/delete appears.
 *   4. If so, also check for authorizeRead/authorizeWrite in the same body.
 *   5. If DB call is present but authz call is absent → flag the route call.
 */

import type { Rule } from "eslint";
import type { ArrowFunctionExpression, CallExpression, FunctionExpression, Node } from "estree";

const ROUTE_METHODS = new Set(["get", "post", "patch", "put", "delete"]);
const DB_METHODS = new Set(["select", "insert", "update", "delete"]);
const AUTHZ_FNS = new Set(["authorizeRead", "authorizeWrite"]);

/**
 * Returns true if the call looks like a Hono route registration:
 *   identifier.method(pathString, [...middlewares], handlerFn)
 * Same pattern as require-boundary-declaration to avoid false positives.
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
	// First arg must be a string literal (route path)
	const firstArg = args[0] as (typeof args)[number] | undefined;
	if (firstArg?.type !== "Literal") return false;
	if (typeof (firstArg as { value?: unknown }).value !== "string") return false;
	// Last arg must be a function (route handler)
	const lastArg = args[args.length - 1] as (typeof args)[number] | undefined;
	if (!lastArg) return false;
	return lastArg.type === "ArrowFunctionExpression" || lastArg.type === "FunctionExpression";
}

/** Returns true if this arg is requireBoundary({ kind: "enforced" }) */
function isEnforcedBoundary(node: Node): boolean {
	if (node.type !== "CallExpression") return false;
	const call = node as CallExpression;
	const callee = call.callee;
	if (callee.type !== "Identifier" || callee.name !== "requireBoundary") return false;
	if (call.arguments.length === 0) return false;
	const arg0 = call.arguments[0] as (typeof call.arguments)[number] | undefined;
	if (arg0?.type !== "ObjectExpression") return false;
	// Find the `kind` property
	for (const prop of arg0.properties) {
		if (prop.type !== "Property") continue;
		const key = prop.key;
		if (key.type !== "Identifier" || key.name !== "kind") continue;
		const val = prop.value;
		if (val.type === "Literal" && val.value === "enforced") return true;
	}
	return false;
}

/**
 * Walks a node tree and returns true if it contains a call to
 * any of the specified function names (direct or member call).
 */
function containsCallTo(node: Node, names: Set<string>): boolean {
	if (node.type === "CallExpression") {
		const call = node as CallExpression;
		const callee = call.callee;
		if (callee.type === "Identifier" && names.has(callee.name)) return true;
		if (
			callee.type === "MemberExpression" &&
			callee.property.type === "Identifier" &&
			names.has(callee.property.name)
		)
			return true;
		// Recurse into args
		for (const a of call.arguments) {
			if (containsCallTo(a as Node, names)) return true;
		}
		// Recurse into callee (handles chained calls: db.insert(x).values(y))
		if (containsCallTo(callee as Node, names)) return true;
	}

	// Generic child traversal
	const children = getChildren(node);
	for (const child of children) {
		if (containsCallTo(child, names)) return true;
	}
	return false;
}

/** Extract child nodes for common node types */
function getChildren(node: Node): Node[] {
	const children: Node[] = [];
	switch (node.type) {
		case "BlockStatement":
			children.push(...(node.body as Node[]));
			break;
		case "ExpressionStatement":
			children.push(node.expression as Node);
			break;
		case "VariableDeclaration":
			children.push(...(node.declarations as Node[]));
			break;
		case "VariableDeclarator":
			if (node.init) children.push(node.init as Node);
			break;
		case "ArrowFunctionExpression":
		case "FunctionExpression":
		case "FunctionDeclaration":
			children.push(node.body as Node);
			break;
		case "ReturnStatement":
			if (node.argument) children.push(node.argument as Node);
			break;
		case "IfStatement":
			children.push(node.test as Node);
			children.push(node.consequent as Node);
			if (node.alternate) children.push(node.alternate as Node);
			break;
		case "AwaitExpression":
			children.push(node.argument as Node);
			break;
		case "MemberExpression":
			children.push(node.object as Node);
			break;
		case "AssignmentExpression":
			children.push(node.right as Node);
			break;
		case "ArrayExpression":
			for (const el of node.elements) {
				if (el) children.push(el as Node);
			}
			break;
		case "ObjectExpression":
			for (const prop of node.properties) {
				children.push(prop as Node);
			}
			break;
		case "Property":
			children.push(node.value as Node);
			break;
		case "LogicalExpression":
		case "BinaryExpression":
			children.push(node.left as Node, node.right as Node);
			break;
		case "ConditionalExpression":
			children.push(node.test as Node, node.consequent as Node, node.alternate as Node);
			break;
	}
	return children;
}

export const noRawDbInRouteBypassingPolicy: Rule.RuleModule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"route reads/writes scoped data via raw DB query without routing through the access-boundary policy",
			recommended: true,
		},
		messages: {
			rawDbBypassesPolicy:
				"route reads/writes scoped data via raw DB query (db.select/insert/update/delete) without calling authorizeRead or authorizeWrite. Add the access-boundary check before returning data.",
		},
		schema: [],
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

				const args = node.arguments;
				if (args.length < 2) return;

				// Check if any non-path arg is requireBoundary({ kind: "enforced" })
				let isEnforced = false;
				let handlerBody: Node | null = null;

				for (let i = 1; i < args.length; i++) {
					const arg = args[i] as Node;
					if (isEnforcedBoundary(arg)) {
						isEnforced = true;
					}
					if (arg.type === "ArrowFunctionExpression" || arg.type === "FunctionExpression") {
						const fn = arg as ArrowFunctionExpression | FunctionExpression;
						handlerBody = fn.body as Node;
					}
				}

				if (!(isEnforced && handlerBody)) return;

				// Check if the handler body contains a db.* call
				const hasDbCall = containsCallTo(handlerBody, DB_METHODS);
				if (!hasDbCall) return;

				// Check if the handler body also calls authorizeRead/authorizeWrite
				const hasAuthzCall = containsCallTo(handlerBody, AUTHZ_FNS);
				if (!hasAuthzCall) {
					context.report({ node: node as Rule.Node, messageId: "rawDbBypassesPolicy" });
				}
			},
		};
	},
};
