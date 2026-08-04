/**
 * design/no-ungated-stream-drain — classifying lint guard (AC4 static).
 *
 * Classifies every `for await ... of <streamEvents-iterable>` loop into one of
 * three kinds and enforces per-kind:
 *
 *   TURN-DRAIN:   loop body must call `<gate>.observe(event)` AND the
 *                 enclosing function must call `evaluateReturn(...)`.
 *                 A violation means a future turn drain forgot the gate.
 *
 *   RELAY:        loop is annotated with a leading `// return-relay` comment.
 *                 Must NOT call `observe` — the turn is already gated at the
 *                 parent enforced drain.
 *
 *   EXEMPT:       loop is annotated with a leading `// return-exempt: internal-
 *                 extraction drain` comment. Must NOT require `observe` — the
 *                 SessionConfig.tools is [] and a return action is impossible.
 *
 * The rule targets `for await` loops whose iterable is either:
 *   (A) a direct `.streamEvents(...)` CallExpression in the for-of RHS, OR
 *   (B) an Identifier that is bound in the same function scope to a
 *       `<x>.streamEvents(...)` CallExpression (one-hop `const stream = ...`).
 *
 * Per the architecture critique's binding builder note: both shapes are matched
 * — the rule does NOT silently skip site B (`assistant-turn.ts`) or site C
 * (`bet-decomposition.ts`) which use the `const stream = ...` indirection.
 *
 * @lore The classifying rule is a static property → lint, per CLAUDE.md.
 * It does NOT fire on tests or `.stories.tsx` files. The rule is registered in
 * the "harness" scope in eslint.config.ts (server package only).
 *
 * Ref: architecture §2.3.1, concept §1.5-1.6, architecture-critique Round 2.
 */

import type { Rule } from "eslint";
import type { ForOfStatement, Node } from "estree";
import { asReportNode } from "../util.js";

/** Marker text embedded in a comment that classifies the loop as a relay. */
const RELAY_MARKER = "return-relay";
/** Marker text embedded in a comment that classifies the loop as an exempt drain. */
const EXEMPT_MARKER = "return-exempt: internal-extraction drain";
/**
 * Marker text for an observe-only enforced drain: the drain MUST call gate.observe()
 * (for harness-uniform enforcement) but legitimately does NOT call evaluateReturn()
 * because the verdict is deferred to its caller or the path is compliant-by-construction
 * (e.g. assistant path, concept §4.4). observe is still mandatory — absence still errors.
 *
 * @lore This classification was added in the fix pass after the reviewer flagged
 * two dead `evaluateReturn(gate, …)` calls in drainStreamEvents that existed solely to
 * satisfy the lint rule's textual presence-check. The observe-only marker lets the rule
 * be honest: require the real enforcement hook (observe) without forcing dead computation.
 */
const OBSERVE_ONLY_MARKER = "return-observe-only:";

/**
 * Walk the ancestor chain of a node to find the closest enclosing function body,
 * so we can search for `evaluateReturn` in the same function.
 */
function getEnclosingFunctionBody(node: Node & { parent?: Node }): Node | null {
	let cur: (Node & { parent?: Node }) | undefined = node.parent as Node & { parent?: Node };
	while (cur) {
		if (
			cur.type === "FunctionDeclaration" ||
			cur.type === "FunctionExpression" ||
			cur.type === "ArrowFunctionExpression"
		) {
			return cur;
		}
		cur = (cur as Node & { parent?: Node }).parent as Node & { parent?: Node };
	}
	return null;
}

/**
 * Check whether a `CallExpression` is a `.streamEvents(...)` call —
 * i.e., the callee is a member expression whose property is `streamEvents`.
 */
function isStreamEventsCall(node: Node): boolean {
	if (node.type !== "CallExpression") return false;
	const callee = (node as { callee: Node }).callee;
	return (
		callee.type === "MemberExpression" &&
		(callee as { property: Node }).property.type === "Identifier" &&
		((callee as { property: { name?: string } }).property as { name?: string }).name ===
			"streamEvents"
	);
}

/**
 * Given the source code of the enclosing function, check if `evaluateReturn(`
 * appears in it — the function-level presence check for turn drains.
 */
function functionTextHasEvaluateReturn(
	fnNode: Node,
	sourceCode: Rule.RuleContext["sourceCode"],
): boolean {
	const text = sourceCode.getText(fnNode as Parameters<typeof sourceCode.getText>[0]);
	return text.includes("evaluateReturn(");
}

/**
 * Check whether the for-of loop body contains a call to `<something>.observe(...)`.
 * We accept any MemberExpression whose property is `observe` — this matches
 * `returnGate.observe(event)` / `gate.observe(event)` etc.
 */
