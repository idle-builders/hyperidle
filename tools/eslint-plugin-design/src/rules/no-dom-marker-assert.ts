/**
 * design/no-dom-marker-assert
 *
 * A component test asserts what the user sees or does — never that an
 * implementation-detail `data-ds-*` marker is PRESENT (testing.md § UI: "not
 * class names, DOM markers, pixel values, or styling"). Using a `data-ds-*`
 * attribute as a SELECTOR to locate a real element and then asserting
 * something about it (a count, text content, a value) is fine and common;
 * so is asserting a marker's ABSENCE (a real regression guard: "the legacy
 * card never mounts"). What's banned is the positive claim — `toBeInTheDocument()`,
 * `toBeDefined()`, `toBeTruthy()`, `not.toBeNull()` — that an element carrying
 * the marker exists, which proves nothing a render crash wouldn't already
 * prove. `EXISTENCE_WHEN_TRUE` records, per matcher, whether the UN-negated
 * form asserts existence (`true`) or absence (`false`); a `.not` modifier
 * flips it.
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

export const noDomMarkerAssert: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description: "Forbid asserting a data-ds-* marker's own existence in a component test.",
		},
		schema: [],
		messages: {
			marker:
				"Asserting a data-ds-* marker's existence proves nothing a render crash wouldn't. Use the marker to find the element, then assert what the user sees (count, text, visible state).",
		},
	},
	create(context) {
		return {
			CallExpression(node) {
				// expect(<subject>).<modifier?>.<matcher>(...)
				const callee = node.callee as {
					type: string;
					property?: { name?: string };
					object?: unknown;
				};
				if (callee.type !== "MemberExpression") return;
				const matcherName = callee.property?.name;
				if (!(matcherName && matcherName in EXISTENCE_WHEN_TRUE)) return;

				// Walk left through `.not`/`.resolves`/`.rejects` modifiers to the expect() call,
				// tracking whether `.not` appears anywhere in the chain.
				let cur = callee.object as AnyNode | undefined;
				let negated = false;
				while (cur && cur.type === "MemberExpression") {
					const prop = cur.property as { name?: string } | undefined;
					if (prop?.name === "not") negated = true;
					cur = cur.object as AnyNode | undefined;
				}
				if (!cur || cur.type !== "CallExpression") return;
				const innerCallee = cur.callee as { type?: string; name?: string } | undefined;
				if (innerCallee?.type !== "Identifier" || innerCallee.name !== "expect") return;

				const assertsExistence = negated
					? !EXISTENCE_WHEN_TRUE[matcherName]
					: EXISTENCE_WHEN_TRUE[matcherName];
				if (!assertsExistence) return;

				const subject = (cur.arguments as unknown[] | undefined)?.[0];
				if (selectorHasDsMarker(subject)) {
					context.report({ node, messageId: "marker" });
				}
			},
		};
	},
});
