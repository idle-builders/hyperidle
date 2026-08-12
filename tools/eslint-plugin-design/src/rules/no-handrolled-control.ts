/**
 * design/no-handrolled-control
 *
 * AZ7 E2 / Set 1 + Set 2 (framework/design-system/DESIGN.md § Button, § Input).
 * Scoped to `layers/core-ui/src/**` — the design system is where controls are
 * BUILT (it legitimately paints DaisyUI/accent chrome onto a raw element), and
 * core-ui is where they are USED. That is a principled boundary, not a file
 * allowance (AZ7 Trade-off 4): a control fork INSIDE the design system
 * (RichMessageCard's private tone vocabulary) is still a defect, but it is
 * caught by review, not by this rule.
 *
 * Predicate (combined-round.md §5.2): on a raw `<button>|<input>|<textarea>|<select>`
 * under `layers/core-ui/src/**`, a violation is:
 *   1. a class token matching `^(btn|input|textarea|select)(-[a-z0-9]+)*$` —
 *      the DaisyUI control-component vocabulary, which carries the WHOLE
 *      fill/border/height/radius package a design-system component already owns; OR
 *   2. a `bg-[var(--accent-*)]` / `bg-[var(--status-*)]` class — the element is
 *      painting an accent or status fill itself instead of getting it from
 *      `Button`'s variant system.
 *
 * `checkbox|toggle|radio|range` DaisyUI classes are NOT matched — AQ-011's
 * form-control exemption, and `Checkbox`/`Toggle` wrap exactly those classes
 * themselves (so the design-system components would trip their own rule
 * were they in scope — they are not; this rule fires under core-ui only).
 *
 * @lore AZ7 E2: self-closing JSX elements (`<input />`) do not get a distinct
 * ESTree node type — `estree-jsx`'s `JSXOpeningElement` carries a
 * `selfClosing: boolean` flag and IS the node for both `<input />` and the
 * opening tag of `<button>…</button>`. A single `JSXOpeningElement` visitor
 * (the same pattern `no-op-button`/`require-focus-on-interactive` already use
 * in this plugin) covers every control shape; there is no second node type to
 * visit.
 */

import type { Rule } from "eslint";
import type { JSXOpeningElement } from "estree-jsx";
import { asReportNode, collectClassStringsFromJSXAttributeDeep, createRule } from "../util.js";

const CONTROL_TAGS: ReadonlySet<string> = new Set(["button", "input", "textarea", "select"]);

// DaisyUI control-component classes: btn*, input*, textarea*, select* — but
// NOT checkbox*/toggle*/radio*/range* (the AQ-011 form-control exemption).
const DAISY_CONTROL_RE = /^(btn|input|textarea|select)(-[a-z0-9]+)*$/;

// An accent or status fill painted directly on the raw element, instead of
// coming from a design-system component's variant system.
const ACCENT_STATUS_FILL_RE = /^bg-\[var\(--(accent|status)-[a-z-]+\)\]$/;

// @lore AZ7 N1 (review round 1): --accent-primary-dim is not an accent FILL
// in Set 3's sense (combined-round.md §2 Set 3) — it is the row-hover /
// selected TINT, the one job that token has. The predicate above matched it
// anyway, which made every hover tint on a raw interactive element (a Row, a
// list item) a false positive requiring a disable comment — 5 of the review's
// 8 disables were exactly this. A rule that needs a standing exemption for
// its own design system's documented tint is on its way to not biting, which
// is the failure AZ7 exists to end. Excluded by exact value, not by widening
// the regex — every OTHER accent/status fill (--accent-primary,
// --status-error, …) is still a real violation.
const ROW_HOVER_TINT = "bg-[var(--accent-primary-dim)]";

// @lore AZ7: excludes test/story files — "core-ui is where controls are
// USED" means used in the product, not exercised in a fixture. A test that
// renders a raw <button className="btn"> to prove DaisyUI classes resolve in
// jsdom (foundation.component.test.tsx) is not a hand-rolled control in a
// real surface; forcing it onto <Button> would test the wrong thing.
function isInScope(filename: string): boolean {
	const normalized = filename.replace(/\\/g, "/");
	if (!normalized.includes("layers/core-ui/src")) return false;
	if (/\.(test|stories|spec)\.tsx$/.test(normalized)) return false;
	if (normalized.split("/").some((seg) => seg.startsWith("__"))) return false;
	return true;
}

function classNameAttrOf(el: JSXOpeningElement): unknown {
	for (const attr of el.attributes) {
		if (
			attr.type === "JSXAttribute" &&
			attr.name.type === "JSXIdentifier" &&
			attr.name.name === "className"
		) {
			return attr;
		}
	}
	return null;
}

export const noHandrolledControl: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid a raw <button>/<input>/<textarea>/<select> in layers/core-ui/src that repaints a design-system control's chrome — a DaisyUI btn*/input*/textarea*/select* class, or an accent/status fill. Use Button/Input/SearchField/Select/Composer from @hyperidle/design-system instead.",
			recommended: true,
		},
		schema: [],
		messages: {
			daisyControl:
				"Raw <{{tag}}> paints DaisyUI control chrome ('{{cls}}') in layers/core-ui/src. AZ7 Set 1/2: use Button/Input/SearchField/Select/Composer from @hyperidle/design-system instead of a hand-rolled DaisyUI control.",
			accentFill:
				"Raw <{{tag}}> paints an accent/status fill ('{{cls}}') directly in layers/core-ui/src. AZ7 Set 1: use Button's variant system (primary/secondary/ghost/destructive) instead of a hand-rolled fill.",
		},
	},
	create(context) {
		const filename = context.filename;
		if (!isInScope(filename)) return {};

		return {
			JSXOpeningElement(rawNode: unknown) {
				const node = rawNode as JSXOpeningElement;
				const tag = node.name.type === "JSXIdentifier" ? node.name.name : null;
				if (!tag || !CONTROL_TAGS.has(tag)) return;
				const attr = classNameAttrOf(node);
				if (!attr) return;
				const strings = collectClassStringsFromJSXAttributeDeep(attr);
				for (const { text, node: strNode } of strings) {
					for (const raw of text.split(/\s+/).filter(Boolean)) {
						const token = raw.replace(/^[a-z-]+:/, "");
						if (DAISY_CONTROL_RE.test(token)) {
							context.report({
								node: asReportNode(strNode),
								messageId: "daisyControl",
								data: { tag, cls: token },
							});
						} else if (token !== ROW_HOVER_TINT && ACCENT_STATUS_FILL_RE.test(token)) {
							context.report({
								node: asReportNode(strNode),
								messageId: "accentFill",
								data: { tag, cls: token },
							});
						}
					}
				}
			},
		};
	},
});
