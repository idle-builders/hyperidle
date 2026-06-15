/**
 * design/no-raw-overlay-z — AI2 AC-3 static gate
 *
 * Forbids raw z-index Tailwind classes on overlay surfaces. All overlay z-layers
 * must come from the --z-* token scale defined in tokens.css (AI2).
 *
 * Forbidden patterns in className:
 *   z-30, z-40, z-50        — named Tailwind z-index classes for overlay values
 *   z-[30], z-[40], z-[50] — arbitrary equivalents
 *   modal-open               — DaisyUI class that implies z-50 on the modal element
 *
 * Allowed (these reference CSS custom properties, not raw integers):
 *   style={{ zIndex: "var(--z-dialog)" }}    — any var(--z-*) is fine
 *   data-dialog-layer="drawer"               — always fine
 *
 * @lore AI2: AC-3 splits into (a) this static lint gate and (b) a runtime
 * Playwright computed-z test. This rule enforces (a). It runs in verify:quick
 * via npm run lint. Raw z-[N] or named z-{N} classes on overlay surfaces produce
 * stacking collisions that the --z-* token scale resolves.
 */

import type { Rule } from "eslint";
import type { JSXAttribute } from "estree-jsx";
import { asReportNode, collectClassStringsFromJSXAttribute, createRule } from "../util.js";

// Named z-index classes that are forbidden on overlay surfaces
// (the AI2 token scale uses --z-drawer:30 --z-overlay:40 --z-scrim:50 --z-dialog:60)
const FORBIDDEN_NAMED = /\bz-(30|40|50)\b/;
// Arbitrary z-index classes for the same values
const FORBIDDEN_ARBITRARY = /\bz-\[(30|40|50)\]/;
// DaisyUI modal-open class (used to trigger body scroll-lock + z-50 on the modal)
const FORBIDDEN_MODAL_OPEN = /\bmodal-open\b/;

function checkToken(token: string): string | null {
	if (FORBIDDEN_NAMED.test(token)) return token;
	if (FORBIDDEN_ARBITRARY.test(token)) return token;
	if (FORBIDDEN_MODAL_OPEN.test(token)) return token;
	return null;
}

export const noRawOverlayZ: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid raw z-index Tailwind classes (z-30, z-40, z-50, z-[30], z-[40], z-[50], modal-open) on overlay surfaces. Use the --z-* token scale via style={{ zIndex: 'var(--z-drawer)' }} instead.",
			recommended: true,
		},
		schema: [],
		messages: {
			rawZ: "Raw z-index class '{{cls}}' found. Use the --z-* token scale: --z-drawer (30), --z-overlay (40), --z-scrim (50), --z-dialog (60) via style={{ zIndex: 'var(--z-drawer)' }}. (AI2 AC-3)",
		},
	},
	create(context) {
		return {
			JSXAttribute(rawNode: unknown) {
				const node = rawNode as JSXAttribute;
				if (
					node.type !== "JSXAttribute" ||
					node.name.type !== "JSXIdentifier" ||
					node.name.name !== "className"
				)
					return;

				const classStrings = collectClassStringsFromJSXAttribute(node);
				for (const { text } of classStrings) {
					const tokens = text.split(/\s+/);
					for (const token of tokens) {
						const bad = checkToken(token);
						if (bad !== null) {
							context.report({
								node: asReportNode(node),
								messageId: "rawZ",
								data: { cls: bad },
							});
						}
					}
				}
			},
		};
	},
});
