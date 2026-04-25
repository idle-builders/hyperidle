/**
 * design/use-density-tokens
 *
 * Maps to AQ-017.
 * Source: K10 audit — `packages/design-system/research/density-audit.md` § 3.
 *
 * @lore K11: this rule + `design/no-density-tokens` partition every component
 * into exactly one bucket. The opt-out manifest at
 * `packages/eslint-plugin-design/density-allowlist.json` is the arbiter — both
 * rules read it at run-time and must NOT contradict each other. A component
 * is in exactly one bucket: density-aware (this rule applies) OR density-static
 * (the inverse rule applies).
 *
 * This rule flags literal pixel padding/gap/font-size values inside components
 * K10 marked as density-aware. It is the inverse of `design/no-density-tokens`.
 */

import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { Rule } from "eslint";
import { collectClassStringsFromJSXAttribute, createRule } from "../util.js";

interface DensityAllowlist {
	densityStatic: { components: Array<{ name: string; file: string }> };
	densityAware: {
		components: Array<{
			name: string;
			file: string;
			axes?: string[];
			literalAxes?: Array<{ axis: string; reason: string }>;
		}>;
	};
}

let cachedAllowlist: DensityAllowlist | null = null;

function loadAllowlist(): DensityAllowlist {
	if (cachedAllowlist) return cachedAllowlist;
	// @lore K11: the allowlist sits one directory up from `src/rules/` because
	// it is also consumed by the `/design-lint` skill. resolve() walks from
	// __dirname (this file's directory) up to the package root.
	const path = resolve(__dirname, "../../density-allowlist.json");
	cachedAllowlist = JSON.parse(readFileSync(path, "utf-8")) as DensityAllowlist;
	return cachedAllowlist;
}

/**
 * Map an absolute file path to its component name (e.g. "BetCard.tsx" →
 * "BetCard"). Strips the "stories.tsx" / "test.tsx" suffix when present so
 * stories and tests inherit their primitive's bucket.
 */
function fileToComponentName(filePath: string): string {
	const base = basename(filePath);
	return base
		.replace(/\.stories\.tsx$/, "")
		.replace(/\.test\.tsx$/, "")
		.replace(/\.tsx$/, "")
		.replace(/\.ts$/, "");
}

function isDensityAware(filePath: string): boolean {
	const allowlist = loadAllowlist();
	const name = fileToComponentName(filePath);
	const aware = allowlist.densityAware.components.some((c) => c.name === name);
	if (!aware) return false;
	const isStatic = allowlist.densityStatic.components.some((c) => c.name === name);
	if (isStatic) {
		// @lore K11 contract: a component appears in exactly one bucket.
		// Throwing here surfaces the contradiction to the developer who
		// edited the allowlist incorrectly.
		throw new Error(
			`density-allowlist.json contradiction: ${name} appears in both densityStatic and densityAware. The two rules cannot both apply — fix the allowlist.`,
		);
	}
	return true;
}

// Literal pixel padding/gap/font-size patterns. Matches Tailwind arbitrary-
// value classes: p-[Npx], px-[Npx], py-[Npx], pt/r/b/l-[Npx], gap-[Npx],
// gap-x/y-[Npx], text-[Npx]. Excludes any value already wrapped in
// var(--density-*) — those are by definition density tokens.
const LITERAL_PADDING_GAP = /\b(p|m|gap)([xytrbl])?-\[(\d+)px\]/g;
const LITERAL_FONT_SIZE = /\btext-\[(\d+)px\]/g;

