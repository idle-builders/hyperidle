/**
 * design/no-density-tokens
 *
 * Maps to AQ-017 (inverse).
 * Source: K10 audit — `packages/design-system/research/density-audit.md` § 3.
 *
 * @lore K11: this rule + `design/use-density-tokens` partition every component
 * into exactly one bucket. The opt-out manifest at
 * `packages/eslint-plugin-design/density-allowlist.json` is the arbiter.
 *
 * This rule flags var(--density-*) consumption inside components K10 marked
 * as density-static (e.g. StatusChip, Tag, IconRail, NotFound). Density-aware
 * shouldn't leak to surfaces that should look the same at every tier.
 *
 * Per § 5.6: "IconRail is fully density-static. The K11 design/no-density-
 * tokens rule's primary canonical example."
 */

import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { Rule } from "eslint";
import { collectClassStringsFromJSXAttribute, createRule } from "../util.js";

interface DensityAllowlist {
	densityStatic: { components: Array<{ name: string; file: string; reason: string }> };
	densityAware: { components: Array<{ name: string; file: string }> };
}

let cachedAllowlist: DensityAllowlist | null = null;

function loadAllowlist(): DensityAllowlist {
	if (cachedAllowlist) return cachedAllowlist;
	const path = resolve(__dirname, "../../density-allowlist.json");
	cachedAllowlist = JSON.parse(readFileSync(path, "utf-8")) as DensityAllowlist;
	return cachedAllowlist;
}

function fileToComponentName(filePath: string): string {
	const base = basename(filePath);
	return base
		.replace(/\.stories\.tsx$/, "")
		.replace(/\.test\.tsx$/, "")
		.replace(/\.tsx$/, "")
		.replace(/\.ts$/, "");
}

function staticReason(filePath: string): string | null {
	const allowlist = loadAllowlist();
	const name = fileToComponentName(filePath);
	const entry = allowlist.densityStatic.components.find((c) => c.name === name);
	if (!entry) return null;
	const isAware = allowlist.densityAware.components.some((c) => c.name === name);
	if (isAware) {
		throw new Error(
			`density-allowlist.json contradiction: ${name} appears in both densityStatic and densityAware. The two rules cannot both apply — fix the allowlist.`,
		);
	}
	return entry.reason;
}

// Any var(--density-*) consumption — covers the new K11 tokens AND the K9
// pre-existing set (--density-pad-x/-y, --density-gap, --density-row-h,
// --density-text, --density-text-h*).
const DENSITY_VAR = /var\(--density-[\w-]+\)/g;

export const noDensityTokens: Rule.RuleModule = createRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Density-static components (per K10 audit) must NOT consume var(--density-*) tokens. These surfaces should look the same at every density tier.",
			recommended: true,
		},
		schema: [],
		messages: {
			densityVarOnStatic:
				"'{{cls}}' consumes a density token inside a density-static component ({{component}}). Per K10 audit (density-audit.md): {{reason}}. → fix: use a literal pixel value or the component's existing closed scale.",
		},
	},
	create(context) {
		const filename = context.filename ?? context.getFilename();
		let reason: string | null = null;
		try {
			reason = staticReason(filename);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				JSXAttribute(node) {
					context.report({
						node,
						message,
					});
				},
			};
		}
		if (!reason) return {};

		const componentName = fileToComponentName(filename);

		function checkClassString(text: string, node: unknown): void {
			const reportNode = node as Rule.Node;
			for (const match of text.matchAll(DENSITY_VAR)) {
				const cls = match[0];
				context.report({
					node: reportNode,
					messageId: "densityVarOnStatic",
					data: { cls, component: componentName, reason: reason ?? "(no reason recorded)" },
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
