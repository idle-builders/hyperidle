import { describe, expect, it } from "vitest";
import { routeItem } from "../services/item-router.js";

describe("routeItem", () => {
	it("routes medium risk to conversations", () => {
		expect(routeItem({ riskTier: "medium" })).toBe("conversations");
	});

	it("routes high risk to conversations", () => {
		expect(routeItem({ riskTier: "high" })).toBe("conversations");
	});

	it("routes kind 'review' to conversations", () => {
		expect(routeItem({ kind: "review" })).toBe("conversations");
	});

	it("routes kind 'skill_change' to conversations", () => {
		expect(routeItem({ kind: "skill_change" })).toBe("conversations");
	});

	it("routes kind 'knowledge' to knowledge", () => {
		expect(routeItem({ kind: "knowledge" })).toBe("knowledge");
	});

	it("routes kind 'work' to work", () => {
		expect(routeItem({ kind: "work" })).toBe("work");
	});

	it("routes verb 'bet' to work", () => {
		expect(routeItem({ verb: "bet" })).toBe("work");
	});

	it("routes kind 'chat' to conversations", () => {
		expect(routeItem({ kind: "chat" })).toBe("conversations");
	});

	it("routes default (no matching rules) to rail", () => {
		expect(routeItem({})).toBe("rail");
	});

	it("routes null values to rail", () => {
		expect(routeItem({ riskTier: null, kind: null, verb: null })).toBe("rail");
	});

	it("risk tier takes priority over kind", () => {
		expect(routeItem({ riskTier: "high", kind: "knowledge" })).toBe("conversations");
	});

	it("routes low risk with no kind to rail", () => {
		expect(routeItem({ riskTier: "low" })).toBe("rail");
	});

	// L9 review (arch C1): `critical` is strictly above `high` and must
	// route to conversations, not silently fall through to `rail`.
	it("routes critical risk to conversations", () => {
		expect(routeItem({ riskTier: "critical" })).toBe("conversations");
	});

	it("routes critical risk regardless of kind", () => {
		expect(routeItem({ riskTier: "critical", kind: "knowledge" })).toBe("conversations");
	});
});
