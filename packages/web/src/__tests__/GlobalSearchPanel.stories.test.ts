import { describe, expect, it } from "vitest";

/**
 * I4 D1: GlobalSearchPanel.stories.tsx must have a default export with
 * { title: "GlobalSearchPanel" } so that the design-system's auto-discovery
 * (import.meta.glob + parseStoryModules) picks it up. Today the default
 * export is missing entirely and the stories are silently dropped.
 */
describe("GlobalSearchPanel.stories default export", () => {
	it("exports a default object with title 'GlobalSearchPanel'", async () => {
		const mod = (await import("../components/GlobalSearchPanel.stories")) as {
			default?: { title?: string };
		};
		expect(mod.default).toBeDefined();
		expect(mod.default?.title).toBe("GlobalSearchPanel");
	});
});
