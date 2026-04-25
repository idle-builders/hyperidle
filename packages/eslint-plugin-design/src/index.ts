/**
 * eslint-plugin-design — HyperIdle K6
 *
 * Flat-config-compatible plugin. Every value comes from
 * `packages/design-system/AESTHETICS.md` (recommendations tables) or
 * `packages/design-system/src/tokens.css`. The plugin does not invent values
 * — see CLAUDE.md "First Principle" + AESTHETICS.md "How to read this document".
 */

import type { ESLint, Linter, Rule } from "eslint";

import { noAiAesthetic } from "./rules/no-ai-aesthetic.js";
import { noDensityTokens } from "./rules/no-density-tokens.js";
import { noHardcodedColor } from "./rules/no-hardcoded-color.js";
import { noOffGridSpacing } from "./rules/no-off-grid-spacing.js";
import { noOffScaleFontSize } from "./rules/no-off-scale-font-size.js";
import { noOffScaleRadius } from "./rules/no-off-scale-radius.js";
import { noRawTailwindColor } from "./rules/no-raw-tailwind-color.js";
import { requireDsAttribute } from "./rules/require-ds-attribute.js";
import { requireFocusOnInteractive } from "./rules/require-focus-on-interactive.js";
import { requireStoriesSibling } from "./rules/require-stories-sibling.js";
import { useDensityTokens } from "./rules/use-density-tokens.js";

export const rules: Record<string, Rule.RuleModule> = {
	"no-hardcoded-color": noHardcodedColor,
	"no-off-grid-spacing": noOffGridSpacing,
	"no-off-scale-radius": noOffScaleRadius,
	"no-off-scale-font-size": noOffScaleFontSize,
	"no-ai-aesthetic": noAiAesthetic,
	"no-raw-tailwind-color": noRawTailwindColor,
	"require-ds-attribute": requireDsAttribute,
	"require-stories-sibling": requireStoriesSibling,
	"require-focus-on-interactive": requireFocusOnInteractive,
	// K11 — density-aware-vs-static enforcement (paired rules; partition every
	// component into exactly one bucket; reads density-allowlist.json).
	"use-density-tokens": useDensityTokens,
	"no-density-tokens": noDensityTokens,
};

const recommendedRules: Linter.RulesRecord = {
	"design/no-hardcoded-color": "warn",
	"design/no-off-grid-spacing": "warn",
	"design/no-off-scale-radius": "warn",
	"design/no-off-scale-font-size": "warn",
	"design/no-ai-aesthetic": "warn",
	"design/no-raw-tailwind-color": "warn",
	"design/require-ds-attribute": "warn",
	"design/require-stories-sibling": "warn",
	"design/require-focus-on-interactive": "warn",
	"design/use-density-tokens": "warn",
	"design/no-density-tokens": "warn",
};

const plugin: ESLint.Plugin = {
	meta: {
		name: "eslint-plugin-design",
		version: "0.0.1",
	},
	rules,
};

export const configs: Record<string, Linter.Config> = {
	recommended: {
		plugins: { design: plugin },
		rules: recommendedRules,
	},
};

const exported = { ...plugin, configs };

export default exported;
