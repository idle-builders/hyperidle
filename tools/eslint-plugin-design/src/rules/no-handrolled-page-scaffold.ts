/**
 * design/no-handrolled-page-scaffold
 *
 * AZ2 AC5 / VS3: a page under `layers/core-ui/src/pages/**` may not hand-write
 * a scrolling body — only `<PageScaffold>` from `@hyperidle/design-system` may.
 * The scroll contract (AZ2 round.md §2.3) is: *a scrolling body must be a flex
 * item of a flex column whose own height is bounded*. Two shapes are provably
 * either broken or a trap, and this rule reads static `className` string
 * literals for both (the same detection strategy as
 * `no-handrolled-page-header.ts` — read `className` string literals, report on
 * the literal node; it reuses that file's helpers).
 *
 * Arm 1 — a class string combining a grow token (`flex-1`) with a vertical
 *   scroll overflow (`overflow-y-auto`, `overflow-auto`, `overflow-y-scroll`).
 *   Only `PageScaffold`'s own scroll body may declare this; `PageScaffold.tsx`
 *   itself lives in `framework/design-system`, out of this rule's `pages/**`
 *   scope, so it is unaffected.
 * Arm 2 — a class string combining `flex-1` with `overflow-hidden` **without**
 *   `flex-col`. This is the exact `WorkTeam.tsx:709` shape (AZ2's live
 *   defect): a block wrapper that clips and gives its child nothing to size
 *   against. `PageScaffold`'s managed body is `flex-1 min-h-0 flex flex-col
 *   overflow-hidden` — it HAS `flex-col`, so it does not trip this arm.
 *
 * Honest limit: this rule reads static string literals only — the same
 * documented limit as `no-handrolled-page-header.ts`. `className={cx(...)}` or
 * a computed string slips past; the tests document this here too, not as a
 * silent gap. It stops the accident, not a determined bypass.
 */

import type { Rule } from "eslint";
import type { JSXAttribute } from "estree-jsx";
import { asReportNode, collectClassStringsFromJSXAttribute, createRule } from "../util.js";

const PAGES_SEGMENT = "layers/core-ui/src/pages/";

function isInPages(filename: string): boolean {
	return filename.replace(/\\/g, "/").includes(PAGES_SEGMENT);
}

const GROW_TOKEN = "flex-1";
const SCROLL_OVERFLOW_TOKENS = ["overflow-y-auto", "overflow-auto", "overflow-y-scroll"] as const;

function hasGrowToken(text: string): boolean {
	return text.includes(GROW_TOKEN);
}

function hasScrollOverflow(text: string): boolean {
	return SCROLL_OVERFLOW_TOKENS.some((token) => text.includes(token));
}

function hasOverflowHidden(text: string): boolean {
	return text.includes("overflow-hidden");
}

function hasFlexCol(text: string): boolean {
	return text.includes("flex-col");
}

export const noHandrolledPageScaffold: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid a hand-written scrolling page body in layers/core-ui/src/pages/**. " +
				"Use <PageScaffold> from @hyperidle/design-system — it owns the scroll contract.",
			recommended: true,
		},
		schema: [],
		messages: {
			handrolledScrollBody:
				"This file declares a scrolling page body by hand (`flex-1` + a scroll " +
				"overflow class). Use `<PageScaffold>` from @hyperidle/design-system — it " +
				"owns the scroll contract.",
			handrolledManagedBody:
				"This file combines `flex-1` with `overflow-hidden` but no `flex-col` — the " +
				"shape that clips content and gives its child nothing to size against. Use " +
				'`<PageScaffold body="managed">` from @hyperidle/design-system instead.',
		},
	},
	create(context) {
		const filename = context.filename;
		if (!isInPages(filename)) return {};

		return {
			// biome-ignore lint/style/useNamingConvention: ESLint visitor methods must match AST node type names
			JSXAttribute(rawNode: unknown) {
				const node = rawNode as JSXAttribute;
				if (node.type !== "JSXAttribute") return;
				if (node.name.type !== "JSXIdentifier" || node.name.name !== "className") return;

				const strings = collectClassStringsFromJSXAttribute(node);
				for (const { text, node: textNode } of strings) {
					if (!hasGrowToken(text)) continue;

					if (hasScrollOverflow(text)) {
						context.report({
							node: asReportNode(textNode),
							messageId: "handrolledScrollBody",
						});
						return; // one report per attribute
					}

					if (hasOverflowHidden(text) && !hasFlexCol(text)) {
						context.report({
							node: asReportNode(textNode),
							messageId: "handrolledManagedBody",
						});
						return; // one report per attribute
					}
				}
			},
		};
	},
});
