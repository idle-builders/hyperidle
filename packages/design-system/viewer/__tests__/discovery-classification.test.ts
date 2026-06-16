/**
 * AJ6 — AC2/AC3/AC5: Total classification + no stale registry rows + all
 * surfaces discovered.
 *
 * Uses import.meta.glob over the REAL story roots so these tests assert on
 * live discovered modules, not synthetic fixtures. All modules must resolve
 * to a valid CatalogGroup; none may be null.
 *
 * AC2: every discovered module has a valid group (no unclassified).
 * AC3: DS_COMPONENT_GROUPS keys ⊆ discovered DS-src titles (no stale rows).
 * AC5: settings/layouts/kinds/nested-pages all appear (≥1 each).
 */

// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import {
	DS_COMPONENT_GROUPS,
	GROUPS,
	type CatalogGroup,
	type GroupName,
	discoverStories,
} from "../discovery.js";

// ── Real story globs (same roots the viewer uses) ──────────────────────────
const dsRootGlobs = import.meta.glob<Record<string, unknown>>("../../src/*.stories.tsx", {
	eager: true,
});
const dsKindsGlobs = import.meta.glob<Record<string, unknown>>("../../src/kinds/*.stories.tsx", {
	eager: true,
});
const webShellGlobs = import.meta.glob<Record<string, unknown>>(
	"../../../../web/src/shell/*.stories.tsx",
	{ eager: true },
);
const webComponentGlobs = import.meta.glob<Record<string, unknown>>(
	"../../../../web/src/components/*.stories.tsx",
	{ eager: true },
);
const webPagesGlobs = import.meta.glob<Record<string, unknown>>(
	"../../../../web/src/pages/*.stories.tsx",
	{ eager: true },
);
const webNestedPagesGlobs = import.meta.glob<Record<string, unknown>>(
	"../../../../web/src/pages/*/*.stories.tsx",
	{ eager: true },
);
const webSettingsGlobs = import.meta.glob<Record<string, unknown>>(
	"../../../../web/src/settings/*.stories.tsx",
	{ eager: true },
);
const webLayoutsGlobs = import.meta.glob<Record<string, unknown>>(
	"../../../../web/src/layouts/*.stories.tsx",
	{ eager: true },
);

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

const allModules = discoverStories(
	dsRootGlobs as never,
	dsKindsGlobs as never,
	webShellGlobs as never,
	webComponentGlobs as never,
	webPagesGlobs as never,
	webNestedPagesGlobs as never,
	webSettingsGlobs as never,
	webLayoutsGlobs as never,
);

const dsSrcModules = discoverStories(dsRootGlobs as never);

describe("AC2 — total classification: every module has a valid group", () => {
	test("at least one module discovered across all globs", () => {
		expect(allModules.length).toBeGreaterThan(0);
	});

	test("every module has a valid CatalogGroup (no null, no unclassified)", () => {
		const unclassified = allModules.filter((m) => !isValidCatalogGroup(m.group));
		if (unclassified.length > 0) {
			const titles = unclassified.map((m) => `"${m.title}"`).join(", ");
			throw new Error(
				`AC2 failure: ${unclassified.length} modules have no valid group: ${titles}\n` +
					`Fix: add meta.group override to their default export, or add to DS_COMPONENT_GROUPS.`,
			);
		}
		expect(unclassified).toHaveLength(0);
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

describe("AC5 — all surfaces discovered: settings/layouts/kinds/nested-pages present", () => {
	// settings panel
	test("settings surface: 'SettingsModels' discovered", () => {
		const m = allModules.find((m) => m.title === "SettingsModels");
		expect(m, "SettingsModels not found — settings/ glob may be missing").toBeDefined();
	});

	// layout / AppShell
	test("layout surface: 'Layout: AppShell' discovered", () => {
		const m = allModules.find((m) => m.title === "Layout: AppShell");
		expect(m, "Layout: AppShell not found — layouts/ glob may be missing").toBeDefined();
	});

	// kind renderer (the path in the snapshot net uses title "Kinds/CodeRenderer")
	test("kinds surface: a Kinds/* renderer discovered", () => {
		const m = allModules.find((m) => m.title.startsWith("Kinds/"));
		expect(m, "No Kinds/* renderer found — kinds/ glob may be missing").toBeDefined();
	});

	// nested page (pages/knowledge/KnowledgeBody.stories.tsx → "Page: Knowledge/Body")
	test("nested page surface: 'Page: Knowledge/Body' discovered", () => {
		const m = allModules.find((m) => m.title === "Page: Knowledge/Body");
		expect(
			m,
			"Page: Knowledge/Body not found — nested pages/*/* glob may be missing",
		).toBeDefined();
	});

	// at least one settings story has group = Settings
	test("settings stories classified as Settings domain", () => {
		const settingsModules = allModules.filter((m) => m.group?.name === "Settings");
		expect(
			settingsModules.length,
			"No stories classified as Settings — classification may be broken",
		).toBeGreaterThan(0);
	});

	// at least one layout story has group = System
	test("layouts classified as System domain", () => {
		const appShell = allModules.find((m) => m.title === "Layout: AppShell");
		expect(appShell?.group?.name).toBe("System");
	});

	// nested page classified correctly
	test("nested pages/work/* classified as Work domain", () => {
		const m = allModules.find((m) => m.title === "Page: Work/RoutineCreateDialog");
		expect(m, "Page: Work/RoutineCreateDialog not found").toBeDefined();
		expect(m?.group?.name).toBe("Work");
	});
});