function bodyHasObserveCall(body: Node): boolean {
	let found = false;
	function walk(n: unknown): void {
		if (found || !n || typeof n !== "object") return;
		const node = n as Record<string, unknown>;
		if (node.type === "CallExpression" && node.callee && typeof node.callee === "object") {
			const callee = node.callee as Record<string, unknown>;
			if (
				callee.type === "MemberExpression" &&
				callee.property &&
				typeof callee.property === "object"
			) {
				const prop = callee.property as Record<string, unknown>;
				if (prop.type === "Identifier" && prop.name === "observe") {
					found = true;
					return;
				}
			}
		}
		for (const key of Object.keys(node)) {
			if (key === "parent") continue;
			const val = node[key];
			if (Array.isArray(val)) {
				for (const child of val) walk(child);
			} else if (
				val &&
				typeof val === "object" &&
				typeof (val as Record<string, unknown>).type === "string"
			) {
				walk(val);
			}
		}
	}
	walk(body);
	return found;
}

/**
 * Get the comment text immediately preceding a node (leading comments in the
 * same block or the preceding sibling statements' trailing comments).
 */
function getLeadingCommentText(node: Node, sourceCode: Rule.RuleContext["sourceCode"]): string {
	const comments = sourceCode.getCommentsBefore(
		node as Parameters<typeof sourceCode.getCommentsBefore>[0],
	);
	return comments.map((c) => c.value).join("\n");
}

export const noUngatedStreamDrain: Rule.RuleModule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Every for-await loop over a streamEvents() iterable must be classified as " +
				"turn-drain (must call gate.observe + evaluateReturn), return-relay (forwarding relay, " +
				"no gate), or return-exempt (internal-extraction drain, no gate). A turn-drain without " +
				"the gate creates a 'forgotten drain' blind spot in return enforcement.",
			recommended: false,
		},
		schema: [],
		messages: {
			missingObserve:
				"Turn-drain loop over streamEvents() must call `<gate>.observe(event)` inside the loop body. " +
				"If this is a forwarding relay, add `// return-relay` before the loop. " +
				"If this is an exempt internal-extraction drain (tools:[]), add `// return-exempt: internal-extraction drain`. " +
				"If observe-only (verdict deferred to caller), add `// return-observe-only: <reason>` — observe is still required.",
			missingEvaluateReturn:
				"Turn-drain loop over streamEvents() must call `evaluateReturn(...)` in the enclosing function. " +
				"If this is a forwarding relay, add `// return-relay` before the loop. " +
				"If this is an exempt internal-extraction drain (tools:[]), add `// return-exempt: internal-extraction drain`. " +
				"If observe-only (verdict deferred to caller), add `// return-observe-only: <reason>` — evaluateReturn is then NOT required.",
		},
	},
	create(context) {
		// Map from variable name → whether it was bound to a streamEvents() call,
		// keyed within the current function scope.
		const streamEventsBindings = new Map<string, boolean>();

		return {
			// Track `const stream = adapter.streamEvents(handle)` bindings.
			VariableDeclarator(node: Node) {
				// Cast via JSSyntaxElement (the audited boundary from util.ts —
				// avoids `as unknown as T` double-assertion).
				const decl = node as {
					type: string;
					id: { type: string; name?: string };
					init: Node | null;
				};
				if (
					decl.id.type === "Identifier" &&
					decl.id.name &&
					decl.init &&
					isStreamEventsCall(decl.init)
				) {
					streamEventsBindings.set(decl.id.name, true);
				}
			},

			// Main classification logic.
			"ForOfStatement[await=true]"(node: Node) {
				const forOf = node as ForOfStatement & { right: Node };
				const rhs = forOf.right;

				// Is this a streamEvents drain? Either direct call or one-hop binding.
				const isDirectStreamEvents = isStreamEventsCall(rhs);
				const isIndirectStreamEvents =
					rhs.type === "Identifier" && streamEventsBindings.has((rhs as { name: string }).name);

				if (!(isDirectStreamEvents || isIndirectStreamEvents)) return;

				// Read leading comments to classify the loop.
				const commentText = getLeadingCommentText(node, context.sourceCode);
				const isRelay = commentText.includes(RELAY_MARKER);
				const isExempt = commentText.includes(EXEMPT_MARKER);
				const isObserveOnly = commentText.includes(OBSERVE_ONLY_MARKER);

				// Relay and exempt loops need no gate — classification is sufficient.
				if (isRelay || isExempt) return;

				// All non-relay, non-exempt drains (both turn-drain and observe-only)
				// MUST call gate.observe() in the loop body — the real enforcement hook.
				const body = forOf.body;
				const hasObserve = bodyHasObserveCall(body);
				if (!hasObserve) {
					context.report({
						node: asReportNode(node as { type: string }),
						messageId: "missingObserve",
					});
					return; // Don't also report missingEvaluateReturn — fix one at a time.
				}

				// Observe-only drains: observe is wired (checked above), verdict is deferred
				// to caller — evaluateReturn is legitimately absent. No further check needed.
				if (isObserveOnly) return;

				// Turn-drain: must also have evaluateReturn in the enclosing function.
				const enclosingFn = getEnclosingFunctionBody(node as Node & { parent?: Node });
				if (enclosingFn && !functionTextHasEvaluateReturn(enclosingFn, context.sourceCode)) {
					context.report({
						node: asReportNode(node as { type: string }),
						messageId: "missingEvaluateReturn",
					});
				}
			},
		};
	},
};
