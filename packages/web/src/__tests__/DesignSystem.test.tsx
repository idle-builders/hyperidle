import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { parseStoryModules } from "../designsystem/DesignSystem";

/**
 * I4 D2: `parseStoryModules` must detect CSF3 object stories — exports of
 * shape `{ name, render }` where render is a function — in addition to the
 * legacy `export const Foo = () => <...>` function stories. Today the
 * function only picks up `typeof value === "function"`, silently dropping
 * CSF3-style stories (e.g. those in GlobalSearchPanel.stories.tsx).
 */

interface ParsedStory {
	meta: { title: string };
	// biome-ignore lint/style/useNamingConvention: matches StoryEntry interface which uses PascalCase Component
	variants: { name: string; Component: ComponentType }[];
}

describe("parseStoryModules", () => {
	it("is exported for testability", () => {
		expect(typeof parseStoryModules).toBe("function");
	});

	it("detects CSF3 object stories (exports with .render function)", () => {
		const TestComponent: ComponentType = () => null;
		const fakeModules: Record<string, Record<string, unknown>> = {
			"./Fake.stories.tsx": {
				default: { title: "Fake" },
				// biome-ignore lint/style/useNamingConvention: CSF3 story exports use PascalCase by convention
				WithRender: { name: "Fancy Name", render: TestComponent },
			},
		};
		const parsed = parseStoryModules(fakeModules) as ParsedStory[];
		const fake = parsed.find((m) => m.meta.title === "Fake");
		expect(fake).toBeDefined();
		expect(fake?.variants).toHaveLength(1);
		expect(fake?.variants[0]?.Component).toBe(TestComponent);
	});

	it("keeps legacy function-style stories working (additive)", () => {
		const Legacy: ComponentType = () => null;
		const fakeModules: Record<string, Record<string, unknown>> = {
			"./Legacy.stories.tsx": {
				default: { title: "Legacy" },
				// biome-ignore lint/style/useNamingConvention: CSF3 story exports use PascalCase by convention
				Default: Legacy,
			},
		};
		const parsed = parseStoryModules(fakeModules) as ParsedStory[];
		const legacy = parsed.find((m) => m.meta.title === "Legacy");
		expect(legacy).toBeDefined();
		expect(legacy?.variants[0]?.Component).toBe(Legacy);
	});

	it("uses the object's .name field as the variant name when available", () => {
		const Render: ComponentType = () => null;
		const fakeModules: Record<string, Record<string, unknown>> = {
			"./Named.stories.tsx": {
				default: { title: "Named" },
				// biome-ignore lint/style/useNamingConvention: CSF3 story exports use PascalCase by convention
				Primary: { name: "Primary variant", render: Render },
			},
		};
		const parsed = parseStoryModules(fakeModules) as ParsedStory[];
		const named = parsed.find((m) => m.meta.title === "Named");
		expect(named?.variants[0]?.name).toBe("Primary variant");
	});

	it("ignores objects that do not have a function .render", () => {
		const fakeModules: Record<string, Record<string, unknown>> = {
			"./Bogus.stories.tsx": {
				default: { title: "Bogus" },
				// biome-ignore lint/style/useNamingConvention: CSF3 story exports use PascalCase by convention
				NotAStory: { name: "no render here" },
			},
		};
		const parsed = parseStoryModules(fakeModules) as ParsedStory[];
		const bogus = parsed.find((m) => m.meta.title === "Bogus");
		// A module with no variants must be dropped (consistent with existing behavior)
		expect(bogus).toBeUndefined();
	});

	it("discovers the GlobalSearchPanel stories via auto-discovery", async () => {
		// With default behaviour (no fakeModules), parseStoryModules walks the
		// import.meta.glob. The GlobalSearchPanel.stories module uses CSF3
		// objects — it MUST appear in the discovered modules.
		const parsed = (await import("../designsystem/DesignSystem").then((m) =>
			m.parseStoryModules(),
		)) as ParsedStory[];
		const gs = parsed.find((m) => m.meta.title === "GlobalSearchPanel");
		expect(gs).toBeDefined();
		// And have at least one variant.
		expect((gs?.variants ?? []).length).toBeGreaterThan(0);
	});
});
