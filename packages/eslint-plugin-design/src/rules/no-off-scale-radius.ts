/**
 * design/no-off-scale-radius
 *
 * Maps to AQ-011.
 * Source: tokens.css `--r0:0 --r1:4px --r2:8px --r3:12px --r-pill:999px`.
 * Closed scale: {0,4,8,12,9999}. `rounded-full` is permitted (pill).
 */

import type { Rule } from "eslint";
import { RADIUS_ALLOWLIST, createRule, getClassNameLiteral } from "../util.js";

const ARBITRARY_RADIUS = /\brounded(?:-[a-z]+)?-\[(\d+)px\]/g;

export const noOffScaleRadius: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid arbitrary border-radius values not in the closed scale (tokens.css --r0..r3 + pill).",
			recommended: true,
		},
		schema: [],
		messages: {
			offScale:
				"Radius {{n}}px is off-scale (allowed: {0,4,8,12,999}).  → fix: use rounded-none / rounded-[4px] / rounded-[8px] / rounded-[12px] / rounded-full, or the design-system token (var(--r0..r3), var(--r-pill)).",
		},
	},
	create(context) {
		return {
			JSXAttribute(node) {
				const name = node.name && node.name.type === "JSXIdentifier" ? node.name.name : null;
				if (name !== "className") return;
				const literal = getClassNameLiteral(
					node as unknown as { value?: { type?: string; value?: unknown } | null },
				);
				if (literal === null) return;
				let match: RegExpExecArray | null;
				ARBITRARY_RADIUS.lastIndex = 0;
				while ((match = ARBITRARY_RADIUS.exec(literal)) !== null) {
					const n = Number(match[1]);
					// pill (>= 999) is allowed
					if (n >= 999) continue;
					if (!RADIUS_ALLOWLIST.has(n)) {
						context.report({
							node,
							messageId: "offScale",
							data: { n: String(n) },
						});
					}
				}
			},
		};
	},
});
