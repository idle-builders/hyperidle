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
 * nothing).
 *
 * A rule set to `"off"` here is not unwired — it means "not part of this
 * blanket K6/K8-shaped sweep; governed by its own dedicated block elsewhere
 * in `eslint.config.ts`" (e.g. `no-raw-actor-fetch` is scoped to
 * `layers/core-ui/src/hooks/**` only; `no-handrolled-page-header` is scoped
 * to `pages/**` only). Every rule still gets an explicit, reviewable entry.
 */

import type { ESLint, Linter } from "eslint";
import plugin, { rules } from "./index.js";

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
	"no-handrolled-control": { coreUi: "error", designSystem: "off" },
	// E7: wired at error for the first time (D2: previously registered
	// nowhere). Scoped to layers/core-ui/src by the rule's own filename check —
	// design-system is legitimately a registry home, not a violation site.
	// The .ts extension (not just .tsx) is covered by a THIRD hearth block —
	// see `configs.hearth` below — since this table only scopes .tsx severity.
	"no-local-status-builder": { coreUi: "error", designSystem: "off" },

	// ── AZ15's axis (spacing) — stays warn; not this work package's scope ───
	"no-off-grid-spacing": { coreUi: "warn", designSystem: "error" },

	// ── Unchanged from the former K6/K8 blocks ──────────────────────────────
	"no-off-scale-font-size": { coreUi: "warn", designSystem: "error" },
	"no-ai-aesthetic": { coreUi: "warn", designSystem: "error" },
	"no-raw-tailwind-color": { coreUi: "warn", designSystem: "error" },
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

	// ── Governed by their own dedicated eslint.config.ts blocks, not the
	// blanket K6/K8 sweep — "off" here, not unwired ─────────────────────────
	"no-ungated-stream-drain": { coreUi: "off", designSystem: "off" },
	"no-mock-data-import": { coreUi: "off", designSystem: "off" },
	"no-mock-data-symbol": { coreUi: "off", designSystem: "off" },
	"no-handrolled-page-header": { coreUi: "off", designSystem: "off" },
	"no-handrolled-page-scaffold": { coreUi: "off", designSystem: "off" },
	"no-handrolled-select": { coreUi: "off", designSystem: "off" },
	"no-undefined-font-heading": { coreUi: "off", designSystem: "off" },
	"no-raw-actor-fetch": { coreUi: "off", designSystem: "off" },
	"no-raw-settings-textarea": { coreUi: "off", designSystem: "off" },
	"no-unknown-cast": { coreUi: "off", designSystem: "off" },
};

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
			ignores: ["layers/core-ui/src/**/*.stories.tsx"],
			plugins: { design: designPlugin },
			rules: pickRules("coreUi"),
		},
		{
			files: ["framework/design-system/src/**/*.tsx"],
			ignores: ["framework/design-system/src/**/*.stories.tsx"],
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
	],
};
