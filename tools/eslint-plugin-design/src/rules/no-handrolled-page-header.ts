/**
 * design/no-handrolled-page-header
 *
 * AI7 AC3(c): Flags the inline page-title class combination
 *   `text-[20px]` + `font-[600]` + `tracking-[-0.01em]`
 * appearing as **string literals** on any JSX element in `layers/core-ui/src/pages/**`
 * whose name is NOT `PageHeader`.
 *
 * Rationale: this combo is the canonical Hearth page-title treatment, now owned
 * by the PageHeader primitive (AI7). Inline forks defeat the primitive abstraction
 * and will drift from the canonical treatment over time.
 *
 * Scope: `layers/core-ui/src/pages/**` only. Exclusions:
 *   - `design-system/` — PageHeader.tsx itself uses the literal (out of scope).
 *   - Components, shell, design-system outside pages/ — not in scope.
 *   - `SettingsPage.tsx` and `SetupFlow.tsx` are exempted via eslint.config.ts
 *     block `ignores` (AG7 and onboarding own those migrations). The RULE fires on
 *     them; the config suppresses. See architecture.md § task 10 rationale.
 *
 * Compliance escape hatches (must NOT fire):
 *   1. `className={`${pageTitleClassName} …`}` — template-literal with an
 *      identifier expression. collectClassStringsFromJSXAttribute extracts only
 *      the static quasi text (" bg-transparent border-none ...") — the
 *      pageTitleClassName identifier contributes no string, so the combo is
 *      never assembled as a literal. This falls out naturally; no special case.
 *   2. The combo inside `<PageHeader` JSX elements — the rule checks the JSX
 *      element name and skips `PageHeader`.
 *   3. The combo in design-system files — out of scope (file path guard).
 *
 * Literal-only detection: the rule reports on the STRING NODE (text.node) so
 * the report points at the exact literal fragment. It only reads static strings
 * — identifier values are never resolved.
 *
 * @lore AI7-W1: The identifier-reference escape hatch works because
 * collectClassStringsFromExpression has no `Identifier` case in walk() —
 * only static quasi text from TemplateLiteral is extracted.
 */

import type { Rule } from "eslint";
import type { JSXAttribute } from "estree-jsx";
import { asReportNode, collectClassStringsFromJSXAttribute, createRule } from "../util.js";

const PAGES_SEGMENT = "layers/core-ui/src/pages/";

function isInPages(filename: string): boolean {
	return filename.replace(/\\/g, "/").includes(PAGES_SEGMENT);
}

/** All three tokens must appear in the same class string for it to be the combo. */
const COMBO_TOKENS = ["text-[20px]", "font-[600]", "tracking-[-0.01em]"] as const;

function hasCombo(text: string): boolean {
	return COMBO_TOKENS.every((token) => text.includes(token));
}

export const noHandrolledPageHeader: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid the inline page-title class combo " +
				"(`text-[20px]` + `font-[600]` + `tracking-[-0.01em]`) on non-PageHeader " +
				"elements in layers/core-ui/src/pages/**. Use `<PageHeader>` from " +
				"@hyperidle/design-system instead, or compose `pageTitleClassName` for " +
				"editable title inputs.",
			recommended: true,
		},
		schema: [],
		messages: {
			handrolledPageHeader:
				"Inline page-title class combo detected (`text-[20px]` + `font-[600]` + `tracking-[-0.01em]`). " +
				'Use `<PageHeader title="...">` from @hyperidle/design-system, or compose ' +
				"`pageTitleClassName` for an editable title `<input>`.",
		},
	},
	create(context) {
		const filename = context.filename;
		if (!isInPages(filename)) return {};

		return {
			JSXAttribute(rawNode: unknown) {
				const node = rawNode as JSXAttribute;
				if (node.type !== "JSXAttribute") return;
				if (node.name.type !== "JSXIdentifier" || node.name.name !== "className") return;

				// Walk up to find the JSXOpeningElement and check its name.
				// Skip <PageHeader> — it is the canonical owner of this combo.
				const parent = (node as { parent?: { type?: string; name?: unknown } }).parent;
				if (parent?.type === "JSXOpeningElement") {
					const nameNode = parent.name as { type?: string; name?: string } | undefined;
					if (nameNode?.type === "JSXIdentifier" && nameNode.name === "PageHeader") {
						return;
					}
				}

				const strings = collectClassStringsFromJSXAttribute(node);
				for (const { text, node: textNode } of strings) {
					if (hasCombo(text)) {
						context.report({
							node: asReportNode(textNode),
							messageId: "handrolledPageHeader",
						});
						return; // one report per attribute
					}
				}
			},
		};
	},
});
