/**
 * hearth-config — the total severity table for the design-lint "blanket
 * sweep" blocks (formerly `eslint.config.ts`'s K6 block for
 * `layers/core-ui/src/**` and K8 block for `framework/design-system/src/**`).
 *
 * AZ7 §3.2 point 2 ("wiring becomes structural"): `RULE_SEVERITY` has one
 * entry per rule the plugin exports (`rules` in `index.ts`) — no more, no
 * less. `hearth-config.test.ts` asserts that totality at import time, so a
 * rule can never again exist and be wired nowhere (the D2 finding: 3 rules —
 * `no-local-status-builder`, `no-handrolled-select`, `no-raw-settings-textarea`
 * — were exported by the plugin but named in NO config block at any severity,
 * and read as passing forever because a rule wired to zero files prints
 * nothing). The latter two were deleted post-ship once their predicates were
 * proven subsumed by `no-handrolled-control` (wired at error) with zero
 * remaining population.
 *
 * A rule set to `"off"` in one scope is not unwired — it means "not part of
 * this blanket K6/K8-shaped sweep in that scope; governed by its own dedicated
 * block elsewhere in `eslint.config.ts` with a narrower file glob" (e.g.
 * `no-raw-actor-fetch` is scoped to `layers/core-ui/src/hooks/**` only;
 * `no-handrolled-page-header` is scoped to `pages/**` only). Every rule still
 * gets an explicit, reviewable entry, and every rule is at error or warn in
 * at least one scope — a rule off in BOTH scopes would be the exact D2
 * failure this table was built to prevent.
 *
 * @lore AZ7 post-ship durability review (B1): a rule set to `"off"` in BOTH
 * scopes is effectively unwired — it runs on zero files and reads as healthy
 * forever, which is the exact D2 failure this table was built to prevent.
 * Every entry here MUST be at error in at least one scope; the totality test
 * enforces this mechanically. If a rule's predicate becomes subsumed by
 * another wired rule (as `no-handrolled-select` and `no-raw-settings-textarea`
 * were by `no-handrolled-control`), delete the rule rather than leaving it
 * off/off.
 */

import type { ESLint, Linter } from "eslint";
import plugin from "./index.js";

export type Severity = "off" | "warn" | "error";

export interface ScopedSeverity {
	/** Severity for layers/core-ui/src/**\/*.tsx (excluding *.stories.tsx). */
	coreUi: Severity;
	/** Severity for framework/design-system/src/**\/*.tsx (excluding *.stories.tsx). */
	designSystem: Severity;
}

// One entry per key exported in `rules` (index.ts). hearth-config.test.ts
// asserts this object's keys equal Object.keys(rules) exactly.
export const RULE_SEVERITY: Record<string, ScopedSeverity> = {
	// ── AZ7's own rules ──────────────────────────────────────────────────────
	// E4: promoted from warn → error for core-ui (48 findings / 8 files,
	// cleared in the same PR). Already error for design-system since K8.
	"no-hardcoded-color": { coreUi: "error", designSystem: "error" },
	// E6: replaces no-off-scale-radius outright (allowlist was the defect).
	"radius-token-only": { coreUi: "error", designSystem: "error" },
	// E2: core-ui only — design-system is where controls are BUILT (Trade-off 4).
	// At `warn`, not `error`, by maintainer decision: the widened clauses
	// (token fill, token border, bare radius) match 97 elements across 34 files
	// that no rule reached before, and migrating them is its own piece of work.
	// This is a staged adoption, the shape AU31/AU32 argues against, taken
	// knowingly. Raise both to `error` once the population is migrated.
	"no-handrolled-control": { coreUi: "warn", designSystem: "off" },
	// The chip half of the same population, scoped by the same boundary:
	// `ds/` is where Avatar's circle, LiveDot's dot and Progress's pill-shaped
	// track are BUILT, and all three match the predicate correctly.
	"no-handrolled-chip": { coreUi: "warn", designSystem: "off" },
	// E7: wired at error for the first time (D2: previously registered
	// nowhere). Scoped to layers/core-ui/src by the rule's own filename check —
	// design-system is legitimately a registry home, not a violation site.
	// The .ts extension (not just .tsx) is covered by a THIRD hearth block —
	// see `configs.hearth` below — since this table only scopes .tsx severity.
	"no-local-status-builder": { coreUi: "error", designSystem: "off" },

	// ── Numeric composition vocabulary and elevation tokens ────────────────
	"no-off-grid-spacing": { coreUi: "error", designSystem: "error" },
	"shadow-token-only": { coreUi: "error", designSystem: "error" },

	// ── Unchanged from the former K6/K8 blocks ──────────────────────────────
	"no-off-scale-font-size": { coreUi: "warn", designSystem: "error" },
	"no-ai-aesthetic": { coreUi: "warn", designSystem: "error" },
	"no-raw-tailwind-color": { coreUi: "error", designSystem: "error" },
	"require-ds-attribute": { coreUi: "warn", designSystem: "error" },
	"require-stories-sibling": { coreUi: "warn", designSystem: "error" },
	"require-focus-on-interactive": { coreUi: "warn", designSystem: "error" },
	// K6 wires no-op-button at warn broadly; a SEPARATE eslint.config.ts block
	// (unchanged by AZ7) promotes it to error for pages/** and components/**.
	"no-op-button": { coreUi: "warn", designSystem: "off" },
	"no-raw-overlay-z": { coreUi: "error", designSystem: "off" },
	"no-dialog-boilerplate": { coreUi: "error", designSystem: "off" },
	"no-hardcoded-tracking": { coreUi: "off", designSystem: "error" },
	"no-off-scale-duration": { coreUi: "off", designSystem: "error" },
	"typography-profile-only": { coreUi: "error", designSystem: "error" },
	"motion-profile-only": { coreUi: "error", designSystem: "error" },
	"border-width-profile-only": { coreUi: "error", designSystem: "error" },

	// ── Governed by their own dedicated eslint.config.ts blocks with narrower
	// file scopes than the blanket K6/K8 sweep — "off" here because the hearth
	// block's wider scope would contradict the dedicated block's intent (e.g.
	// no-handrolled-page-header is scoped to pages/** only with specific file
	// ignores; no-unknown-cast excludes test files). These are documented
	// exceptions to the "no off/off" rule enforced by the totality test. ─────
	"no-ungated-stream-drain": { coreUi: "off", designSystem: "off" },
	"no-mock-data-import": { coreUi: "off", designSystem: "off" },
	"no-mock-data-symbol": { coreUi: "off", designSystem: "off" },
	"no-handrolled-page-header": { coreUi: "off", designSystem: "off" },
	"no-handrolled-page-scaffold": { coreUi: "off", designSystem: "off" },
	"no-undefined-font-heading": { coreUi: "off", designSystem: "off" },
	"no-raw-actor-fetch": { coreUi: "off", designSystem: "off" },
	"no-unknown-cast": { coreUi: "off", designSystem: "off" },
	// Test-file rules — scoped to test-file globs by their own dedicated
	// eslint.config.ts block (testing.md § lint enforcement), not the
	// core-ui/*.tsx blanket sweep this table governs.
	"no-dom-marker-assert": { coreUi: "off", designSystem: "off" },
	"no-existence-only-test": { coreUi: "off", designSystem: "off" },
	"no-planning-id-in-test": { coreUi: "off", designSystem: "off" },
	"no-repo-introspection-in-test": { coreUi: "off", designSystem: "off" },
};

