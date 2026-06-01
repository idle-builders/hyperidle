/**
 * W2 — Density system removal tests.
 *
 * AC-1: Density system completely removed.
 *   - useDensity.ts file deleted
 *   - useAutoDensity.ts file deleted
 *   - density-allowlist.json deleted
 *   - use-density-tokens.ts rule deleted
 *   - no-density-tokens.ts rule deleted
 *   - density-tier.test.ts deleted
 *   - Density type removed from settings-types.ts
 *
 * AC-6: No density token refs in production code.
 *   - No var(--density-*) in production TS/TSX files.
 *
 * AC-7: SettingsAppearance has no density UI.
 *
 * AC-8: ESLint density rules removed.
 *
 * These tests FAIL in the red phase because:
 * - useDensity.ts still exists
 * - useAutoDensity.ts still exists
 * - density-allowlist.json still exists
 * - density rules still exist in eslint-plugin-design
 * - Density type still in settings-types.ts
 * - var(--density-*) refs still in production code
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = resolve(__dirname, "../..");
const DS_ROOT = resolve(__dirname, "../../../design-system");
const PLUGIN_ROOT = resolve(__dirname, "../../../eslint-plugin-design");

// ── AC-1: File deletion checks ────────────────────────────────────────────────

describe("W2 AC-1 — density hook files deleted", () => {
	it("packages/web/src/hooks/useDensity.ts does not exist", () => {
		const filePath = resolve(WEB_ROOT, "src/hooks/useDensity.ts");
		expect(
			existsSync(filePath),
			"useDensity.ts must be deleted as part of density strip",
		).toBe(false);
	});

	it("packages/web/src/hooks/useAutoDensity.ts does not exist", () => {
		const filePath = resolve(WEB_ROOT, "src/hooks/useAutoDensity.ts");
		expect(
			existsSync(filePath),
			"useAutoDensity.ts must be deleted as part of density strip",
		).toBe(false);
	});
});

describe("W2 AC-8 — ESLint density rule files deleted", () => {
	it("packages/eslint-plugin-design/density-allowlist.json does not exist", () => {
		const filePath = resolve(PLUGIN_ROOT, "density-allowlist.json");
		expect(
			existsSync(filePath),
			"density-allowlist.json must be deleted",
		).toBe(false);
	});

	it("packages/eslint-plugin-design/src/rules/use-density-tokens.ts does not exist", () => {
		const filePath = resolve(PLUGIN_ROOT, "src/rules/use-density-tokens.ts");
		expect(
			existsSync(filePath),
			"use-density-tokens.ts must be deleted",
		).toBe(false);
	});

	it("packages/eslint-plugin-design/src/rules/no-density-tokens.ts does not exist", () => {
		const filePath = resolve(PLUGIN_ROOT, "src/rules/no-density-tokens.ts");
		expect(
			existsSync(filePath),
			"no-density-tokens.ts must be deleted",
		).toBe(false);
	});
});

describe("W2 AC-1 — density test files deleted", () => {
	it("packages/web/src/__tests__/useDensity.test.ts does not exist", () => {
		const filePath = resolve(WEB_ROOT, "src/__tests__/useDensity.test.ts");
		expect(existsSync(filePath), "useDensity.test.ts must be deleted").toBe(false);
	});

	it("packages/web/src/__tests__/auto-density.test.tsx does not exist", () => {
		const filePath = resolve(WEB_ROOT, "src/__tests__/auto-density.test.tsx");
		expect(existsSync(filePath), "auto-density.test.tsx must be deleted").toBe(false);
	});

	it("packages/design-system/src/__tests__/density-tier.test.ts does not exist", () => {
		const filePath = resolve(DS_ROOT, "src/__tests__/density-tier.test.ts");
		expect(existsSync(filePath), "density-tier.test.ts must be deleted").toBe(false);
	});
});

describe("W2 AC-1 — density E2E test files deleted", () => {
	it("packages/web/e2e/density-toggle.spec.ts does not exist", () => {
		const filePath = resolve(WEB_ROOT, "e2e/density-toggle.spec.ts");
		expect(existsSync(filePath), "density-toggle.spec.ts must be deleted").toBe(false);
	});

	it("packages/web/e2e/responsive-density.spec.ts does not exist", () => {
		const filePath = resolve(WEB_ROOT, "e2e/responsive-density.spec.ts");
		expect(existsSync(filePath), "responsive-density.spec.ts must be deleted").toBe(false);
	});
});

// ── AC-1: Density type removed from settings-types.ts ──────────────────────

describe("W2 AC-1 — Density type removed from settings-types.ts", () => {
	const settingsTypes = readFileSync(
		resolve(WEB_ROOT, "src/settings/settings-types.ts"),
		"utf-8",
	);

	it("settings-types.ts does not export Density type", () => {
		expect(
			settingsTypes,
			"Density type must be removed from settings-types.ts",
		).not.toContain("export type Density");
	});

	it("settings-types.ts does not export ResolvedDensity type", () => {
		expect(
			settingsTypes,
			"ResolvedDensity type must be removed from settings-types.ts",
		).not.toContain("export type ResolvedDensity");
	});

	it("AppearanceSettings interface does not have a density field", () => {
		// After removal, the AppearanceSettings interface only has theme
		expect(
			settingsTypes,
			"AppearanceSettings must not have a density field",
		).not.toContain("density:");
	});
});

// ── AC-8: ESLint plugin does not register density rules ─────────────────────

describe("W2 AC-8 — ESLint plugin index does not reference density rules", () => {
	const pluginIndex = readFileSync(resolve(PLUGIN_ROOT, "src/index.ts"), "utf-8");

	it("eslint-plugin-design/src/index.ts does not import useDensityTokens", () => {
		expect(
			pluginIndex,
			"use-density-tokens rule must not be imported in plugin index",
		).not.toContain("useDensityTokens");
	});

	it("eslint-plugin-design/src/index.ts does not import noDensityTokens", () => {
		expect(
			pluginIndex,
			"no-density-tokens rule must not be imported in plugin index",
		).not.toContain("noDensityTokens");
	});

	it("eslint-plugin-design/src/index.ts does not reference use-density-tokens rule name", () => {
		expect(
			pluginIndex,
			"use-density-tokens rule name must not appear in plugin index",
		).not.toContain("use-density-tokens");
	});

	it("eslint-plugin-design/src/index.ts does not reference no-density-tokens rule name", () => {
		expect(
			pluginIndex,
			"no-density-tokens rule name must not appear in plugin index",
		).not.toContain("no-density-tokens");
	});
});

// ── AC-6: No density token refs in production code ───────────────────────────

describe("W2 AC-6 — no var(--density-*) in design-system src TSX/TS", () => {
	// Check key design-system production files that previously contained density refs
	const DS_SRC_FILES = [
		"src/ThreadRow.tsx",
		"src/BetCard.tsx",
		"src/TaskCard.tsx",
		"src/CommentRow.tsx",
		"src/KnowledgeRow.tsx",
		"src/NotificationRow.tsx",
		"src/ErrorState.tsx",
		"src/Composer.tsx",
		"src/KeyValue.tsx",
		"src/ThreadHostBanner.tsx",
		"src/ThreadShell.tsx",
	];

	for (const file of DS_SRC_FILES) {
		it(`${file} contains no var(--density-*) references`, () => {
			const filePath = resolve(DS_ROOT, file);
			if (!existsSync(filePath)) return; // file may not exist yet (new primitives)
			const content = readFileSync(filePath, "utf-8");
			const densityRefs = content.match(/var\(--density-[^)]+\)/g);
			expect(
				densityRefs,
				`${file} must not contain var(--density-*) references after W2 strip. Found: ${densityRefs?.join(", ")}`,
			).toBeNull();
		});
	}
});

describe("W2 AC-6 — no var(--density-*) in web/src TSX/TS", () => {
	const WEB_SRC_FILES = [
		"src/pages/WorkTeam.tsx",
		"src/pages/WorkPortfolio.tsx",
		"src/shell/ArtifactSection.tsx",
		"src/shell/HostThreadSection.tsx",
		"src/shell/ArtifactView.tsx",
		"src/pages/SetupFlow.tsx",
		"src/pages/Conversations.tsx",
		"src/pages/WorkBet.tsx",
		"src/pages/KnowledgeList.tsx",
	];

	for (const file of WEB_SRC_FILES) {
		it(`${file} contains no var(--density-*) references`, () => {
			const filePath = resolve(WEB_ROOT, file);
			if (!existsSync(filePath)) return;
			const content = readFileSync(filePath, "utf-8");
			const densityRefs = content.match(/var\(--density-[^)]+\)/g);
			expect(
				densityRefs,
				`${file} must not contain var(--density-*) references. Found: ${densityRefs?.join(", ")}`,
			).toBeNull();
		});
	}
});

// ── AC-7: SettingsAppearance has no density UI ────────────────────────────────

describe("W2 AC-7 — SettingsAppearance has no density UI", () => {
	const settingsAppearance = readFileSync(
		resolve(WEB_ROOT, "src/settings/SettingsAppearance.tsx"),
		"utf-8",
	);

	it("SettingsAppearance.tsx does not import useDensity", () => {
		expect(
			settingsAppearance,
			"SettingsAppearance must not import useDensity",
		).not.toContain("useDensity");
	});

	it("SettingsAppearance.tsx does not reference density-select", () => {
		expect(
			settingsAppearance,
			"SettingsAppearance must not have density-select element",
		).not.toContain("density-select");
	});

	it("SettingsAppearance.tsx does not import Density type", () => {
		expect(
			settingsAppearance,
			"SettingsAppearance must not import Density type",
		).not.toContain("import.*Density");
	});

	it("SettingsAppearance.tsx does not contain DENSITY_OPTIONS constant", () => {
		expect(
			settingsAppearance,
			"SettingsAppearance must not define DENSITY_OPTIONS",
		).not.toContain("DENSITY_OPTIONS");
	});
});
