/**
 * design/no-ai-aesthetic
 *
 * Source of truth: AESTHETICS.md § AI-Aesthetic Anti-Patterns.
 * Maps to AQ-101..AQ-113. This rule fires the SCREENSHOT-DETECTABLE +
 * regex-detectable tells from that section's recommendations table.
 *
 * Tells covered here (each row's Lint hint column):
 *   #1  rounded-2xl / rounded-3xl              (allow rounded-full)
 *   #2  bg-gradient-{to,from,via}-{indigo|purple|violet|fuchsia|pink}-NNN
 *   #7  backdrop-blur / backdrop-filter        glassmorphism
 *   #10 shadow-{lg|xl|2xl} cards               (warn always; the file-name
 *                                              exemption for Modal/Dialog/Popover/Tooltip
 *                                              is handled by the dedicated
 *                                              skill rather than here, since
 *                                              this rule fires on a single
 *                                              warn level)
 *   #13 bg-clip-text + text-transparent        gradient-on-text
 */

import type { Rule } from "eslint";
import { SHADOW_OVERLAY_FILE_REGEX, createRule, getClassNameLiteral } from "../util.js";

const ROUNDED_2XL_3XL = /\brounded-(2xl|3xl)\b/;
// AESTHETICS.md § AI-Aesthetic tell #2 lint hint:
//   `\bbg-gradient-(to|from|via)-(indigo|purple|violet|fuchsia|pink)-\d{3}\b`
// In real Tailwind v3, the gradient direction (`bg-gradient-to-r`) and the
// color stop (`from-indigo-500`) are SEPARATE classes; we therefore fire when
// either:
//   (a) the literal regex from AESTHETICS.md matches, OR
//   (b) a `bg-gradient-*` class co-occurs with a `from|via|to-{ai-palette}-NNN`
//       color stop in the same className string.
const GRADIENT_AI_BG_LITERAL = /\bbg-gradient-(?:to|from|via)-(?:indigo|purple|violet|fuchsia|pink)-\d{2,3}\b/;
const GRADIENT_DIRECTION = /\bbg-gradient-(?:to-[a-z]+|from-|via-|to-)/;
const GRADIENT_AI_STOP = /\b(?:from|via|to)-(?:indigo|purple|violet|fuchsia|pink)-\d{2,3}\b/;
const BACKDROP_BLUR = /\bbackdrop-(?:blur|filter)(?:-[a-z0-9]+)?\b/;
const HEAVY_SHADOW = /\bshadow-(?:lg|xl|2xl)\b/;
const GRADIENT_TEXT_PARTS = [/\bbg-clip-text\b/, /\btext-transparent\b/];

export const noAiAesthetic: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Flag screenshot-detectable AI-aesthetic tells from AESTHETICS.md § AI-Aesthetic Anti-Patterns.",
			recommended: true,
		},
		schema: [],
		messages: {
			rounded2xl:
				"AI-aesthetic tell #1: '{{cls}}' uses oversized corner radius.  → fix: use the closed productivity scale rounded-[4px]/[8px]/[12px] or rounded-full for pills.",
			gradientBg:
				"AI-aesthetic tell #2: indigo/purple/violet/fuchsia/pink gradient background.  → fix: use a flat surface token (var(--surface-1..6)).",
			backdropBlur:
				"AI-aesthetic tell #7: glass morphism / backdrop-blur on productivity surfaces.  → fix: use a solid surface from the 7-level surface ladder.",
			heavyShadow:
				"AI-aesthetic tell #10: heavy shadow ({{cls}}) on a card-like surface.  → fix: use tonal layering via the surface ladder; reserve heavy shadow for Modal/Dialog/Popover/Tooltip and the --float overlay token.",
			gradientText:
				"AI-aesthetic tell #13: gradient-on-text (bg-clip-text + text-transparent).  → fix: use solid var(--text-hi); gradients on text are decoration without information.",
		},
	},
	create(context) {
		const filename = context.filename ?? context.getFilename();
		const isOverlayFile = SHADOW_OVERLAY_FILE_REGEX.test(filename);
		return {
			JSXAttribute(node) {
				const name = node.name && node.name.type === "JSXIdentifier" ? node.name.name : null;
				if (name !== "className") return;
				const literal = getClassNameLiteral(
					node as unknown as { value?: { type?: string; value?: unknown } | null },
				);
				if (literal === null) return;

				const m1 = ROUNDED_2XL_3XL.exec(literal);
				if (m1) {
					context.report({
						node,
						messageId: "rounded2xl",
						data: { cls: m1[0] },
					});
				}
				if (
					GRADIENT_AI_BG_LITERAL.test(literal) ||
					(GRADIENT_DIRECTION.test(literal) && GRADIENT_AI_STOP.test(literal))
				) {
					context.report({ node, messageId: "gradientBg" });
				}
				if (BACKDROP_BLUR.test(literal)) {
					context.report({ node, messageId: "backdropBlur" });
				}
				const m4 = HEAVY_SHADOW.exec(literal);
				if (m4 && !isOverlayFile) {
					context.report({
						node,
						messageId: "heavyShadow",
						data: { cls: m4[0] },
					});
				}
				if (
					GRADIENT_TEXT_PARTS[0].test(literal) &&
					GRADIENT_TEXT_PARTS[1].test(literal)
				) {
					context.report({ node, messageId: "gradientText" });
				}
			},
		};
	},
});
