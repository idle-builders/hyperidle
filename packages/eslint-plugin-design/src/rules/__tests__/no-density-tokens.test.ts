/**
 * Rule tests for `design/no-density-tokens` (K11 inverse rule).
 */

import { resolve } from "node:path";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noDensityTokens } from "../no-density-tokens.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

const DS_ROOT = resolve(__dirname, "../../../..");

const path = (file: string): string => resolve(DS_ROOT, file);

ruleTester.run("no-density-tokens", noDensityTokens, {
	valid: [
		// VALID #1 — StatusChip (density-static) using literal pixels — correct.
		{
			filename: path("packages/design-system/src/StatusChip.tsx"),
			code: 'const J = <span className="px-[8px] py-[2px] text-[11px]" />;',
		},
		// VALID #2 — Tag (density-static) — fine without density tokens.
		{
			filename: path("packages/design-system/src/Tag.tsx"),
			code: 'const J = <span className="gap-[4px] text-[12px]" />;',
		},
		// VALID #3 — IconRail (density-static shell) using literal pixels.
		{
			filename: path("packages/web/src/shell/IconRail.tsx"),
			code: 'const J = <nav className="w-12 p-2 gap-2" />;',
		},
		// VALID #4 — density-aware component (BetCard) consuming density tokens —
		// this rule has no opinion on density-aware components.
		{
			filename: path("packages/design-system/src/BetCard.tsx"),
			code: 'const J = <div className="p-[var(--density-card-pad)]" />;',
		},
		// VALID #5 — file outside the allowlist passes silently.
		{
			filename: path("packages/web/src/utils/SomeOther.tsx"),
			code: 'const J = <div className="p-[var(--density-pad-x)]" />;',
		},
	],
	invalid: [
		// INVALID #1 — StatusChip consuming a density token — explicitly
		// forbidden per § 3.1.1 (badge-as-callout).
		{
			filename: path("packages/design-system/src/StatusChip.tsx"),
			code: 'const J = <span className="px-[var(--density-pad-x)]" />;',
			errors: [{ messageId: "densityVarOnStatic" }],
		},
		// INVALID #2 — IconRail consuming a density token — the canonical
		// density-static shell per § 5.6.
		{
			filename: path("packages/web/src/shell/IconRail.tsx"),
			code: 'const J = <nav className="w-[var(--density-row-h)]" />;',
			errors: [{ messageId: "densityVarOnStatic" }],
		},
		// INVALID #3 — Tag consuming both a known token and one of K11's new
		// tokens. Both fire (regex is global).
		{
			filename: path("packages/design-system/src/Tag.tsx"),
			code: 'const J = <span className="px-[var(--density-pad-x)] gap-[var(--density-card-gap)]" />;',
			errors: [{ messageId: "densityVarOnStatic" }, { messageId: "densityVarOnStatic" }],
		},
		// INVALID #4 — class-string composed via cn(): rule walks composer
		// arguments to find the density-token consumption.
		{
			filename: path("packages/design-system/src/StatusChip.tsx"),
			code: 'const J = <span className={cn("p-[8px]", "text-[length:var(--density-text)]")} />;',
			errors: [{ messageId: "densityVarOnStatic" }],
		},
	],
});
