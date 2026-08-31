/**
 * design/no-handrolled-chip
 *
 * The chip half of the hand-rolled-chrome population. `StatusChip`, `Tag`,
 * `ReferenceChip`, `ArtifactKindBadge`, `RowDot`, `LiveDot` and `Avatar` are
 * the closed set for chip MEANING; a bare `<span>`/`<div>` that paints a pill
 * radius and a fill is the same visual shape assembled by hand, outside that
 * set. Set 1's "not a button" note and Set 5's status set don't reach it,
 * which is why it needed a rule of its own rather than a widening of an
 * existing one.
 *
 * Predicate: on an element whose tag is neither a control tag
 * (`button|input|textarea|select` — `no-handrolled-control`'s population, not
 * this one) nor one of the design-system chip components, a violation is
 * carrying BOTH
 *   1. a pill radius — `rounded-full`, `rounded[-side]-[var(--r-pill)]`, or
 *      `rounded-[9999px]`; AND
 *   2. a fill — `bg-[var(--{surface,accent,status}*)]` or `bg-[color-mix(…)]`.
 *
 * Both halves are required: a pill with no fill is an outline or a divider, a
 * fill with no pill is a surface. Together they are a chip.
 *
 * Reported once per element — a chip is one thing to migrate, however many
 * variant-prefixed spellings of its radius and fill appear in the class list.
 *
 * @lore Scoped the same way `no-handrolled-control` is (AZ7 Trade-off 4): the
 * rule's own filename check covers `layers/core-ui/src/**`, and `hearth-config`
 * wires it at error for core-ui and off for `ds/**` — the design system is
 * where chip chrome is BUILT. `Avatar.tsx`'s own avatar circle, `LiveDot.tsx`'s
 * own dot and `Progress.tsx`'s pill-shaped track all match this predicate and
 * are all correct where they are; that is a boundary, not a file allowance —
 * a chip forked INSIDE the design system is still a defect, caught by review.
 * The alternative was a path-keyed allowlist of the seven primitive files plus
 * every legitimately pill-shaped non-chip, which is the standing-exemption
 * shape this plugin already learned not to build (see `no-handrolled-control`'s
 * AZ7 N1 lore).
 *
 * @lore Shares `radius-token-only`'s `createConstIdentifierResolver` upgrade —
 * a chip whose class string sits in a same-file `const` before reaching
 * `className` is followed to its initializer instead of reading as clean.
 */

import type { Rule } from "eslint";
import type { JSXOpeningElement } from "estree-jsx";
import {
	asReportNode,
	collectClassStringsFromJSXAttributeDeep,
	createConstIdentifierResolver,
	createRule,
} from "../util.js";

// `no-handrolled-control`'s population, excluded here so a pill-shaped button
// is reported once, by the rule that owns controls.
const CONTROL_TAGS: ReadonlySet<string> = new Set(["button", "input", "textarea", "select"]);

// The design-system chip components. A `<Tag>` or `<StatusChip>` IS the chip
// primitive being used correctly — the whole point of the rule is to route
// hand-rolled pills into these.
const DS_CHIPS: ReadonlySet<string> = new Set([
	"StatusChip",
	"Tag",
	"ReferenceChip",
	"ArtifactKindBadge",
	"RowDot",
	"LiveDot",
	"Avatar",
]);

// Every spelling of the pill radius. `rounded-[var(--r-pill)]` is the token
// spelling `radius-token-only` enforces; `rounded-full` and `rounded-[9999px]`
// are its retired synonyms, matched here so this rule does not depend on that
// migration having finished.
const PILL_RADIUS_RE = /^rounded(?:-[a-z]{1,2})?-\[var\(--r-pill\)\]$/;

function isPillRadius(token: string): boolean {
	return token === "rounded-full" || token === "rounded-[9999px]" || PILL_RADIUS_RE.test(token);
}

// A token fill — the same predicate `no-handrolled-control` uses for the fill
// a control paints on itself.
const FILL_RE = /^bg-\[(?:var\(--(?:surface|accent|status)[a-z-]*\)|color-mix\([^\]]*\))\]$/;

// @lore Mirrors `no-handrolled-control`'s scope check exactly: core-ui is
// where chips are USED in a product surface. A fixture or a story that renders
// a pill to prove a class resolves is not a hand-rolled chip.
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

export const noHandrolledChip: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid a hand-rolled chip in layers/core-ui/src — an element that is neither a control nor a design-system chip component carrying a pill radius and a fill. Use StatusChip/Tag/ReferenceChip/ArtifactKindBadge/RowDot/LiveDot/Avatar instead.",
			recommended: true,
		},
		schema: [],
		messages: {
			handrolledChip:
				"<{{tag}}> paints a chip by hand ('{{pill}}' + '{{fill}}') in layers/core-ui/src. StatusChip/Tag/ReferenceChip/ArtifactKindBadge/RowDot/LiveDot/Avatar are the closed set for chip meaning. → fix: adopt the matching chip primitive, or — if this pill is none of their jobs — say so in a @lore note and disable this rule on the line.",
		},
	},
	create(context) {
		if (!isInScope(context.filename)) return {};
		const resolveIdentifier = createConstIdentifierResolver(context);

		return {
			JSXOpeningElement(rawNode: unknown) {
				const node = rawNode as JSXOpeningElement;
				const tag = node.name.type === "JSXIdentifier" ? node.name.name : null;
				if (!tag) return;
				if (CONTROL_TAGS.has(tag) || DS_CHIPS.has(tag)) return;
				const attr = classNameAttrOf(node);
				if (!attr) return;
				const strings = collectClassStringsFromJSXAttributeDeep(attr, resolveIdentifier);
				let pill: string | null = null;
				let fill: string | null = null;
				for (const { text } of strings) {
					for (const raw of text.split(/\s+/).filter(Boolean)) {
						// Strip responsive/state variant prefixes (hover:, lg:, dark:, …)
						// the same way every other class-scanning rule here does.
						const token = raw.replace(/^[a-z-]+:/, "");
						if (pill === null && isPillRadius(token)) pill = token;
						else if (fill === null && FILL_RE.test(token)) fill = token;
					}
				}
				if (pill !== null && fill !== null) {
					context.report({
						node: asReportNode(node),
						messageId: "handrolledChip",
						data: { tag, pill, fill },
					});
				}
			},
		};
	},
});
