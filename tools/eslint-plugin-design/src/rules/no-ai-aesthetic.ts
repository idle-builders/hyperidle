/**
 * design/no-ai-aesthetic
 *
 * Source of truth: AESTHETICS.md § AI-Aesthetic Anti-Patterns.
 * Maps to AQ-101..AQ-113. This rule fires the SCREENSHOT-DETECTABLE +
 * regex-detectable tells from that section's recommendations table.
 *
 * Tells covered here (each row's Lint hint column):
 *   #1  rounded-3xl (AQ-101 — NOTE: rounded-2xl is now on-scale in Hearth)
 *   #2  bg-gradient-{to,from,via}-{indigo|...}-NNN      (AQ-102)
 *   #3  oversized padding p-(8|10|12|14|16)             (AQ-103)
 *   #5  decorative emoji in JSX text content            (AQ-105 — partial)
 *   #7  backdrop-blur / backdrop-filter glassmorphism   (AQ-107)
 *   #10 shadow-{lg|xl|2xl} cards (overlay-file exempt)  (AQ-110)
 *   #11 Lorem ipsum / placeholder text                  (AQ-109)
 *   #12 marketing copy in product chrome                (AQ-110)
 *   #13 bg-clip-text + text-transparent                 (AQ-111)
 *
 * Tells NOT covered (require richer AST/context — handled by /design-lint
 * skill or future rules): #4 hero sections, #6 page-level text-center,
 * @lore AD8a: "nav-rail color" is a design pattern term (not HyperIdle Rail). #8 font stack assertion, #9 3-col card grid, #14 nav-rail color,
 * #15 over-iconification.
 *
 * @lore U10: AQ-101 updated — rounded-2xl (16px) is now ON-SCALE in Hearth
 * (maps to --r-default). Only rounded-3xl (24px) remains an AI-aesthetic tell.
 * The messageId is renamed from `rounded2xl` to `rounded3xl` to reflect this.
 * The ROUNDED_2XL_3XL regex is narrowed to match only rounded-3xl.
 */

import type { JSSyntaxElement, Rule } from "eslint";
import type { JSXAttribute, JSXText } from "estree-jsx";
import {
	asReportNode,
	collectClassStringsFromExpression,
	collectClassStringsFromJSXAttribute,
	createRule,
	isInsideClassNameAttribute,
	isShadowOverlayFile,
} from "../util.js";

// U10 Hearth: rounded-2xl (16px) is now ON-SCALE (maps to --r-default).
// Only rounded-3xl (24px) remains an AI-aesthetic tell.
const ROUNDED_3XL = /\brounded-3xl\b/;

// AESTHETICS.md § AI-Aesthetic tell #2 lint hint:
//   `\bbg-gradient-(to|from|via)-(indigo|purple|violet|fuchsia|pink)-\d{3}\b`
// In real Tailwind v3, the gradient direction (`bg-gradient-to-r`) and the
// color stop (`from-indigo-500`) are SEPARATE classes. The literal regex from
// AESTHETICS.md never matches real code; we therefore fire when EITHER:
//   (a) the literal regex matches (forward-compat with future Tailwind that
//       fuses direction+stop), OR
//   (b) a `bg-gradient-*` direction class co-occurs with a `from|via|to-{ai-palette}-NNN`
//       color stop in the same className composition.
//
// @lore K6 review SEV-2 #8: this is an intentional deviation from the literal
// regex in AESTHETICS.md table line 288 (Tailwind v3 splits the classes; the
// literal can never match). A K1 amendment to fix the source-of-truth regex
// is filed; until it lands, the K1 → K6 invariant ("no rule encodes a value
// not in AESTHETICS.md") is satisfied at the value level (palette names, class
// prefixes are unchanged) — only the composition rule differs.
//
// @lore upgrade-deferred: Tailwind v4 renames `bg-gradient-to-*` → `bg-linear-*`
// and adds `bg-radial-*`. Both v3 and v4 direction prefixes are matched so the
// rule fires on code written for either Tailwind version.
const GRADIENT_AI_BG_LITERAL =
	/\bbg-(?:gradient-(?:to|from|via)|linear|radial)-(?:to|from|via)?-?(?:indigo|purple|violet|fuchsia|pink)-\d{2,3}\b/;
