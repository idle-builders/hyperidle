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
 * Predicate: on a raw `<button>|<input>|<textarea>|<select>` under
 * `layers/core-ui/src/**`, a violation is the element painting ANY of the
 * chrome a design-system control owns:
 *   1. a class token matching `^(btn|input|textarea|select|file-input)(-[a-z0-9]+)*$` —
 *      the DaisyUI control-component vocabulary, which carries the WHOLE
 *      fill/border/height/radius package a design-system component already owns;
 *   2. a `bg-[var(--accent-*)]` / `bg-[var(--status-*)]` class — the element is
 *      painting an accent or status fill itself instead of getting it from
 *      `Button`'s variant system;
 *   3. any other token fill — `bg-[var(--surface-*)]` or `bg-[color-mix(…)]`;
 *   4. a token border — `border[-side]-[1.5px]` or `border[-side]-[var(--border-*)]`;
 *   5. any radius utility at all, token-spelled or not.
 *
 * Clauses 3–5 are the "token-legal chrome" half. A hand-rolled `<button>` that
 * spells every value correctly is still a hand-rolled button: the fill, the
 * border weight and the corner radius of a control are `Button`/`Input`'s
 * job, and a look-alike assembled per site is exactly what drifts. This is
 * the population a standalone AST scanner used to enumerate into a rendered
 * markdown backlog; the scanner and the backlog are gone — if a site needs
 * migrating, the linter says so.
 *
 * `checkbox|toggle|radio|range` DaisyUI classes are NOT matched — AQ-011's
 * form-control exemption, and `Checkbox`/`Toggle` wrap exactly those classes
 * themselves (so the design-system components would trip their own rule
 * were they in scope — they are not; this rule fires under core-ui only).
 *
 * Clauses 1 and 2 report once per matching class token (a `btn btn-ghost
 * btn-xs` element names three pieces of the package it should not be
 * assembling). Clauses 3–5 report once per ELEMENT: a control has one fill,
 * one border weight and one corner radius however many variant-prefixed
 * spellings of them appear in the class list, and one finding per element per
 * axis is what a migration is scoped from.
 *
 * @lore AZ7 E2: self-closing JSX elements (`<input />`) do not get a distinct
 * ESTree node type — `estree-jsx`'s `JSXOpeningElement` carries a
 * `selfClosing: boolean` flag and IS the node for both `<input />` and the
 * opening tag of `<button>…</button>`. A single `JSXOpeningElement` visitor
 * (the same pattern `no-op-button`/`require-focus-on-interactive` already use
 * in this plugin) covers every control shape; there is no second node type to
 * visit.
 *
 * @lore AZ7 review-round-2 NEW-1: shares `radius-token-only`'s
 * `resolveIdentifier` upgrade — a raw control's chrome built via a same-file
 * `const` (`className={controlClass}`) is now followed to its initializer
 * instead of reading as clean. See `createConstIdentifierResolver` in `util.ts`.
 */

import type { Rule } from "eslint";
import type { JSXOpeningElement } from "estree-jsx";
import {
	asReportNode,
	collectClassStringsFromJSXAttributeDeep,
	createConstIdentifierResolver,
	createRule,
} from "../util.js";

const CONTROL_TAGS: ReadonlySet<string> = new Set(["button", "input", "textarea", "select"]);

// DaisyUI control-component classes: btn*, input*, textarea*, select*,
// file-input* — but NOT checkbox*/toggle*/radio*/range* (the AQ-011
// form-control exemption). file-input is a full-chrome DaisyUI control class
// (like btn/input), not a modifier on <input type="file">.
const DAISY_CONTROL_RE = /^(btn|input|textarea|select|file-input)(-[a-z0-9]+)*$/;

// An accent or status fill painted directly on the raw element, instead of
// coming from a design-system component's variant system.
const ACCENT_STATUS_FILL_RE = /^bg-\[var\(--(accent|status)-[a-z-]+\)\]$/;

// @lore AZ7 N1 (review round 1): --accent-primary-dim is not an accent FILL
// in Set 3's sense (plan.md §2 Set 3) — it is the row-hover /
// selected TINT, the one job that token has. The predicate above matched it
// anyway, which made every hover tint on a raw interactive element (a Row, a
// list item) a false positive requiring a disable comment — 5 of the review's
// 8 disables were exactly this. A rule that needs a standing exemption for
// its own design system's documented tint is on its way to not biting, which
// is the failure AZ7 exists to end. Excluded by exact value, not by widening
// the regex — every OTHER accent/status fill (--accent-primary,
// --status-error, …) is still a real violation.
const ROW_HOVER_TINT = "bg-[var(--accent-primary-dim)]";

