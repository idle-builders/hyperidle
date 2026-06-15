/**
 * design/require-focus-on-interactive
 *
 * Maps to AQ-015 (touch target / a11y) — generic accessibility hard-rule:
 * a `<div onClick>` or `<span onClick>` must be focusable. Permissible
 * remediation: `tabIndex` attribute, an explicit `role="button"|"link"|...`,
 * or a `focus-visible:` Tailwind class on `className`.
 */

import type { Rule } from "eslint";
import type { JSXOpeningElement } from "estree-jsx";
import { createRule, getClassNameLiteral } from "../util.js";

const FOCUS_VISIBLE = /\bfocus-visible:/;

export const requireFocusOnInteractive: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"<div onClick> / <span onClick> must be focusable: add tabIndex, role, or a focus-visible: class.",
			recommended: true,
		},
		schema: [],
		messages: {
			needsFocus:
				"<{{tag}}> with onClick is not focusable.  → fix: add tabIndex={0}, role='button' (or another interactive role), or use a real <button>; alternatively a focus-visible: class proves you've handled keyboard focus.",
		},
	},
	create(context) {
		return {
			JSXOpeningElement(rawNode: unknown) {
				const node = rawNode as JSXOpeningElement;
				const tagName = node.name.type === "JSXIdentifier" ? node.name.name : null;
				if (tagName !== "div" && tagName !== "span") return;
				let hasOnClick = false;
				let hasTabIndex = false;
				let hasRole = false;
				let hasFocusVisible = false;
				for (const attr of node.attributes) {
					if (attr.type !== "JSXAttribute") continue;
					const aname = attr.name.type === "JSXIdentifier" ? attr.name.name : null;
					if (aname === "onClick") hasOnClick = true;
					if (aname === "tabIndex") hasTabIndex = true;
					if (aname === "role") hasRole = true;
					if (aname === "className") {
						const lit = getClassNameLiteral(attr);
						if (lit && FOCUS_VISIBLE.test(lit)) hasFocusVisible = true;
					}
				}
				if (hasOnClick && !(hasTabIndex || hasRole || hasFocusVisible)) {
					context.report({
						node,
						messageId: "needsFocus",
						data: { tag: tagName },
					});
				}
			},
		};
	},
});
