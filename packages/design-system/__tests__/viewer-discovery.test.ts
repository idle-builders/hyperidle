/**
 * K12 — viewer story discovery contract.
 *
 * `discoverStories(globs?)` (in `packages/design-system/viewer/discovery.ts`) is
 * the canonical reader the workbench uses to populate its catalog. K12
 * extended it (AJ6) to:
 *
 *   - resolve a `group: CatalogGroup` via the two-axis classification chain
 *     (meta.group → deriveFromPath → DS_COMPONENT_GROUPS[title] → null),
 *   - preserve a `meta.uses: string[]` array if present (used by the
 *     composition graph),
 *   - accept an optional injected glob source so the contract is testable
 *     without a Vite build.
 *
 * The old tier: "1"|"2"|"3"|"utility" API was replaced in AJ6 with
 * CatalogGroup. See plans/AJ6/architecture.md.
 *
 * @lore Each gate maps 1:1 to a K12/AJ6 acceptance criterion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverStories, type CatalogGroup } from "../viewer/discovery.js";

type GlobShape = Record<string, Record<string, unknown>>;

function fakeRender(): null {
	return null;
}

function isValidGroup(g: unknown): g is CatalogGroup {
	if (!g || typeof g !== "object") return false;
	const obj = g as { kind?: unknown; name?: unknown };
	return (obj.kind === "tier" || obj.kind === "domain") && typeof obj.name === "string";
}

describe("discoverStories", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	});
	afterEach(() => {
		warnSpy.mockRestore();
	});

	it("returns the (title, group, variants) shape per module", () => {
		const globs: GlobShape = {
			// DS-src flat root: classification via registry (StatusChip → Primitives)
			"../src/StatusChip.stories.tsx": {
				default: { title: "StatusChip" },
				defaultStory: fakeRender,
			},
		};
		const modules = discoverStories(globs);
		expect(modules).toHaveLength(1);
		const [m] = modules;
		expect(m.title).toBe("StatusChip");
		expect(isValidGroup(m.group)).toBe(true);
		expect(m.group.name).toBe("Primitives");
		expect(m.variants).toHaveLength(1);
		expect(m.variants[0].name).toBe("defaultStory");
	});

	it("resolves groups for Foundation/Primitives/Blocks/domain entries", () => {
		const globs: GlobShape = {
			// Foundation tier (via registry)
			"../src/Button.stories.tsx": { default: { title: "Button" }, A: fakeRender },
			// Work domain (via registry)
			"../src/BetCard.stories.tsx": { default: { title: "BetCard" }, B: fakeRender },
			// System domain (via shell/ path)
			"../../web/src/shell/Sidebar.stories.tsx": {
				default: { title: "Shell/Sidebar" },
				C: fakeRender,
			},
			// Settings domain (via settings/ path)
			"../../web/src/settings/SettingsModels.stories.tsx": {
				default: { title: "SettingsModels" },
				D: fakeRender,
			},
		};
		const modules = discoverStories(globs);
		const byTitle = new Map(modules.map((m) => [m.title, m]));
		expect(byTitle.get("Button")?.group).toEqual({ kind: "tier", name: "Foundation" });
		expect(byTitle.get("BetCard")?.group).toEqual({ kind: "domain", name: "Work" });
		expect(byTitle.get("Shell/Sidebar")?.group).toEqual({ kind: "domain", name: "System" });
		expect(byTitle.get("SettingsModels")?.group).toEqual({ kind: "domain", name: "Settings" });
	});

	it("warns when a story is unclassifiable (AC2 classification failure)", () => {
		const globs: GlobShape = {
			"../src/UnknownWidget.stories.tsx": { default: { title: "UnknownWidget" }, solo: fakeRender },
		};
		const modules = discoverStories(globs);
		// buildModule returns null for unclassified → not in output
		expect(modules).toHaveLength(0);
		expect(warnSpy).toHaveBeenCalled();
		const message = warnSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(message).toContain("UnknownWidget");
	});

	it("preserves meta.uses for the composition graph", () => {
		const globs: GlobShape = {
			"../src/BetCard.stories.tsx": {
				default: {
					title: "BetCard",
					uses: ["StatusChip", "Tag", "KeyValue"],
				},
				defaultStory: fakeRender,
			},
		};
		const modules = discoverStories(globs);
		expect(modules[0].uses).toEqual(["StatusChip", "Tag", "KeyValue"]);
	});

	it("skips modules without a default export title", () => {
		const globs: GlobShape = {
			"./NotAStory.tsx": { default: { notATitle: true }, X: fakeRender },
		};
		expect(discoverStories(globs)).toHaveLength(0);
	});

	it("meta.group escape hatch overrides path and registry classification", () => {
		const globs: GlobShape = {
			// Path would normally classify as System (shell/)
			"../../web/src/shell/Special.stories.tsx": {
				default: { title: "Special", group: "Conversations" },
				V: fakeRender,
			},
		};
		const modules = discoverStories(globs);
		expect(modules[0].group).toEqual({ kind: "domain", name: "Conversations" });
	});
});
