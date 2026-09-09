import { describe, expect, it } from "vitest";
import { MOCK_KNOWLEDGE_ITEMS } from "../fixtures/knowledge-data";

describe("knowledge-data fixtures (J6)", () => {
	// @lore nested-knowledge-items AC6: the retired practice/product scope
	// values are gone — the fixture now only carries the surviving three.
	it("fixture items cover the surviving scopes only", () => {
		const scopes = new Set(MOCK_KNOWLEDGE_ITEMS.map((i) => i.scope));
		expect(scopes.has("practice")).toBe(false);
		expect(scopes.has("product")).toBe(false);
		expect(scopes.has("factory")).toBe(true);
		expect(scopes.has("team")).toBe(true);
	});

	it("factory scope retains the 5 original fixture titles for protected tests", () => {
		const titles = MOCK_KNOWLEDGE_ITEMS.filter((i) => i.scope === "factory").map((i) => i.title);
		for (const title of [
			"Architecture Decision: Auth Strategy",
			"API Rate Limiting Best Practices",
			"User Interview Notes Q1",
			"Component Library Guidelines",
			"Sprint Retro Outcomes",
		]) {
			expect(titles).toContain(title);
		}
	});
});
