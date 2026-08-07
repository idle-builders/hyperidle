/**
 * design/no-op-button
 *
 * Maps to AC-2 ("no button is a no-op") — enforces that every <button> in
 * pages/** and components/** has a real action. A button is valid iff it
 * satisfies at least one of:
 *
 *   (a) has an `onClick` prop (any expression, not just a literal)
 *   (b) has `type="submit"` AND is lexically inside a <form> that has either:
 *       - an `onSubmit` prop, OR
 *       - a `method="dialog"` prop (HTML dialog close mechanic — no JS handler needed)
 *   (c) is a trigger child of a known headless-control parent — i.e. its
 *       immediate JSX parent element is one of the allowed headless wrappers
 *       (MenuButton, Disclosure.Button, Popover.Button, etc.) where the action
 *       lives on the parent. We detect this by inspecting the parent
 *       JSXOpeningElement's name.
 *
 * Specifically failing cases (the real no-ops):
 *   - <button type="button"> with no onClick          — bare no-op
 *   - <button> (no type, no onClick)                  — implicit no-op
 *   - <button type="submit"> outside an onSubmit/method="dialog" form — dangling submit
 *
 * @lore AF16 CRITICAL-1: AC-2 ("no button is a no-op") requires a static rule
 * that catches type="button" with no onClick — the real failure mode the old
 * pattern-based check missed. case (b) extends the plan's "onSubmit form" to
 * also accept method="dialog" (the DaisyUI modal backdrop close pattern — a
 * functional HTML action, not an onSubmit handler). case (c) exempts headless
 * trigger children whose action lives on the parent element.
 *
 * Verify: tools/eslint-plugin-design/src/rules/__tests__/no-op-button.test.ts
 */

import type { Rule } from "eslint";
import type { JSXOpeningElement } from "estree-jsx";
import { createRule } from "../util.js";

/**
 * Headless-control parent names whose trigger children are exempt from the
 * no-onClick requirement (the action lives on the parent, not the button).
 * Extend this list as the project adopts more headless UI primitives.
 */
const HEADLESS_PARENT_NAMES: ReadonlySet<string> = new Set([
	"MenuButton",
	"DisclosureButton",
	"Disclosure",
	"PopoverButton",
	"Popover",
	"TabButton",
	"AccordionButton",
	"ComboboxButton",
	"ListboxButton",
	"SelectButton",
]);

/**
 * Internal traversal node — has an index signature for property access without
 * per-property casts. Private to this file; public API uses typed estree-jsx nodes.
 *
 * @lore refactor/no-unknown-cast-eslint-plugins: Replaces the old `AnyNode`
 * (same shape) to signal it is NOT exported. The call sites now pass `node`
 * (JSXOpeningElement) directly since the helpers accept `unknown`, eliminating
 * all `as unknown as AnyNode` casts.
 */
type WalkNode = { type: string; parent?: WalkNode; [k: string]: unknown };

/**
 * Walk the ancestor chain and return the nearest ancestor JSXOpeningElement
 * that is a <form> element, or null.
 *
 * Accepts `unknown` so the visitor can pass `node` (JSXOpeningElement) directly.
 *
 * AST structure: JSXOpeningElement (<button>) → parent: JSXElement → parent:
 * JSXElement (<form>) which has openingElement: JSXOpeningElement (<form>).
 * We walk JSXElement ancestors and check their openingElement tag name.
 */
function findEnclosingForm(startNode: unknown): JSXOpeningElement | null {
	const asWalk = (n: unknown): WalkNode | undefined =>
		n && typeof n === "object" ? (n as WalkNode) : undefined;
	let cur = asWalk((startNode as { parent?: unknown } | null)?.parent);
	while (cur) {
		if (cur.type === "JSXElement") {
			const openingEl = cur.openingElement as JSXOpeningElement | undefined;
			if (openingEl) {
				const tagName = openingEl.name.type === "JSXIdentifier" ? openingEl.name.name : null;
				if (tagName === "form") return openingEl;
			}
		}
		cur = asWalk(cur.parent);
	}
	return null;
}

