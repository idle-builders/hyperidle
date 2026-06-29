/**
 * design/no-off-scale-radius
 *
 * Maps to AQ-011.
 * Source: tokens.css `--r-none:0 --r-subtle:10px --r-default:16px --r-pill:9999px`.
 * Hearth closed scale: {0,10,16,9999}.
 *
 * @lore U10: Significant reversal from K6. Old Lucid scale {0,4,8,12,999};
 * new Hearth scale {0,10,16,9999}. rounded-2xl (16px) is now ON-SCALE — it maps
 * to --r-default (the Hearth default card radius). rounded-lg (8px) and rounded-xl
 * (12px) are now OFF-SCALE. Form control chrome (checkboxes, radio buttons) may
 * use off-scale radii per AQ-011 exemption — DaisyUI manages these in production.
 *
 * Two detection paths:
 *   1. Arbitrary `rounded-[Npx]` — N must be in {0,10,16,>=9999}.
 *   2. Named Tailwind radii (`rounded`, `rounded-sm`, `rounded-md`, etc.) — only
 *      the named classes whose Tailwind v3 px value lands on the Hearth closed
 *      scale are allowed (rounded-none/rounded-2xl/rounded-full). All others fire.
 */

import type { Rule } from "eslint";
import type { JSXAttribute } from "estree-jsx";
import {
	ALLOWED_NAMED_RADIUS,
	collectClassStringsFromJSXAttribute,
	createRule,
	RADIUS_ALLOWLIST,
} from "../util.js";

const ARBITRARY_RADIUS = /\brounded(?:-[a-z]+)?-\[(\d+)px\]/g;
// Named radii: `rounded`, `rounded-sm`, `rounded-md`, ... but NOT `rounded-[...]`
// (that's the arbitrary path) and NOT corner-specific shorthands like
// `rounded-tl`, `rounded-t`, `rounded-bl`, etc.
// We capture the named suffix (or empty for plain `rounded`).
// The negative lookahead `(?!-(?:tl|tr|bl|br|t|r|b|l)\b)` excludes corner/side
// shorthands that take the named scale via Tailwind defaults.
// The `(?!-\[)` excludes arbitrary-value forms like `rounded-[Npx]`.
const NAMED_RADIUS =
	/\brounded(-(?:none|sm|md|lg|xl|2xl|3xl|full))?\b(?!-(?:tl|tr|bl|br|t|r|b|l)\b)(?!-\[)/g;

export const noOffScaleRadius: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid border-radius values not in the Hearth closed scale (tokens.css --r-none/--r-subtle/--r-default/--r-pill = 0/10/16/9999px). Catches both arbitrary `rounded-[Npx]` and named Tailwind radii off-scale (e.g., `rounded` = 4px, `rounded-lg` = 8px, `rounded-xl` = 12px).",
			recommended: true,
		},
		schema: [],
		messages: {
			offScale:
				"Radius {{n}}px is off-scale (Hearth allowed: {0,10,16,9999}).  → fix: use rounded-none / rounded-[10px] / rounded-2xl / rounded-full, or the design-system token (var(--r-none), var(--r-subtle), var(--r-default), var(--r-pill)).",
			namedOffScale:
				"Tailwind radius '{{cls}}' ({{n}}px) is off the Hearth closed scale {0,10,16,9999}.  → fix: use rounded-none (0) / rounded-2xl (16px) / rounded-full (9999px), or a tokens.css var(--r-none, --r-subtle, --r-default, --r-pill).",
		},
	},
	create(context) {
		// Mapping from named-radius suffix → px (Tailwind v4 defaults — same values as v3).
		const NAMED_PX: Record<string, number> = {
			"": 4, // `rounded` alone
			"-none": 0,
			"-sm": 2,
			"-md": 6,
			"-lg": 8,
			"-xl": 12,
			"-2xl": 16,
			"-3xl": 24,
			"-full": 9999,
		};
		function checkClassString(text: string, node: unknown): void {
			const reportNode = node as Rule.Node;
			for (const match of text.matchAll(ARBITRARY_RADIUS)) {
				const n = Number(match[1]);
				if (n >= 9999) continue;
				if (!RADIUS_ALLOWLIST.has(n)) {
					context.report({
						node: reportNode,
						messageId: "offScale",
						data: { n: String(n) },
					});
				}
			}
			for (const match of text.matchAll(NAMED_RADIUS)) {
				const suffix = match[1] ?? "";
				// strip leading '-' for allowlist lookup
				const key = suffix.startsWith("-") ? suffix.slice(1) : suffix;
				if (ALLOWED_NAMED_RADIUS.has(key)) continue;
				const px = NAMED_PX[suffix];
				if (typeof px !== "number") continue;
				context.report({
					node: reportNode,
					messageId: "namedOffScale",
					data: { cls: match[0], n: String(px) },
				});
			}
		}
		return {
			JSXAttribute(rawNode: unknown) {
				const node = rawNode as JSXAttribute;
				const name =
					node.type === "JSXAttribute" && node.name.type === "JSXIdentifier"
						? node.name.name
						: null;
				if (name !== "className") return;
				const strings = collectClassStringsFromJSXAttribute(node);
				for (const { text } of strings) {
					checkClassString(text, node);
				}
			},
		};
	},
});
