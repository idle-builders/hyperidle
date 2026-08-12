/**
 * design/radius-token-only
 *
 * AZ7 E6 / Set 4 (framework/design-system/DESIGN.md § Radius). Replaces
 * `no-off-scale-radius` outright rather than extending it — the old rule's
 * allowlist explicitly PERMITTED `rounded-full` (AQ-101: "rounded-full is
 * always allowed for pills"), which is exactly the defect AZ7 closes: pill
 * had two spellings (`rounded-full` × 69, `rounded-[var(--r-pill)]` × 87)
 * and any computed-style measurement of the app reported the browser's clamp
 * of `rounded-full` (`calc(infinity * 1px)` → 33,554,432px) as an "off-scale"
 * radius, when it is really the pill read through its other spelling.
 *
 * Predicate (combined-round.md §5.2, restated so a reviewer can re-derive the
 * population from `predicates.mjs`): a class token matching the shape of a
 * Tailwind radius utility — named (`rounded`, `rounded-lg`, `rounded-tl-md`, …)
 * or arbitrary (`rounded-[8px]`) — is a violation UNLESS it is `rounded-none`
 * (Set 4's zero-radius member has no token — "no radius class, or rounded-none")
 * or a `--r-*` token spelling (`rounded-[var(--r-none|subtle|default|pill)]`,
 * with an optional side/corner infix).
 *
 * @lore AZ7 Trade-off 1: `rounded-full` is retired in favor of
 * `rounded-[var(--r-pill)]` (not the reverse) — the token spelling means every
 * radius in the app computes to a value ON the documented scale, so a future
 * computed-style measurement reads clean instead of reporting the pill as an
 * off-scale outlier again.
 *
 * @lore AZ7 AQ-011 form-control exemption: `Checkbox.tsx`'s 20×20px box uses
 * `rounded-[6px]` — off the 4-value scale by VALUE, not just spelling, and
 * deliberately so (none of 0/10/16/9999 reads right on a small checkbox; the
 * design-system's own comment there predates AZ7 and cites this exemption).
 * `no-off-scale-radius` never actually enforced this exemption — it silently
 * missed the site entirely (the `[...].join(" ")` walker gap, see
 * `util.ts`'s `collectClassStringsFromExpressionDeep` lore) — so this is the
 * first time the exemption needed encoding for real. `Toggle.tsx` needs no
 * exemption (already token-pill throughout); it is listed anyway so a future
 * hand-rolled form control doesn't have to rediscover this list.
 */

import { basename } from "node:path";
import type { Rule } from "eslint";
import type { JSXAttribute } from "estree-jsx";
import {
	asReportNode,
	collectClassStringsFromJSXAttributeDeep,
	createRule,
} from "../util.js";

// AQ-011: "Form control chrome (checkboxes, radio buttons, toggles) may use
// off-scale radii." These are the design-system files that BUILD that chrome.
const FORM_CONTROL_BASENAME_RE = /^(Checkbox|Toggle)\.tsx$/;

// Named or arbitrary radius utility, with an optional side/corner infix
// (t/r/b/l/tl/tr/bl/br/s/e/ss/se/es/ee — Tailwind v4's logical + physical sides).
const RADIUS_TOKEN_RE =
	/^rounded(-(?:t|r|b|l|tl|tr|bl|br|s|e|ss|se|es|ee))?(-(?:none|xs|sm|md|lg|xl|2xl|3xl|4xl|full))?(-\[[^\]]+\])?$/;

// The only permitted non-`none` spelling: a --r-* token, arbitrary-value form,
// with the same optional side/corner infix.
const TOKEN_ONLY_RE =
	/^rounded(-(?:t|r|b|l|tl|tr|bl|br|s|e|ss|se|es|ee))?-\[var\(--r-(?:none|subtle|default|pill)\)\]$/;

function isViolation(token: string): boolean {
	if (!RADIUS_TOKEN_RE.test(token)) return false;
	if (token === "rounded-none") return false;
	if (TOKEN_ONLY_RE.test(token)) return false;
	return true;
}

export const radiusTokenOnly: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid any radius spelling other than a --r-* token (or rounded-none for zero radius). Closes AZ7 Set 4 — the Hearth radius scale has exactly one spelling per value: rounded-none, rounded-[var(--r-subtle)], rounded-[var(--r-default)], rounded-[var(--r-pill)].",
			recommended: true,
		},
		schema: [],
		messages: {
			notAToken:
				"Radius class '{{cls}}' is not a --r-* token. AZ7 Set 4 has exactly one spelling per radius: rounded-none (0), rounded-[var(--r-subtle)] (10px), rounded-[var(--r-default)] (16px), rounded-[var(--r-pill)] (9999px). → fix: replace '{{cls}}' with the matching token spelling.",
		},
	},
	create(context) {
		if (FORM_CONTROL_BASENAME_RE.test(basename(context.filename))) return {};
		return {
			JSXAttribute(rawNode: unknown) {
				const node = rawNode as JSXAttribute;
				const name =
					node.type === "JSXAttribute" && node.name.type === "JSXIdentifier"
						? node.name.name
						: null;
				if (name !== "className") return;
				const strings = collectClassStringsFromJSXAttributeDeep(node);
				for (const { text, node: strNode } of strings) {
					for (const raw of text.split(/\s+/).filter(Boolean)) {
						// Strip responsive/state variant prefixes (hover:, lg:, dark:, …)
						// the same way the AZ7 measurement scanner does.
						const token = raw.replace(/^[a-z-]+:/, "");
						if (isViolation(token)) {
							context.report({
								node: asReportNode(strNode),
								messageId: "notAToken",
								data: { cls: token },
							});
						}
					}
				}
			},
		};
	},
});
