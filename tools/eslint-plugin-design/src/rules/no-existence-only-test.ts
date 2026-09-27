/**
 * design/no-existence-only-test
 *
 * A test proves nothing when every assertion it makes is existence-only
 * (testing.md § Never a test: "an assert that can't fail" — toBeDefined,
 * toBeTruthy, not.toBeNull, not.toBeUndefined, not.toThrow). This does NOT
 * ban those matchers outright — one next to a real assertion is fine, and
 * `toBeInTheDocument()` is never counted against a test even alone, because
 * it proves something the user actually sees rendered, not merely that a
 * reference is non-null.
 *
 * Scope: one `test()`/`it()` callback body at a time (not nested `describe`
 * blocks, and not helper functions called from inside — same blind spot
 * `vitest/expect-expect`'s `assertFunctionNames` already works around).
 * Every `expect(...)` call reachable in the body (including inside
 * `it.each` table rows) is classified; if at least one exists and ALL are
 * existence-only, the whole test is flagged once.
 */

import type { Rule } from "eslint";
import { asReportNode, createRule } from "../util.js";

const EXISTENCE_WHEN_TRUE: Record<string, boolean> = {
	toBeDefined: true,
	toBeTruthy: true,
	toBeNull: false,
	toBeUndefined: false,
	toThrow: false,
};

type AnyNode = { type: string; [k: string]: unknown };

function matcherIsExistenceOnly(matcherName: string, negated: boolean): boolean {
	if (matcherName === "toBeInTheDocument") return false;
	const whenTrue = EXISTENCE_WHEN_TRUE[matcherName];
	if (whenTrue === undefined) return false;
	return negated ? !whenTrue : whenTrue;
}

/**
 * Classifies one `expect(...)`-chain CallExpression (the outermost call —
 * the matcher call itself, e.g. the `toBe(...)` in `expect(x).not.toBe(...)`).
 * Returns null if this is not an expect-chain call at all.
 */
function classifyExpectCall(node: AnyNode): "existence" | "real" | null {
	const callee = node.callee as AnyNode | undefined;
	if (!callee || callee.type !== "MemberExpression") return null;
	const matcherName = (callee.property as { name?: string } | undefined)?.name;
	if (!matcherName) return null;

	let cur = callee.object as AnyNode | undefined;
	let negated = false;
	while (cur && cur.type === "MemberExpression") {
		const prop = cur.property as { name?: string } | undefined;
		if (prop?.name === "not") negated = true;
		cur = cur.object as AnyNode | undefined;
	}
	if (!cur || cur.type !== "CallExpression") return null;
	const innerCallee = cur.callee as AnyNode | undefined;
	if (innerCallee?.type !== "Identifier" || innerCallee.name !== "expect") return null;

	return matcherIsExistenceOnly(matcherName, negated) ? "existence" : "real";
}

/** Walks a subtree collecting every expect-chain classification found. */
function collectExpectClassifications(node: unknown, out: Array<"existence" | "real">): void {
	if (!node || typeof node !== "object") return;
	const n = node as AnyNode;
	if (n.type === "CallExpression") {
		const kind = classifyExpectCall(n);
		if (kind) out.push(kind);
	}
	for (const key of Object.keys(n)) {
		if (key === "parent") continue;
		const value = n[key];
		if (Array.isArray(value)) {
			for (const item of value) collectExpectClassifications(item, out);
		} else if (value && typeof value === "object" && typeof (value as AnyNode).type === "string") {
			collectExpectClassifications(value, out);
		}
	}
}

export const noExistenceOnlyTest: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid a test whose only assertions are existence-only matchers (toBeDefined/toBeTruthy/not.toBeNull/not.toBeUndefined/not.toThrow).",
		},
		schema: [],
		messages: {
			existenceOnly:
				'Every assertion in this test is existence-only (testing.md § Never a test: "an assert that can\'t fail"). Assert the real outcome, or delete the test.',
		},
	},
	create(context) {
		return {
			CallExpression(node) {
				const callee = node.callee;
				if (callee.type !== "Identifier") return;
				if (callee.name !== "test" && callee.name !== "it") return;

				const fn = node.arguments.find(
					(a) => a.type === "ArrowFunctionExpression" || a.type === "FunctionExpression",
				);
				if (!fn) return;

				const results: Array<"existence" | "real"> = [];
				collectExpectClassifications(fn.body, results);
				if (results.length === 0) return;
				if (results.every((r) => r === "existence")) {
					context.report({ node: asReportNode(node), messageId: "existenceOnly" });
				}
			},
		};
	},
});
