/**
 * design/no-undefined-font-heading
 *
 * AI7 AC1(b): Two-arm rule.
 *
 * ARM 1 — `font-heading` (undefined utility, defect anywhere in web src):
 *   The Tailwind config has no `heading` fontFamily — only `sans` and `mono`.
 *   Any `font-heading` class silently drops with no visual effect. This is a
 *   real defect (not a style choice) so the rule reports on ALL files it runs on.
 *   Severity is set by eslint.config.ts (error everywhere the rule runs).
 *
 * ARM 2 — `tracking-wider` (valid Tailwind utility, but a page-title deviation):
 *   `tracking-wider` = 0.05em. Pages should use the Hearth caps token
 *   (0.06em via SectionLabel) or the negative-em title kerning via PageHeader.
 *   The class is VALID and is used intentionally in many non-page files
 *   (ArtifactSection, ArtifactThreadsSummary, TaskSheet, BlockRefEmbed,
 *   SessionView, ThreadSections, DesignSystem).
 *   → This arm fires ONLY when `context.filename` contains a `pages/` path segment.
 *   The eslint.config.ts error-level web-src block for this rule never triggers
 *   the tracking-wider arm because those files are not under pages/.
 *
 * @lore AI7: tracking-wider is self-gated to /pages/ paths inside the rule so
 * a single error-level web-src config block never red-lines legitimate usages in
 * components, shell, or design-system. Font-heading fires everywhere because it
 * is never legitimate.
 */

import type { Rule } from "eslint";
import type { JSXAttribute } from "estree-jsx";
import { asReportNode, collectClassStringsFromJSXAttribute, createRule } from "../util.js";

/** Path segment that marks a pages/** file. */
const PAGES_SEGMENT = "/pages/";

function isInPages(filename: string): boolean {
	return filename.replace(/\\/g, "/").includes(PAGES_SEGMENT);
}

/** Heading element names where tracking-wider is a scale deviation. */
const HEADING_ELEMENTS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

export const noUndefinedFontHeading: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid `font-heading` (undefined Tailwind utility — Tailwind config has no `heading` fontFamily) " +
				"and `tracking-wider` inside pages/** (valid utility but a deviation on the Hearth title/section scale — " +
				"use PageHeader / SectionLabel primitives instead).",
			recommended: true,
		},
		schema: [],
		messages: {
			fontHeadingUndefined:
				"`font-heading` is not a valid Tailwind utility — the Tailwind config has no `heading` fontFamily " +
				"(only `sans` and `mono`). Use `font-[600]` or `font-[500]` from the Hearth type scale, " +
				"or `PageHeader` / `SectionLabel` primitives for page headings.",
			trackingWiderInPages:
				"`tracking-wider` (0.05em) deviates from the Hearth title/section scale in pages/**. " +
				"Use `<PageHeader>` (title: tracking-[-0.01em]) or `<SectionLabel>` " +
				"(section: tracking-[var(--tracking-caps-sm)] = 0.06em) instead.",
		},
	},
	create(context) {
		const filename = context.filename;
		const inPages = isInPages(filename);

		return {
			JSXAttribute(rawNode: unknown) {
				const node = rawNode as JSXAttribute;
				if (node.type !== "JSXAttribute") return;
				if (node.name.type !== "JSXIdentifier" || node.name.name !== "className") return;

				// Resolve the JSX element name from the parent JSXOpeningElement.
				// Used to scope the tracking-wider arm to heading elements (h1-h6).
				let elementName = "";
				const parent = (node as { parent?: { type?: string; name?: unknown } }).parent;
				if (parent?.type === "JSXOpeningElement") {
					const nameNode = parent.name as { type?: string; name?: string } | undefined;
					if (nameNode?.type === "JSXIdentifier") {
						elementName = nameNode.name ?? "";
					}
				}

				const isHeading = HEADING_ELEMENTS.has(elementName);
				const strings = collectClassStringsFromJSXAttribute(node);
				let reportedFontHeading = false;
				let reportedTrackingWider = false;

				for (const { text } of strings) {
					// ARM 1: font-heading — always flag (undefined utility anywhere)
					// Report once per attribute (first hit), on the attribute node.
					if (!reportedFontHeading && /\bfont-heading\b/.test(text)) {
						reportedFontHeading = true;
						context.report({
							node: asReportNode(node),
							messageId: "fontHeadingUndefined",
						});
					}

					// ARM 2: tracking-wider — only flag inside pages/** AND on heading elements.
					// Valid Tailwind utility intentionally used in many non-page and non-heading contexts.
					// On pages, only a heading element using tracking-wider is a title-scale deviation.
					if (!reportedTrackingWider && inPages && isHeading && /\btracking-wider\b/.test(text)) {
						reportedTrackingWider = true;
						context.report({
							node: asReportNode(node),
							messageId: "trackingWiderInPages",
						});
					}
				}
			},
		};
	},
});