// @lore AZ7 post-ship durability review (B1): these rules are set to off/off in
// RULE_SEVERITY because they have dedicated blocks in eslint.config.ts with
// narrower file scopes and/or specific ignores that the hearth block's wider
// scope would contradict. This allowlist is exported for the totality test to
// exclude from the "no off/off" assertion. Adding a new rule to this list
// requires a dedicated block in eslint.config.ts — the test enforces this.
export const DEDICATED_BLOCK_RULES: ReadonlySet<string> = new Set([
	"no-ungated-stream-drain",
	"no-mock-data-import",
	"no-mock-data-symbol",
	"no-handrolled-page-header",
	"no-handrolled-page-scaffold",
	"no-undefined-font-heading",
	"no-raw-actor-fetch",
	"no-unknown-cast",
	"no-dom-marker-assert",
	"no-existence-only-test",
	"no-planning-id-in-test",
	"no-repo-introspection-in-test",
]);

function pickRules(scope: keyof ScopedSeverity): Linter.RulesRecord {
	const out: Linter.RulesRecord = {};
	for (const [name, severity] of Object.entries(RULE_SEVERITY)) {
		const level = severity[scope];
		if (level === "off") continue;
		out[`design/${name}`] = level;
	}
	return out;
}

const designPlugin: ESLint.Plugin = plugin;

export const configs: { hearth: Linter.Config[] } = {
	hearth: [
		{
			files: ["layers/core-ui/src/**/*.tsx"],
			ignores: [
				"layers/core-ui/src/**/*.stories.tsx",
				// ds/ is the design-system implementation layer — it uses designSystem rules from the block below,
				// not coreUi rules. coreUi rules apply to code that USES the design system, not to the system itself.
				"layers/core-ui/src/ds/**/*.tsx",
			],
			plugins: { design: designPlugin },
			rules: pickRules("coreUi"),
		},
		{
			files: ["layers/core-ui/src/ds/**/*.tsx"],
			ignores: ["layers/core-ui/src/ds/**/*.stories.tsx"],
			plugins: { design: designPlugin },
			rules: pickRules("designSystem"),
		},
		// E7's ".ts extension too" clause: no-local-status-builder is not
		// JSX-specific (it flags function/variable declarations), and its own
		// filename check already scopes it to layers/core-ui/src — a plain .ts
		// file (e.g. settings/harness-presentation.ts, the D2/§1.6 finding #3
		// fork) never reached ANY design rule before because every K6/K8 block
		// was *.tsx-only. This block is deliberately narrow: one rule, one
		// extension, so it cannot pull unrelated .ts files into rules that only
		// make sense for JSX (no-hardcoded-color self-guards to .tsx already;
		// this block avoids relying on that guard for the others).
		{
			files: ["layers/core-ui/src/**/*.ts"],
			ignores: ["layers/core-ui/src/**/__tests__/**", "layers/core-ui/src/**/*.test.ts"],
			plugins: { design: designPlugin },
			rules: { "design/no-local-status-builder": "error" },
		},
		{
			files: ["layers/core-ui/src/**/*.{ts,tsx}", "layers/core-ui/src/ds/**/*.{ts,tsx}"],
			ignores: ["**/*.stories.tsx", "**/__tests__/**", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
			plugins: { design: designPlugin },
			rules: {
				"design/typography-profile-only": "error",
				"design/motion-profile-only": "error",
				"design/border-width-profile-only": "error",
			},
		},
	],
};