export const useDensityTokens: Rule.RuleModule = createRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Density-aware components (per K10 audit) must consume var(--density-*) tokens for padding, gap, and body-text axes — not literal pixel values.",
			recommended: true,
		},
		schema: [],
		messages: {
			literalPad:
				"'{{cls}}' uses literal {{n}}px padding/gap inside a density-aware component ({{component}}). Per K10 audit (density-audit.md), this axis should consume var(--density-*) (e.g. var(--density-pad-x), var(--density-gap), var(--density-card-pad)). → see packages/design-system/research/density-audit.md.",
			literalFont:
				"'text-[{{n}}px]' is a literal font-size inside a density-aware component ({{component}}). Per K10 audit, body text should consume var(--density-text). The chrome 11/12 px literals (caption, timestamp) stay literal — see literalAxes in density-allowlist.json.",
		},
	},
	create(context) {
		const filename = context.filename ?? context.getFilename();
		let aware = false;
		try {
			aware = isDensityAware(filename);
		} catch (err) {
			// Surface allowlist contradictions as a meta-rule violation on
			// the first JSXAttribute so the build fails loudly.
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
		if (!aware) return {};

		const componentName = fileToComponentName(filename);

		// Per density-audit.md every density-aware component has chrome axes
		// that stay literal at 11 / 12 px — the lint rule must not flag those.
		// We treat 11 and 12 as always-allowed font-size literals and trust the
		// component author to use them only on chrome (caption, timestamp,
		// version pill). The higher-level /design-lint skill cross-references
		// the literalAxes manifest for the contextual check.
		const ALLOWED_CHROME_FONT_SIZES = new Set([10, 11, 12]);

		// Width / height literals (h-[6px], w-[24px]) are intentionally left
		// alone — every density-aware component lists specific load-bearing
		// literal axes (progress-bar-h, lead-avatar, drop-zone-min-h, etc.)
		// that this rule cannot disambiguate from the AST alone. The AST rule
		// scope is padding / gap / font-size only; the higher-level
		// /design-lint skill catches drift on the height/width axes.

		// @lore K11: a className that already consumes a --density-* token is
		// considered "density-wired" — additional literals on the same string
		// are likely intentional sub-grids (chip-internal, count-chip,
		// version-pill, button-shaped affordance). The higher-level
		// /design-lint skill cross-references the literalAxes manifest for
		// the contextual check the AST cannot perform. The AST rule's job is
		// to catch the case where the WHOLE className is literal — that is
		// the drift signal.
		const ANY_DENSITY_VAR = /var\(--density-[\w-]+\)/;
		// Pill-shaped chrome (count chip, version pill, status dot) is
		// always-literal per K10 (chip rule § 3.1.1, § 3.1.4 count-badge,
		// § 3.2.2 version-pill). Detect by `rounded-[var(--r-pill)]` or
		// `rounded-full`. These elements have their own tokenized scale; the
		// rule should not nudge them onto the density ladder.
		const PILL_SHAPED = /rounded-\[var\(--r-pill\)\]|rounded-full/;
		// Button-shaped chrome (Retry button, DaisyUI btn) stays literal per
		// K10 § 3.2.8 + § 5.2 (verdict buttons) + § 5.5. Detect by either
		// the DaisyUI `btn` class family or a bare-Tailwind button signature
		// (cursor-pointer + bg-[var(--primary)] OR bg-[var(--surface-*)]).
		const BUTTON_SHAPED =
			/\bbtn\b|cursor-pointer.*bg-\[var\(--primary\)\]|bg-\[var\(--primary\)\].*cursor-pointer/;

		function checkClassString(text: string, node: unknown): void {
			const reportNode = node as Rule.Node;
			if (ANY_DENSITY_VAR.test(text)) {
				// Density tokens already present — assume the literals on this
				// string are intentional chrome (chip-internal, fallback-for-
				// 14 px-base viewer, etc.). Skip.
				return;
			}
			if (PILL_SHAPED.test(text)) {
				// Pill-shaped chrome (count chip, version pill) is always-
				// literal per K10 — skip.
				return;
			}
			if (BUTTON_SHAPED.test(text)) {
				// Button-shaped chrome (Retry, verdict buttons) stays literal
				// per K10 § 5.2 — skip.
				return;
			}
			for (const match of text.matchAll(LITERAL_PADDING_GAP)) {
				const [cls, _prefix, _axis, nStr] = match;
				const n = Number(nStr);
				// 0 is a no-op; treat as benign.
				if (n === 0) continue;
				context.report({
					node: reportNode,
					messageId: "literalPad",
					data: { cls, n: String(n), component: componentName },
				});
			}
			for (const match of text.matchAll(LITERAL_FONT_SIZE)) {
				const n = Number(match[1]);
				if (ALLOWED_CHROME_FONT_SIZES.has(n)) continue;
				context.report({
					node: reportNode,
					messageId: "literalFont",
					data: { n: String(n), component: componentName },
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
