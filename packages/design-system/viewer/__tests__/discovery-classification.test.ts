/**
 * AJ6 — AC2/AC3/AC5: Total classification + no stale registry rows + all
 * surfaces discovered.
 *
 * AC2: every DS-src story module has a valid group (no unclassified).
 *      Tests on the real DS-src glob (accessible within DS package boundary).
 * AC3: DS_COMPONENT_GROUPS keys ⊆ discovered DS-src titles (no stale rows).
 * AC5: settings/layouts/kinds/nested-pages paths resolve correctly.
 *      Web stories live outside the DS package boundary (cross-package globs
 *      don't resolve in the DS vitest runner). AC5 therefore uses SYNTHETIC
 *      glob objects with realistic path keys — calling discoverStories with the
 *      same path strings the real viewer globs would produce. This verifies the
 *      classification logic without requiring cross-package access.
 *      The "real stories are discoverable" claim is validated by the integration
 *      fact that main.tsx adds the globs and the viewer builds (checked via
 *      `npm run check` / `npm run build`).
 */

// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import {
	DS_COMPONENT_GROUPS,
	GROUPS,
	type CatalogGroup,
	type GroupName,
	type GlobSource,
	discoverStories,
} from "../discovery.js";

// ── Real DS story globs (within DS package boundary) ──────────────────────
const dsRootGlobs = import.meta.glob<Record<string, unknown>>("../../src/*.stories.tsx", {
	eager: true,
});
const dsKindsGlobs = import.meta.glob<Record<string, unknown>>("../../src/kinds/*.stories.tsx", {
	eager: true,
});

const VALID_GROUP_NAMES = new Set<GroupName>(GROUPS.map((g) => g.name));

function isValidCatalogGroup(g: unknown): g is CatalogGroup {
	if (!g || typeof g !== "object") return false;
	const obj = g as { kind?: unknown; name?: unknown };
	return (
		(obj.kind === "tier" || obj.kind === "domain") &&
		typeof obj.name === "string" &&
		VALID_GROUP_NAMES.has(obj.name as GroupName)
	);
}

// All DS modules (real globs)
const dsSrcModules = discoverStories(dsRootGlobs as never);
const dsKindsModules = discoverStories(dsKindsGlobs as never);
const allDsModules = discoverStories(dsRootGlobs as never, dsKindsGlobs as never);

// ── Synthetic globs for AC5 (cross-package path shapes) ──────────────────
//
// These mimic the exact path keys the real viewer globs produce for web stories.
// Path keys are relative to the viewer/ directory (how Vite resolves them in main.tsx).
// Content is minimal — a default export with the right title + enough named exports
// to be counted as a story module with ≥1 variant.

function makeMod(title: string, metaGroup?: string): Record<string, unknown> {
	const meta: Record<string, unknown> = { title };
	if (metaGroup) meta.group = metaGroup;
	return {
		default: meta,
		Default: () => null, // minimal variant so buildModule returns non-null
	};
}

const syntheticWebSettingsGlobs: GlobSource = {
	"../../web/src/settings/SettingsModels.stories.tsx": makeMod("SettingsModels"),
	"../../web/src/settings/SettingsAgents.stories.tsx": makeMod("SettingsAgents"),
	"../../web/src/settings/SettingsAssistant.stories.tsx": makeMod("Settings/SettingsAssistant"),
	"../../web/src/settings/SettingsWorker.stories.tsx": makeMod("SettingsWorker"),
};

const syntheticWebLayoutsGlobs: GlobSource = {
	"../../web/src/layouts/AppShell.stories.tsx": makeMod("Layout: AppShell"),
};

const syntheticWebNestedPagesGlobs: GlobSource = {
	"../../web/src/pages/knowledge/KnowledgeBody.stories.tsx": makeMod("Page: Knowledge/Body"),
	"../../web/src/pages/knowledge/KnowledgeCreateDialog.stories.tsx": makeMod(
		"Page: Knowledge/KnowledgeCreateDialog",
	),
	"../../web/src/pages/knowledge/ScopeChangeDialog.stories.tsx": makeMod(
		"Page: Knowledge/ScopeChangeDialog",
	),
	"../../web/src/pages/work/RoutineCreateDialog.stories.tsx": makeMod(
		"Page: Work/RoutineCreateDialog",
	),
};

// Area-less page titles that REQUIRE meta.group (per architecture W5)
const syntheticWebFlatPagesArealess: GlobSource = {
	"../../web/src/pages/WorkRoutine.stories.tsx": makeMod("WorkRoutine", "Work"),
	"../../web/src/pages/WorkTeam.stories.tsx": makeMod("WorkTeam", "Work"),
	"../../web/src/pages/NotFound.stories.tsx": makeMod("NotFound", "System"),
};

const allSyntheticWebModules = discoverStories(
	syntheticWebSettingsGlobs,
	syntheticWebLayoutsGlobs,
	syntheticWebNestedPagesGlobs,
	syntheticWebFlatPagesArealess,
);

