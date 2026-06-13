/**
 * design/no-hardcoded-tracking
 *
 * Maps to AQ-013 / AI6.
 * Source: tokens.css `--tracking-caps:0.08em --tracking-caps-sm:0.06em`.
 * Hearth rule: every uppercase label uses a tracking token, not a bare em literal.
 *
 * Allowlisted: negative-em optical kerning on display titles
 * (tracking-[-0.01em], tracking-[-0.005em]) — these are NOT uppercase-caps labels.
 *
 * @lore AI6: Added to enforce the tracking token migration that closes the
 * Lucid-era gap. Old values (0.02em–0.05em) were pre-Hearth leftovers;
 * 0.06em is the ratified caps-sm value. The rule fires on any positive bare
 * em value so it catches both under-tracking (0.02em) and correct-value-wrong-form
 * (0.06em) violations. Token form `tracking-[var(--tracking-caps-sm)]` passes.
 */

import type { Rule } from "eslint";
import type { JSXAttribute } from "estree-jsx";
import { collectClassStringsFromJSXAttribute, createRule } from "../util.js";

// Matches tracking-[<positive number>em] — the hardcoded form that must use a token instead.
// Allowlisted: tracking-[-<number>em] (negative-em title kerning) — not matched by this regex.
const HARDCODED_TRACKING_REGEX = /\btracking-\[(\d+(?:\.\d+)?em)\]/g;

export const noHardcodedTracking: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid hardcoded em tracking values on uppercase labels. Use Hearth tokens: tracking-[var(--tracking-caps)] or tracking-[var(--tracking-caps-sm)].",
			recommended: true,
		},
		schema: [],
		messages: {
			hardcodedTracking:
				"Hardcoded tracking '{{cls}}' must use a Hearth token.  → fix: tracking-[var(--tracking-caps-sm)] (0.06em labels) or tracking-[var(--tracking-caps)] (0.08em section titles).",
		},
	},
	create(context) {
		function checkClassString(text: string, node: unknown): void {
			const reportNode = node as Rule.Node;
			for (const match of text.matchAll(HARDCODED_TRACKING_REGEX)) {
				context.report({
					node: reportNode,
					messageId: "hardcodedTracking",
					data: { cls: match[0] },
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
				for (const { text, node: n } of strings) {
					checkClassString(text, n);
				}
			},
		};
	},
});
