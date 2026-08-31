/**
 * eslint-plugin-design — HyperIdle K6
 *
 * Flat-config-compatible plugin. Every value comes from
 * `framework/design-system/AESTHETICS.md` (recommendations tables) or
 * `framework/design-system/src/tokens.css`. The plugin does not invent values
 * — see CLAUDE.md "First Principle" + AESTHETICS.md "How to read this document".
 */

import type { ESLint, Rule } from "eslint";
import { borderWidthProfileOnly } from "./rules/border-width-profile-only.js";
import { motionProfileOnly } from "./rules/motion-profile-only.js";
import { noAiAesthetic } from "./rules/no-ai-aesthetic.js";
import { noDialogBoilerplate } from "./rules/no-dialog-boilerplate.js";
import { noHandrolledChip } from "./rules/no-handrolled-chip.js";
import { noHandrolledControl } from "./rules/no-handrolled-control.js";
import { noHandrolledPageHeader } from "./rules/no-handrolled-page-header.js";
import { noHandrolledPageScaffold } from "./rules/no-handrolled-page-scaffold.js";
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
import { noRawTailwindColor } from "./rules/no-raw-tailwind-color.js";
import { noUndefinedFontHeading } from "./rules/no-undefined-font-heading.js";
import { noUngatedStreamDrain } from "./rules/no-ungated-stream-drain.js";
import { noUnknownCast } from "./rules/no-unknown-cast.js";
import { radiusTokenOnly } from "./rules/radius-token-only.js";
import { requireDsAttribute } from "./rules/require-ds-attribute.js";
import { requireFocusOnInteractive } from "./rules/require-focus-on-interactive.js";
import { requireStoriesSibling } from "./rules/require-stories-sibling.js";
import { shadowTokenOnly } from "./rules/shadow-token-only.js";
import { typographyProfileOnly } from "./rules/typography-profile-only.js";

export const rules: Record<string, Rule.RuleModule> = {
	// Classifying stream-drain lint guard (AC4 static)
	"no-ungated-stream-drain": noUngatedStreamDrain,
	"no-mock-data-import": noMockDataImport,
	"no-mock-data-symbol": noMockDataSymbol,
	"no-handrolled-control": noHandrolledControl,
	"no-handrolled-chip": noHandrolledChip,
	"no-handrolled-page-header": noHandrolledPageHeader,
	"no-handrolled-page-scaffold": noHandrolledPageScaffold,
	"no-undefined-font-heading": noUndefinedFontHeading,
	"no-hardcoded-color": noHardcodedColor,
	"no-hardcoded-tracking": noHardcodedTracking,
	"no-local-status-builder": noLocalStatusBuilder,
	"no-off-grid-spacing": noOffGridSpacing,
	"no-off-scale-duration": noOffScaleDuration,
	"radius-token-only": radiusTokenOnly,
	"shadow-token-only": shadowTokenOnly,
	"no-off-scale-font-size": noOffScaleFontSize,
	"no-ai-aesthetic": noAiAesthetic,
	"no-op-button": noOpButton,
	"no-raw-actor-fetch": noRawActorFetch,
	"no-raw-tailwind-color": noRawTailwindColor,
	"no-raw-overlay-z": noRawOverlayZ,
	"no-dialog-boilerplate": noDialogBoilerplate,
	"no-unknown-cast": noUnknownCast,
	"require-ds-attribute": requireDsAttribute,
	"require-stories-sibling": requireStoriesSibling,
	"require-focus-on-interactive": requireFocusOnInteractive,
	"typography-profile-only": typographyProfileOnly,
	"motion-profile-only": motionProfileOnly,
	"border-width-profile-only": borderWidthProfileOnly,
};

const plugin: ESLint.Plugin = {
	meta: {
		name: "eslint-plugin-design",
		version: "0.0.1",
	},
	rules,
};

export default plugin;