describe("AC2 — total classification: every DS-src module has a valid group", () => {
	test("at least 49 DS-src modules discovered (excluding kinds)", () => {
		// 49 stories in src/ root (pre-AJ6) + Tokens + CatalogAxis = 51
		// We require at least 49 to account for future cleanup.
		expect(dsSrcModules.length).toBeGreaterThanOrEqual(49);
	});

	test("every DS-src module has a valid CatalogGroup (no null, no unclassified)", () => {
		const unclassified = dsSrcModules.filter((m) => !isValidCatalogGroup(m.group));
		if (unclassified.length > 0) {
			const titles = unclassified.map((m) => `"${m.title}"`).join(", ");
			throw new Error(
				`AC2 failure: ${unclassified.length} DS-src modules have no valid group: ${titles}\n` +
					`Fix: add meta.group override to their default export, or add to DS_COMPONENT_GROUPS.`,
			);
		}
		expect(unclassified).toHaveLength(0);
	});

	test("every Kinds/ module has a valid CatalogGroup", () => {
		const unclassified = dsKindsModules.filter((m) => !isValidCatalogGroup(m.group));
		if (unclassified.length > 0) {
			const titles = unclassified.map((m) => `"${m.title}"`).join(", ");
			throw new Error(
				`AC2 failure: ${unclassified.length} Kinds modules unclassified: ${titles}`,
			);
		}
		expect(unclassified).toHaveLength(0);
	});

	test("DS + kinds total ≥ 56", () => {
		expect(allDsModules.length).toBeGreaterThanOrEqual(56);
	});
});

describe("AC3 — no stale registry rows: DS_COMPONENT_GROUPS keys ⊆ discovered DS-src titles", () => {
	test("every DS_COMPONENT_GROUPS key matches a real discovered DS-src title", () => {
		const discoveredTitles = new Set(dsSrcModules.map((m) => m.title));
		const staleKeys = Object.keys(DS_COMPONENT_GROUPS).filter(
			(key) => !discoveredTitles.has(key),
		);
		if (staleKeys.length > 0) {
			throw new Error(
				`AC3 failure: stale DS_COMPONENT_GROUPS entries (no matching story): ${staleKeys.join(", ")}\n` +
					`Fix: remove them from the registry or fix the title in the corresponding story file.`,
			);
		}
		expect(staleKeys).toHaveLength(0);
	});
});

describe("AC5 — all surfaces discovered and classified correctly", () => {
	// ── settings ───────────────────────────────────────────────────────────
	test("settings stories (synthetic paths) classify as Settings domain", () => {
		const settingsModules = allSyntheticWebModules.filter((m) => m.group?.name === "Settings");
		expect(
			settingsModules.length,
			"No settings stories classified as Settings — path matching may be broken",
		).toBeGreaterThan(0);
	});

	test("'SettingsModels' from settings/ path → Settings domain", () => {
		const m = allSyntheticWebModules.find((m) => m.title === "SettingsModels");
		expect(m, "SettingsModels not classified").toBeDefined();
		expect(m?.group?.name).toBe("Settings");
	});

	// ── layouts ────────────────────────────────────────────────────────────
	test("'Layout: AppShell' from layouts/ path → System domain", () => {
		const m = allSyntheticWebModules.find((m) => m.title === "Layout: AppShell");
		expect(m, "Layout: AppShell not classified").toBeDefined();
		expect(m?.group?.name).toBe("System");
	});

	// ── kinds ──────────────────────────────────────────────────────────────
	test("Kinds/* renderers from real DS glob classify as System domain", () => {
		const kindsModules = dsKindsModules.filter((m) => m.group?.name === "System");
		expect(
			kindsModules.length,
			"No Kinds stories classified as System — kinds path matching may be broken",
		).toBeGreaterThan(0);
	});

	// ── nested pages ───────────────────────────────────────────────────────
	test("'Page: Knowledge/Body' from pages/knowledge/ path → Knowledge domain", () => {
		const m = allSyntheticWebModules.find((m) => m.title === "Page: Knowledge/Body");
		expect(m, "Page: Knowledge/Body not classified").toBeDefined();
		expect(m?.group?.name).toBe("Knowledge");
	});

	test("'Page: Work/RoutineCreateDialog' from pages/work/ path → Work domain", () => {
		const m = allSyntheticWebModules.find((m) => m.title === "Page: Work/RoutineCreateDialog");
		expect(m, "Page: Work/RoutineCreateDialog not classified").toBeDefined();
		expect(m?.group?.name).toBe("Work");
	});

	// ── area-less pages with meta.group ────────────────────────────────────
	test("'WorkRoutine' with meta.group='Work' → Work domain", () => {
		const m = allSyntheticWebModules.find((m) => m.title === "WorkRoutine");
		expect(m, "WorkRoutine not classified").toBeDefined();
		expect(m?.group?.name).toBe("Work");
	});

	test("'NotFound' with meta.group='System' → System domain", () => {
		const m = allSyntheticWebModules.find((m) => m.title === "NotFound");
		expect(m, "NotFound not classified").toBeDefined();
		expect(m?.group?.name).toBe("System");
	});
});
