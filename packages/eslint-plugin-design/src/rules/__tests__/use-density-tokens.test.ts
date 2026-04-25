/**
 * Rule tests for `design/use-density-tokens` (K11).
 *
 * @lore The rule reads `density-allowlist.json` from the package root at
 * runtime. The fixture filenames here use the canonical component basenames
 * (BetCard.tsx, StatusChip.tsx, IconRail.tsx, etc.) so the allowlist lookup
 * resolves the right bucket — only the basename matters, not the full path.
 */

import { resolve } from "node:path";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { useDensityTokens } from "../use-density-tokens.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

const DS_ROOT = resolve(__dirname, "../../../..");

const path = (file: string): string => resolve(DS_ROOT, file);

ruleTester.run("use-density-tokens", useDensityTokens, {
	valid: [
		// VALID #1 — density-aware component (BetCard) consuming the prescribed
		// density tokens. No literal padding.
		{
			filename: path("packages/design-system/src/BetCard.tsx"),
			code: 'const J = <div className="p-[var(--density-card-pad)] gap-[var(--density-card-gap)]" />;',
		},
		// VALID #2 — density-static component (StatusChip) using literal pixels
		// is correctly NOT flagged by this rule. The inverse rule
		// (no-density-tokens) handles those.
		{
			filename: path("packages/design-system/src/StatusChip.tsx"),
			code: 'const J = <span className="px-[8px] py-[2px] text-[11px]" />;',
		},
		// VALID #3 — chrome font-size literals (11/12 px) are always allowed
		// inside density-aware components per density-audit.md (caption,
		// timestamp, version pill all stay literal).
		{
			filename: path("packages/design-system/src/KnowledgeRow.tsx"),
			code: 'const J = <span className="text-[12px] text-[11px]" />;',
		},
		// VALID #4 — file outside the allowlist is silently passed through
		// (no opinion).
		{
			filename: path("packages/web/src/utils/SomeOther.tsx"),
			code: 'const J = <div className="p-[5px]" />;',
		},
		// VALID #5 — 0 px padding is benign (no-op).
		{
			filename: path("packages/design-system/src/BetCard.tsx"),
			code: 'const J = <div className="p-[0px]" />;',
		},
		// VALID #6 — a density-wired className with co-located literal sub-
		// grids is allowed (likely chip-internal / count-chip / version-pill
		// chrome). The /design-lint skill cross-references literalAxes for
		// the contextual check the AST cannot do.
		{
			filename: path("packages/design-system/src/KnowledgeRow.tsx"),
			code: 'const J = <span className="px-[8px] py-[2px] text-[length:var(--density-text)]" />;',
		},
	],
	invalid: [
		// INVALID #1 — BetCard (density-aware) using literal `p-[8px]`.
		{
			filename: path("packages/design-system/src/BetCard.tsx"),
			code: 'const J = <div className="p-[8px] gap-[4px]" />;',
			errors: [{ messageId: "literalPad" }, { messageId: "literalPad" }],
		},
		// INVALID #2 — TaskCard (density-aware) using a literal title font-size.
		{
			filename: path("packages/design-system/src/TaskCard.tsx"),
			code: 'const J = <span className="text-[14px]" />;',
			errors: [{ messageId: "literalFont" }],
		},
		// INVALID #3 — Submenu (density-aware shell) using literal padding.
		{
			filename: path("packages/web/src/shell/Submenu.tsx"),
			code: 'const J = <div className="p-[16px]" />;',
			errors: [{ messageId: "literalPad" }],
		},
		// INVALID #4 — class-string composed via cn(): rule walks composer args.
		{
			filename: path("packages/design-system/src/PitchCard.tsx"),
			code: 'const J = <div className={cn("p-[12px]", "gap-[8px]")} />;',
			errors: [{ messageId: "literalPad" }, { messageId: "literalPad" }],
		},
	],
});
