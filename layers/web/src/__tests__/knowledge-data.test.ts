import { describe, expect, it } from "vitest";
import {
	deriveTopicHealth,
	groupItemsByTopic,
	MOCK_KNOWLEDGE_ITEMS,
} from "../fixtures/knowledge-data";

describe("knowledge-data fixtures (J6)", () => {
	it("fixture items cover all three scopes", () => {
		const scopes = new Set(MOCK_KNOWLEDGE_ITEMS.map((i) => i.scope));
		expect(scopes.has("practice")).toBe(true);
		expect(scopes.has("product")).toBe(true);
		expect(scopes.has("factory")).toBe(true);
	});

	it("practice scope retains the 5 original fixture titles for protected tests", () => {
		const titles = MOCK_KNOWLEDGE_ITEMS.filter((i) => i.scope === "practice").map((i) => i.title);
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

describe("deriveTopicHealth (J6)", () => {
	it("returns fresh when no items are stale", () => {
		expect(deriveTopicHealth(5, 0)).toBe("fresh");
	});

	it("returns fresh when the topic is empty", () => {
		expect(deriveTopicHealth(0, 0)).toBe("fresh");
	});

	it("returns some_stale when < 50% of items are stale", () => {
		expect(deriveTopicHealth(4, 1)).toBe("some_stale");
		expect(deriveTopicHealth(10, 4)).toBe("some_stale");
	});

	it("returns mostly_stale when >= 50% of items are stale", () => {
		expect(deriveTopicHealth(4, 2)).toBe("mostly_stale");
		expect(deriveTopicHealth(10, 5)).toBe("mostly_stale");
		expect(deriveTopicHealth(3, 3)).toBe("mostly_stale");
	});
});

describe("groupItemsByTopic (J6)", () => {
	it("groups items with stable topic order matching first-seen", () => {
		const items = MOCK_KNOWLEDGE_ITEMS.filter((i) => i.scope === "practice");
		const groups = groupItemsByTopic(items);
		const topics = groups.map((g) => g.topic);
		// First practice item is Architecture, so Architecture should be first.
		expect(topics[0]).toBe("Architecture");
	});

	it("counts stale items per topic correctly", () => {
		const items = MOCK_KNOWLEDGE_ITEMS.filter((i) => i.scope === "practice");
		const groups = groupItemsByTopic(items);
		const architecture = groups.find((g) => g.topic === "Architecture");
		expect(architecture?.staleCount).toBe(1); // k7 is stale
		expect(architecture?.items).toHaveLength(3); // k1, k2, k7
	});
});
