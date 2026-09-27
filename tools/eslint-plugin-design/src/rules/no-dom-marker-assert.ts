/**
 * design/no-dom-marker-assert
 *
 * A component test asserts what the user sees or does — never an
 * implementation-detail marker (testing.md § UI: "not class names, DOM
 * markers, pixel values, or styling"). Three independent shapes are banned:
 *
 *   1. A `data-ds-*` marker's own POSITIVE existence — `toBeInTheDocument()`,
 *      `toBeDefined()`, `toBeTruthy()`, `not.toBeNull()` on a subject built
 *      from a `data-ds-*` selector. Using the marker to find a real element
 *      and asserting something else about it (count, text, a non-data-*
 *      attribute) is fine; so is asserting the marker's ABSENCE (a real
 *      regression guard).
 *   2. `toHaveClass(...)`, or any assertion whose subject reads `.className`
 *      / `.classList` — a class name is styling, never the behavior.
 *   3. Any assertion whose subject reads `getAttribute("data-...")` — a
 *      `data-*` attribute is the same implementation-detail marker as (1),
 *      whichever matcher reads it.
 */

import type { Rule } from "eslint";
import { createRule } from "../util.js";

const EXISTENCE_WHEN_TRUE: Record<string, boolean> = {
	toBeInTheDocument: true,
	toBeDefined: true,
	toBeTruthy: true,
	toBeNull: false,
	toBeFalsy: false,
	toBeUndefined: false,
};

type AnyNode = { type: string; [k: string]: unknown };

function selectorHasDsMarker(node: unknown): boolean {
	if (!node || typeof node !== "object") return false;
	const n = node as AnyNode;
	if (n.type === "Literal" && typeof n.value === "string") {
		return n.value.includes("data-ds-");
	}
	// container.querySelector(...) / container.querySelectorAll(...).length
	if (n.type === "CallExpression") {
		const args = n.arguments as unknown[];
		return args.some(selectorHasDsMarker);
	}
	if (n.type === "MemberExpression") {
		return selectorHasDsMarker(n.object);
	}
	return false;
}

/** True if the subtree reads `.className`, `.classList`, or `getAttribute("data-...")`. */
function readsClassOrDataAttribute(node: unknown): boolean {
	if (!node || typeof node !== "object") return false;
	const n = node as AnyNode;
	switch (n.type) {
		case "MemberExpression": {
			const property = n.property as { name?: string } | undefined;
			if (property?.name === "className" || property?.name === "classList") return true;
			return readsClassOrDataAttribute(n.object);
		}
		case "CallExpression": {
			const callee = n.callee as AnyNode | undefined;
			if (
				callee?.type === "MemberExpression" &&
				(callee.property as { name?: string } | undefined)?.name === "getAttribute"
			) {
				const arg = (n.arguments as unknown[])[0] as { type?: string; value?: unknown } | undefined;
				if (
					arg?.type === "Literal" &&
					typeof arg.value === "string" &&
					arg.value.startsWith("data-")
				) {
					return true;
				}
			}
			// classList.contains("x") / (className ?? "").includes("x") — walk the receiver too.
			if (callee?.type === "MemberExpression") return readsClassOrDataAttribute(callee.object);
			return false;
		}
		case "LogicalExpression":
			return readsClassOrDataAttribute(n.left) || readsClassOrDataAttribute(n.right);
		case "ChainExpression":
			return readsClassOrDataAttribute(n.expression);
		default:
			return false;
	}
}

function getExpectCallAndModifiers(callee: AnyNode): { inner: AnyNode; negated: boolean } | null {
	let cur = callee.object as AnyNode | undefined;
	let negated = false;
	while (cur && cur.type === "MemberExpression") {
		const prop = cur.property as { name?: string } | undefined;
		if (prop?.name === "not") negated = true;
		cur = cur.object as AnyNode | undefined;
	}
	if (cur?.type !== "CallExpression") return null;
	const innerCallee = cur.callee as { type?: string; name?: string } | undefined;
	if (innerCallee?.type !== "Identifier" || innerCallee.name !== "expect") return null;
	return { inner: cur, negated };
}

export const noDomMarkerAssert: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid asserting a data-ds-* marker's existence, a class name, or a data-* attribute value in a component test.",
		},
		schema: [],
		messages: {
			marker:
				"Asserting a data-ds-* marker's existence proves nothing a render crash wouldn't. Use the marker to find the element, then assert what the user sees (count, text, visible state).",
			classAssert:
				"A class name is styling, not behavior (testing.md § UI). Assert what the user sees instead (text, role, visible state).",
			dataAttrAssert:
				"Reading a data-* attribute as the asserted value is the same implementation-detail marker testing.md bans. Assert what the user sees instead.",
		},
	},
	create(context) {
		return {
			CallExpression(node) {
				const callee = node.callee as {
					type: string;
					property?: { name?: string };
					object?: unknown;
				};
				if (callee.type !== "MemberExpression") return;
				const matcherName = callee.property?.name;
				if (!matcherName) return;

				// Shape 2: toHaveClass(...) is banned outright, regardless of subject.
				if (matcherName === "toHaveClass") {
					const found = getExpectCallAndModifiers(callee as AnyNode);
					if (found) context.report({ node, messageId: "classAssert" });
					return;
				}

				const found = getExpectCallAndModifiers(callee as AnyNode);
				if (!found) return;
				const subject = (found.inner.arguments as unknown[] | undefined)?.[0];

				// Shape 2b/3: subject reads .className/.classList or getAttribute("data-...").
				if (readsClassOrDataAttribute(subject)) {
					context.report({ node, messageId: "dataAttrAssert" });
					return;
				}

				// Shape 1: existence-only assert on a data-ds-* selector subject.
				if (!(matcherName in EXISTENCE_WHEN_TRUE)) return;
				const assertsExistence = found.negated
					? !EXISTENCE_WHEN_TRUE[matcherName]
					: EXISTENCE_WHEN_TRUE[matcherName];
				if (!assertsExistence) return;
				if (selectorHasDsMarker(subject)) {
					context.report({ node, messageId: "marker" });
				}
			},
		};
	},
});