/**
 * Returns true when the given JSXOpeningElement (<form>) has an onSubmit
 * prop or a method="dialog" prop.
 */
function formHasAction(formEl: JSXOpeningElement): boolean {
	for (const attr of formEl.attributes) {
		if (attr.type !== "JSXAttribute") continue;
		const name = attr.name.type === "JSXIdentifier" ? attr.name.name : null;
		if (name === "onSubmit") return true;
		if (name === "method") {
			const val = attr.value as { type?: string; value?: unknown } | null | undefined;
			if (val && val.type === "Literal" && val.value === "dialog") return true;
		}
	}
	return false;
}

/**
 * Returns true when the immediate JSX parent element (the component wrapping
 * this <button>) is one of the known headless-control trigger parents.
 *
 * Accepts `unknown` so the visitor can pass `node` (JSXOpeningElement) directly.
 *
 * AST: JSXOpeningElement (<button>) → parent: JSXElement → parent: JSXElement (wrapper)
 * We check the first JSXElement ancestor's openingElement tag name.
 */
function isHeadlessTriggerChild(startNode: unknown): boolean {
	const asWalk = (n: unknown): WalkNode | undefined =>
		n && typeof n === "object" ? (n as WalkNode) : undefined;
	// Walk to the JSXElement that contains the button's JSXOpeningElement
	const cur = asWalk((startNode as { parent?: unknown } | null)?.parent); // JSXElement (<button>)
	if (!cur) return false;
	// Now look at the parent JSXElement (the wrapper component)
	const wrapper = asWalk(cur.parent);
	if (!wrapper || wrapper.type !== "JSXElement") return false;
	const openingEl = wrapper.openingElement as JSXOpeningElement | undefined;
	if (!openingEl) return false;
	const tagName = openingEl.name.type === "JSXIdentifier" ? openingEl.name.name : null;
	return tagName !== null && HEADLESS_PARENT_NAMES.has(tagName);
}

export const noOpButton: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Every <button> must have a real action: an onClick handler, a submit inside an onSubmit/method=dialog form, or be a headless-control trigger child.",
			recommended: true,
		},
		schema: [],
		messages: {
			noOp: '<button> has no action. Add onClick, or use type="submit" inside a form with onSubmit/method="dialog", or use a headless-control trigger parent.',
			danglingSubmit:
				'<button type="submit"> is not inside a <form onSubmit=...> or <form method="dialog">. Add onSubmit to the enclosing form, or use method="dialog" for dialog-close buttons.',
		},
	},
	create(context) {
		return {
			JSXOpeningElement(rawNode: unknown) {
				const node = rawNode as JSXOpeningElement;
				// Only check <button> elements
				const tagName = node.name.type === "JSXIdentifier" ? node.name.name : null;
				if (tagName !== "button") return;

				let hasOnClick = false;
				let typeValue: string | null = null;

				for (const attr of node.attributes) {
					if (attr.type !== "JSXAttribute") continue;
					const aname = attr.name.type === "JSXIdentifier" ? attr.name.name : null;
					if (aname === "onClick") hasOnClick = true;
					if (aname === "type") {
						const val = attr.value as { type?: string; value?: unknown } | null | undefined;
						if (val && val.type === "Literal" && typeof val.value === "string") {
							typeValue = val.value as string;
						}
					}
				}

				// (a) Has onClick → always valid
				if (hasOnClick) return;

				// (c) Headless trigger child → always valid
				if (isHeadlessTriggerChild(node)) return;

				// (b) type="submit" — only valid inside an action-bearing form
				if (typeValue === "submit") {
					const enclosingForm = findEnclosingForm(node);
					if (enclosingForm && formHasAction(enclosingForm)) return;
					// No enclosing form with action → dangling submit
					context.report({
						node,
						messageId: "danglingSubmit",
					});
					return;
				}

				// type="button" or no type, no onClick → no-op
				context.report({
					node,
					messageId: "noOp",
				});
			},
		};
	},
});
