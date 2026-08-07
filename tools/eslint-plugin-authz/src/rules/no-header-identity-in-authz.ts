/**
 * authz/no-header-identity-in-authz
 *
 * Flags a value read from c.req.header(...) flowing into an authz sink
 * (canRead, canWrite, authorizeRead, authorizeWrite).
 *
 * @lore AF11: The rule keys on a closed AUTHZ_SINKS set, not on a generic
 * BinaryExpression heuristic. Authorization must read c.get("userId") — Hard Rule 2.
 * Detection: trace a c.req.header(...) result (directly, or through a single
 * intermediate const binding) into a CallExpression whose callee ∈ AUTHZ_SINKS.
 *
 * R5 attribution exemption: c.req.header() feeding store.issue (ws-token mint)
 * is NOT in AUTHZ_SINKS, so the rule does not flag it — by design.
 */

import type { Rule } from "eslint";
import type { CallExpression, Node, VariableDeclarator } from "estree";

const AUTHZ_SINKS = new Set(["canRead", "canWrite", "authorizeRead", "authorizeWrite"]);

/** Returns true if the node is a c.req.header(...) CallExpression. */
function isHeaderCall(node: Node): boolean {
	if (node.type !== "CallExpression") return false;
	const call = node as CallExpression;
	const callee = call.callee;
	// Match: c.req.header(...)
	// callee is MemberExpression: { object: MemberExpression {object: Identifier, property: "req"}, property: "header" }
	if (callee.type !== "MemberExpression") return false;
	if (callee.property.type !== "Identifier" || callee.property.name !== "header") return false;
	const reqExpr = callee.object;
	if (reqExpr.type !== "MemberExpression") return false;
	if (reqExpr.property.type !== "Identifier" || reqExpr.property.name !== "req") return false;
	return true;
}

/** Returns the callee name of a CallExpression, or null. */
function getCalleeName(node: CallExpression): string | null {
	const callee = node.callee;
	if (callee.type === "Identifier") return callee.name;
	if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
		return callee.property.name;
	}
	return null;
}

export const noHeaderIdentityInAuthz: Rule.RuleModule = {
	meta: {
		type: "problem",
		docs: {
			description: "authorization must read c.get('userId'), never a request header (Hard Rule 2)",
			recommended: true,
		},
		messages: {
			noHeaderInAuthz:
				"authorization must read c.get('userId'), never a request header (Hard Rule 2). Remove the header-derived value from the authz sink call.",
		},
		schema: [],
	},
	create(context) {
		// Track const bindings that hold a c.req.header(...) value
		// Map from variable name → node
		const headerBindings = new Set<string>();

		return {
			VariableDeclarator(node: VariableDeclarator) {
				// const x = c.req.header(...)
				if (node.id.type !== "Identifier") return;
				if (!node.init) return;
				if (isHeaderCall(node.init as Node)) {
					headerBindings.add(node.id.name);
				}
			},

			CallExpression(node: CallExpression) {
				const calleeName = getCalleeName(node);
				if (!(calleeName && AUTHZ_SINKS.has(calleeName))) return;

				// Check each argument for header-derived values
				for (const arg of node.arguments) {
					// Direct: canRead(c.req.header(...), resource)
					if (isHeaderCall(arg as Node)) {
						context.report({ node: node as Rule.Node, messageId: "noHeaderInAuthz" });
						return;
					}
					// Indirect via binding: const id = c.req.header(...); canRead(id, ...)
					if (arg.type === "Identifier" && headerBindings.has(arg.name)) {
						context.report({ node: node as Rule.Node, messageId: "noHeaderInAuthz" });
						return;
					}
				}
			},
		};
	},
};
