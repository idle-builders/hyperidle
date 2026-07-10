import { routeToFounder } from "@hyperidle/server/app-runtime";
import { describe, expect, it } from "vitest";

describe("routeToFounder", () => {
	it("routes 'growth' to ceo", () => {
		expect(routeToFounder("growth")).toBe("ceo");
	});

	it("routes 'builder' to cpo", () => {
		expect(routeToFounder("builder")).toBe("cpo");
	});

	it("routes 'product_manager' to cpo", () => {
		expect(routeToFounder("product_manager")).toBe("cpo");
	});

	it("routes 'brand_voice' to cpo", () => {
		expect(routeToFounder("brand_voice")).toBe("cpo");
	});

	// @lore AD8c: role renamed from practice_facilitator to facilitator
	it("routes 'facilitator' to cpo", () => {
		expect(routeToFounder("facilitator")).toBe("cpo");
	});

	it("routes 'assistant' to both", () => {
		expect(routeToFounder("assistant")).toBe("both");
	});

	it("routes unknown role to both", () => {
		expect(routeToFounder("unknown_role")).toBe("both");
	});

	it("routes null to both", () => {
		expect(routeToFounder(null)).toBe("both");
	});

	it("routes undefined to both", () => {
		expect(routeToFounder(undefined)).toBe("both");
	});
});
