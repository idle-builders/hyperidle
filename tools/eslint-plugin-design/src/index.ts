/**
 * eslint-plugin-design — HyperIdle K6
 *
 * Flat-config-compatible plugin. Every value comes from
 * `framework/design-system/AESTHETICS.md` (recommendations tables) or
 * `framework/design-system/src/tokens.css`. The plugin does not invent values
 * — see CLAUDE.md "First Principle" + AESTHETICS.md "How to read this document".
 */

import type { ESLint, Linter, Rule } from "eslint";

import { noAiAesthetic } from "./rules/no-ai-aesthetic.js";
import { noDialogBoilerplate } from "./rules/no-dialog-boilerplate.js";
import { noHandrolledControl } from "./rules/no-handrolled-control.js";
import { noHandrolledPageHeader } from "./rules/no-handrolled-page-header.js";
import { noHandrolledPageScaffold } from "./rules/no-handrolled-page-scaffold.js";
import { noHandrolledSelect } from "./rules/no-handrolled-select.js";
import { noHardcodedColor } from "./rules/no-hardcoded-color.js";
import { noHardcodedTracking } from "./rules/no-hardcoded-tracking.js";
import { noLocalStatusBuilder } from "./rules/no-local-status-builder.js";
import { noMockDataImport } from "./rules/no-mock-data-import.js";
import { noMockDataSymbol } from "./rules/no-mock-data-symbol.js";
import { noOffGridSpacing } from "./rules/no-off-grid-spacing.js";
import { noOffScaleDuration } from "./rules/no-off-scale-duration.js";
import { noOffScaleFontSize } from "./rules/no-off-scale-font-size.js";
import { noOpButton } from "./rules/no-op-button.js";
import { noRawActorFetch } from "./rules/no-raw-actor-fetch.js";
import { noRawOverlayZ } from "./rules/no-raw-overlay-z.js";
import { noRawSettingsTextarea } from "./rules/no-raw-settings-textarea.js";
import { noRawTailwindColor } from "./rules/no-raw-tailwind-color.js";
import { noUndefinedFontHeading } from "./rules/no-undefined-font-heading.js";
import { noUngatedStreamDrain } from "./rules/no-ungated-stream-drain.js";
import { noUnknownCast } from "./rules/no-unknown-cast.js";
import { radiusTokenOnly } from "./rules/radius-token-only.js";
import { requireDsAttribute } from "./rules/require-ds-attribute.js";
import { requireFocusOnInteractive } from "./rules/require-focus-on-interactive.js";
import { requireStoriesSibling } from "./rules/require-stories-sibling.js";

export const rules: Record<string, Rule.RuleModule> = {
	// Classifying stream-drain lint guard (AC4 static)
	"no-ungated-stream-drain": noUngatedStreamDrain,
	"no-mock-data-import": noMockDataImport,
	"no-mock-data-symbol": noMockDataSymbol,
	"no-handrolled-control": noHandrolledControl,
	"no-handrolled-page-header": noHandrolledPageHeader,
	"no-handrolled-page-scaffold": noHandrolledPageScaffold,
	"no-handrolled-select": noHandrolledSelect,
	"no-undefined-font-heading": noUndefinedFontHeading,
	"no-hardcoded-color": noHardcodedColor,
	"no-hardcoded-tracking": noHardcodedTracking,
	"no-local-status-builder": noLocalStatusBuilder,
	"no-off-grid-spacing": noOffGridSpacing,
	"no-off-scale-duration": noOffScaleDuration,
	"radius-token-only": radiusTokenOnly,
	"no-off-scale-font-size": noOffScaleFontSize,
	"no-ai-aesthetic": noAiAesthetic,
	"no-op-button": noOpButton,
	"no-raw-actor-fetch": noRawActorFetch,
	"no-raw-tailwind-color": noRawTailwindColor,
	"no-raw-overlay-z": noRawOverlayZ,
	"no-dialog-boilerplate": noDialogBoilerplate,
	"no-raw-settings-textarea": noRawSettingsTextarea,
	"no-unknown-cast": noUnknownCast,
	"require-ds-attribute": requireDsAttribute,
	"require-stories-sibling": requireStoriesSibling,
	"require-focus-on-interactive": requireFocusOnInteractive,
};

const recommendedRules: Linter.RulesRecord = {
	"design/no-handrolled-page-header": "warn",
	"design/no-handrolled-select": "error",
	"design/no-undefined-font-heading": "warn",
	"design/no-hardcoded-color": "warn",
	"design/no-hardcoded-tracking": "warn",
	"design/no-local-status-builder": "error",
	"design/no-off-grid-spacing": "warn",
	"design/no-off-scale-duration": "warn",
	// AZ7 E6: radius-token-only replaces no-off-scale-radius outright — the old
	// rule's allowlist permitted rounded-full, which is the pill's second,
	// now-forbidden spelling.
	"design/radius-token-only": "error",
	"design/no-handrolled-control": "error",
	"design/no-off-scale-font-size": "warn",
	"design/no-ai-aesthetic": "warn",
	"design/no-raw-actor-fetch": "warn",
	"design/no-raw-tailwind-color": "warn",
	// AI2 AC-3/AC-5: promoted from warn to error post-migration (code is clean).
	// A future raw z-[N] on an overlay or re-introduced showModal() fails lint, not warns.
	"design/no-raw-overlay-z": "error",
	"design/no-dialog-boilerplate": "error",
	// AH3 D4: Prevent regression to raw DaisyUI textarea in settings pages.
	// Must use <Input textarea> from @hyperidle/design-system.
	"design/no-raw-settings-textarea": "error",
	"design/require-ds-attribute": "warn",
	"design/require-stories-sibling": "warn",
	"design/require-focus-on-interactive": "warn",
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

const exported: ESLint.Plugin & { configs: Record<string, Linter.Config> } = {
	...plugin,
	configs,
};

export default exported;
