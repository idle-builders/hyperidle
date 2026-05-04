/**
 * K12 — viewer story discovery contract.
 *
 * `discoverStories(globs?)` (in `packages/design-system/viewer/main.tsx`) is
 * the canonical reader the workbench uses to populate its catalog. K12
 * extends it to:
 *
 *   - read a `tier` field off each module's default export
 *     (`"1" | "2" | "3" | "utility"`), defaulting to `"utility"` with a
 *     console warning when missing,
 *   - preserve a `meta.uses: string[]` array if present (used by the
 *     composition graph),
 *   - accept an optional injected glob source so the contract is testable
 *     without a Vite build.
 *
 * @lore Each gate maps 1:1 to a K12 acceptance criterion in
 *   `plans/work-packages/TRACK-K.md` story K12 (Unified Design System
 *   Workbench).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverStories } from "../viewer/discovery.js";

type GlobShape = Record<string, Record<string, unknown>>;

function fakeRender(): null {
	return null;
}

describe("discoverStories", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	});
	afterEach(() => {
		warnSpy.mockRestore();
	});

	it("returns the (title, tier, variants) shape per module", () => {
		const globs: GlobShape = {
			"./StatusChip.stories.tsx": {
				default: { title: "StatusChip", tier: "1" },
				defaultStory: fakeRender,
			},
		};
		const modules = discoverStories(globs);
		expect(modules).toHaveLength(1);
		const [m] = modules;
		expect(m.title).toBe("StatusChip");
		expect(m.tier).toBe("1");
		expect(m.variants).toHaveLength(1);
		expect(m.variants[0].name).toBe("defaultStory");
	});

	it("buckets modules by tier across all four tiers", () => {
		const globs: GlobShape = {
			"./A.stories.tsx": { default: { title: "A", tier: "1" }, A: fakeRender },
			"./B.stories.tsx": { default: { title: "B", tier: "2" }, B: fakeRender },
			"./C.stories.tsx": { default: { title: "C", tier: "3" }, C: fakeRender },
			"./D.stories.tsx": { default: { title: "D", tier: "utility" }, D: fakeRender },
		};
		const modules = discoverStories(globs);
		const tiers = new Set(modules.map((m) => m.tier));
		expect(tiers).toEqual(new Set(["1", "2", "3", "utility"]));
	});

	it("defaults missing tier to 'utility' and warns naming the module title", () => {
		const globs: GlobShape = {
			"./Mystery.stories.tsx": { default: { title: "Mystery" }, solo: fakeRender },
		};
		const modules = discoverStories(globs);
		expect(modules[0].tier).toBe("utility");
		expect(warnSpy).toHaveBeenCalled();
		const message = warnSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(message).toContain("Mystery");
	});

	it("preserves meta.uses for the composition graph", () => {
		const globs: GlobShape = {
			"./BetCard.stories.tsx": {
				default: {
					title: "BetCard",
					tier: "2",
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
});