const GRADIENT_DIRECTION = /\bbg-(?:gradient-(?:to-[a-z]+|from-|via-|to-)|linear-to-|radial-at-)/;
const GRADIENT_AI_STOP = /\b(?:from|via|to)-(?:indigo|purple|violet|fuchsia|pink)-\d{2,3}\b/;

const BACKDROP_BLUR = /\bbackdrop-(?:blur|filter)(?:-[a-z0-9]+)?\b/;
const HEAVY_SHADOW = /\bshadow-(?:lg|xl|2xl)\b/;
const GRADIENT_TEXT_BG_CLIP = /\bbg-clip-text\b/;
const GRADIENT_TEXT_TRANSPARENT = /\btext-transparent\b/;

// AESTHETICS.md tell #3 lint hint: regex `/\b(p|px|py)-(8|10|12|14|16)\b/`
const OVERSIZED_PADDING = /\b(?:p|px|py)-(?:8|10|12|14|16)\b/;

// AESTHETICS.md tell #11 lint hint: `/\b(Lorem ipsum|consectetur adipiscing|Click here)\b/i`
const LOREM_IPSUM = /\b(Lorem ipsum|consectetur adipiscing|Click here)\b/i;

// AESTHETICS.md tell #12 lint hint: superlative marketing copy in product chrome.
// We match the catalogued words in JSX text nodes (case-sensitive — these are
// always written capitalised in the wild; lowercase usage is more often valid
// product copy).
const MARKETING_COPY = /\b(Effortless|Seamless|Powerful|Beautiful|Stunning|Game-changing)\b/;

// AESTHETICS.md tell #5 lint hint: leading emoji on Button/NavItem/StatusChip
// labels. We can't easily detect parent component from a JSX text node in a
// regex rule — so we fire on any leading-emoji JSX text node (the spec marks
// this as `partial`; the parent-aware variant is a future refinement). The
// /design-lint skill catches the contextual case.
const LEADING_EMOJI = /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