// Any token fill a control paints on itself — the `--surface-*` family and the
// `color-mix()` blends. Superset of ACCENT_STATUS_FILL_RE above, which keeps
// its own message because "you re-implemented Button's variant system" is a
// different fix from "this fill belongs to a design-system component".
const CHROME_FILL_RE = /^bg-\[(?:var\(--(?:surface|accent|status)[a-z-]*\)|color-mix\([^\]]*\))\]$/;

// A token border: the 1.5px Hearth control weight, or a `--border-*` colour.
const TOKEN_BORDER_RE = /^border(?:-[a-z]{1,2})?-\[(?:1\.5px|var\(--border[a-z-]*\))\]$/;

// Any Tailwind radius utility — named, arbitrary, with an optional side/corner
// infix. Deliberately NOT the `radius-token-only` predicate: that rule asks
// whether the radius is spelled as a token, this clause asks whether a raw
// control is deciding its own corner radius at all. A token-spelled radius on
// a hand-rolled <button> passes `radius-token-only` and is still chrome
// `Button` owns.
const RADIUS_RE =
	/^rounded(-(?:t|r|b|l|tl|tr|bl|br|s|e|ss|se|es|ee))?(-(?:none|xs|sm|md|lg|xl|2xl|3xl|4xl|full))?(-\[[^\]]+\])?$/;

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
				"Forbid a raw <button>/<input>/<textarea>/<select> in layers/core-ui/src that repaints a design-system control's chrome — a DaisyUI btn*/input*/textarea*/select*/file-input* class, a token fill, a token border, or any radius. Use Button/Input/SearchField/Select/Composer from @hyperidle/design-system instead.",
			recommended: true,
		},
		schema: [],
		messages: {
			daisyControl:
				"Raw <{{tag}}> paints DaisyUI control chrome ('{{cls}}') in layers/core-ui/src. AZ7 Set 1/2: use Button/Input/SearchField/Select/Composer from @hyperidle/design-system instead of a hand-rolled DaisyUI control.",
			accentFill:
				"Raw <{{tag}}> paints an accent/status fill ('{{cls}}') directly in layers/core-ui/src. AZ7 Set 1: use Button's variant system (primary/secondary/ghost/destructive) instead of a hand-rolled fill.",
			tokenFill:
				"Raw <{{tag}}> paints its own fill ('{{cls}}') in layers/core-ui/src. The fill of a control belongs to Button/Input/SearchField/Select/Composer — a token-legal fill assembled per site is still a hand-rolled control. → fix: use the design-system component, or drop the fill and let the surface behind it show through.",
			tokenBorder:
				"Raw <{{tag}}> paints its own border ('{{cls}}') in layers/core-ui/src. Control border weight and colour belong to Button/Input/SearchField/Select/Composer. → fix: use the design-system component instead of re-deciding the border here.",
			controlRadius:
				"Raw <{{tag}}> sets its own corner radius ('{{cls}}') in layers/core-ui/src. A control's radius is Button/Input/SearchField/Select/Composer's to decide — a token-spelled radius passes design/radius-token-only and is still chrome the design system owns. → fix: use the design-system component instead of rounding a raw element.",
		},
	},
	create(context) {
		const filename = context.filename;
		if (!isInScope(filename)) return {};
		const resolveIdentifier = createConstIdentifierResolver(context);

		return {
			JSXOpeningElement(rawNode: unknown) {
				const node = rawNode as JSXOpeningElement;
				const tag = node.name.type === "JSXIdentifier" ? node.name.name : null;
				if (!(tag && CONTROL_TAGS.has(tag))) return;
				const attr = classNameAttrOf(node);
				if (!attr) return;
				const strings = collectClassStringsFromJSXAttributeDeep(attr, resolveIdentifier);
				// Clauses 3-5 are per-element: remember the first token that names
				// each axis, report once after the whole class list is read.
				let fill: string | null = null;
				let border: string | null = null;
				let radius: string | null = null;
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
						} else if (fill === null && token !== ROW_HOVER_TINT && CHROME_FILL_RE.test(token)) {
							fill = token;
						} else if (border === null && TOKEN_BORDER_RE.test(token)) {
							border = token;
						} else if (radius === null && RADIUS_RE.test(token)) {
							radius = token;
						}
					}
				}
				if (fill !== null) {
					context.report({
						node: asReportNode(node),
						messageId: "tokenFill",
						data: { tag, cls: fill },
					});
				}
				if (border !== null) {
					context.report({
						node: asReportNode(node),
						messageId: "tokenBorder",
						data: { tag, cls: border },
					});
				}
				if (radius !== null) {
					context.report({
						node: asReportNode(node),
						messageId: "controlRadius",
						data: { tag, cls: radius },
					});
				}
			},
		};
	},
});
