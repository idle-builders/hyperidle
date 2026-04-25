/**
 * design/no-off-scale-radius
 *
 * Maps to AQ-011.
 * Source: tokens.css `--r0:0 --r1:4px --r2:8px --r3:12px --r-pill:999px`.
 * Closed scale: {0,4,8,12,9999}. `rounded-full` is permitted (pill).
 *
 * Two detection paths:
 *   1. Arbitrary `rounded-[Npx]` — N must be in {0,4,8,12,>=999}.
 *   2. Named Tailwind radii (`rounded`, `rounded-sm`, `rounded-md`, etc.) — only
 *      the named classes whose default Tailwind v3 px value lands on the
 *      closed scale are allowed (rounded-none/rounded/rounded-lg/rounded-xl/
 *      rounded-full). `rounded-sm` (2px), `rounded-md` (6px), `rounded-2xl`
 *      (16px), `rounded-3xl` (24px) all fire here.
 */

import type { Rule } from "eslint";
import {
	ALLOWED_NAMED_RADIUS,
	collectClassStringsFromJSXAttribute,
	createRule,
	RADIUS_ALLOWLIST,
} from "../util.js";

const ARBITRARY_RADIUS = /\brounded(?:-[a-z]+)?-\[(\d+)px\]/g;
// Named radii: `rounded`, `rounded-sm`, `rounded-md`, ... but NOT `rounded-[...]`
// (that's the arbitrary path) and NOT corner-specific arbitraries like
// `rounded-tl-[6px]`. We capture the named suffix (or empty for plain `rounded`).
// Excludes corner shorthands (rounded-t/r/b/l, rounded-tl/tr/bl/br) — those
// take the named radius from the same scale via Tailwind defaults.
const NAMED_RADIUS = /\brounded(-(?:none|sm|md|lg|xl|2xl|3xl|full))?\b(?!-\[)/g;

export const noOffScaleRadius: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid border-radius values not in the closed scale (tokens.css --r0..r3 + pill). Catches both arbitrary `rounded-[Npx]` and named Tailwind radii whose default value is off-scale (e.g., `rounded-sm` = 2px, `rounded-md` = 6px, `rounded-2xl` = 16px).",
			recommended: true,
		},
		schema: [],
		messages: {
			offScale:
				"Radius {{n}}px is off-scale (allowed: {0,4,8,12,999}).  → fix: use rounded-none / rounded-[4px] / rounded-[8px] / rounded-[12px] / rounded-full, or the design-system token (var(--r0..r3), var(--r-pill)).",
			namedOffScale:
				"Tailwind radius '{{cls}}' ({{n}}px) is off the closed scale {0,4,8,12,999}.  → fix: use rounded-none / rounded (4px) / rounded-lg (8px) / rounded-xl (12px) / rounded-full, or a tokens.css var(--r0..r3, --r-pill).",
		},
	},
	create(context) {
		// Mapping from named-radius suffix → px (Tailwind v3 defaults).
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
			let match: RegExpExecArray | null;
			ARBITRARY_RADIUS.lastIndex = 0;
			while ((match = ARBITRARY_RADIUS.exec(text)) !== null) {
				const n = Number(match[1]);
				if (n >= 999) continue;
				if (!RADIUS_ALLOWLIST.has(n)) {
					context.report({
						node: reportNode,
						messageId: "offScale",
						data: { n: String(n) },
					});
				}
			}
			NAMED_RADIUS.lastIndex = 0;
			while ((match = NAMED_RADIUS.exec(text)) !== null) {
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
			JSXAttribute(node) {
				const name = node.name && node.name.type === "JSXIdentifier" ? node.name.name : null;
				if (name !== "className") return;
				const strings = collectClassStringsFromJSXAttribute(node);
				for (const { text } of strings) {
					checkClassString(text, node);
				}
			},
		};
	},
});