export const noAiAesthetic: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description: "Flag screenshot-detectable AI-aesthetic tells.",
			recommended: true,
		},
		schema: [],
		messages: {
			rounded3xl:
				"AI-aesthetic tell #1: '{{cls}}' uses off-scale corner radius (24px).  → fix: use the Hearth closed scale rounded-none (0) / rounded-2xl (16px) / rounded-full (pill), or a token (var(--r-none), var(--r-default), var(--r-pill)).",
			gradientBg:
				"AI-aesthetic tell #2: indigo/purple/violet/fuchsia/pink gradient background.  → fix: use a flat surface token (var(--surface-1..6)).",
			oversizedPadding:
				"AI-aesthetic tell #3: '{{cls}}' is oversized productivity padding (32-64px).  → fix: use a Hearth spacing token (var(--space-4) 12px, var(--space-6) 18px, var(--space-8) 24px) — productivity defaults sit at 12-24px.",
			backdropBlur:
				"AI-aesthetic tell #7: glass morphism / backdrop-blur on productivity surfaces.  → fix: use a solid surface from the 7-level surface ladder.",
			heavyShadow:
				"AI-aesthetic tell #10: heavy shadow ({{cls}}) on a card-like surface.  → fix: use tonal layering via the surface ladder; reserve heavy shadow for Modal/Dialog/Popover/Tooltip and the --float overlay token.",
			loremIpsum:
				"AI-aesthetic tell #11: placeholder copy ('{{value}}') in committed source.  → fix: use realistic content matching the actual use case.",
			marketingCopy:
				"AI-aesthetic tell #12: marketing superlative ('{{value}}') in product chrome.  → fix: use a literal task label (e.g. 'Pitch review', 'Threads', 'Knowledge').",
			gradientText:
				"AI-aesthetic tell #13: gradient-on-text (bg-clip-text + text-transparent).  → fix: use solid var(--text-hi); gradients on text are decoration without information.",
			leadingEmoji:
				"AI-aesthetic tell #5: leading emoji in JSX text.  → fix: use a vector icon from Lucide; emoji-as-iconography is a recognized AI-default.",
		},
	},
	create(context) {
		const filename = context.filename;
		const isOverlayFile = isShadowOverlayFile(filename);

		function checkClassString(text: string, node: { type: string }): void {
			const reportNode: JSSyntaxElement = asReportNode(node);
			const m1 = ROUNDED_3XL.exec(text);
			if (m1) {
				context.report({
					node: reportNode,
					messageId: "rounded3xl",
					data: { cls: m1[0] },
				});
			}
			if (
				GRADIENT_AI_BG_LITERAL.test(text) ||
				(GRADIENT_DIRECTION.test(text) && GRADIENT_AI_STOP.test(text))
			) {
				context.report({ node: reportNode, messageId: "gradientBg" });
			}
			const mPad = OVERSIZED_PADDING.exec(text);
			if (mPad) {
				context.report({
					node: reportNode,
					messageId: "oversizedPadding",
					data: { cls: mPad[0] },
				});
			}
			if (BACKDROP_BLUR.test(text)) {
				context.report({ node: reportNode, messageId: "backdropBlur" });
			}
			const mShadow = HEAVY_SHADOW.exec(text);
			if (mShadow && !isOverlayFile) {
				context.report({
					node: reportNode,
					messageId: "heavyShadow",
					data: { cls: mShadow[0] },
				});
			}
			if (GRADIENT_TEXT_BG_CLIP.test(text) && GRADIENT_TEXT_TRANSPARENT.test(text)) {
				context.report({ node: reportNode, messageId: "gradientText" });
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
			// cn()/clsx() called outside a JSXAttribute (e.g., assigned to a
			// variable, used in object className maps). Walk arguments for
			// embedded class strings. Skip when an enclosing className JSXAttribute
			// already walked these args (avoids double-firing).
			CallExpression(node) {
				const callee = node.callee as { type: string; name?: string };
				if (
					callee.type !== "Identifier" ||
					!callee.name ||
					!(
						callee.name === "cn" ||
						callee.name === "clsx" ||
						callee.name === "classnames" ||
						callee.name === "twMerge" ||
						callee.name === "twJoin"
					)
				) {
					return;
				}
				if (isInsideClassNameAttribute(node)) {
					return;
				}
				const collected = collectClassStringsFromExpression(node);
				for (const { text } of collected) {
					checkClassString(text, node);
				}
			},
			// JSX text nodes: scan for lorem/marketing/leading-emoji.
			JSXText(rawNode: unknown) {
				const node = rawNode as JSXText;
				const value = node.value;
				if (typeof value !== "string") return;
				const trimmed = value.trim();
				if (trimmed.length === 0) return;
				const mLorem = LOREM_IPSUM.exec(trimmed);
				if (mLorem) {
					context.report({
						node: asReportNode(node),
						messageId: "loremIpsum",
						data: { value: mLorem[0] },
					});
				}
				const mMarketing = MARKETING_COPY.exec(trimmed);
				if (mMarketing) {
					context.report({
						node: asReportNode(node),
						messageId: "marketingCopy",
						data: { value: mMarketing[0] },
					});
				}
				if (LEADING_EMOJI.test(trimmed)) {
					context.report({
						node: asReportNode(node),
						messageId: "leadingEmoji",
					});
				}
			},
			// String literals inside JSXExpressionContainer (e.g., `{"Lorem ipsum"}`)
			// — same lorem/marketing checks as JSX text.
			Literal(node) {
				if (typeof node.value !== "string") return;
				const parent = (node as { parent?: { type?: string } }).parent;
				if (parent?.type !== "JSXExpressionContainer") return;
				const text = node.value as string;
				const mLorem = LOREM_IPSUM.exec(text);
				if (mLorem) {
					context.report({
						node: asReportNode(node),
						messageId: "loremIpsum",
						data: { value: mLorem[0] },
					});
				}
				const mMarketing = MARKETING_COPY.exec(text);
				if (mMarketing) {
					context.report({
						node: asReportNode(node),
						messageId: "marketingCopy",
						data: { value: mMarketing[0] },
					});
				}
			},
		};
	},
});
