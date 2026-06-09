import { routeToFounder } from "@hyperidle/fabric";
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

	it("routes 'practice_facilitator' to cpo", () => {
		expect(routeToFounder("practice_facilitator")).toBe("cpo");
	});

	// @lore AD8a: role string "chief_of_staff" stays — AD8b renames it to "assistant".
	// @lore AD8a: role string "chief_of_staff" renamed in AD8b.
	it("routes 'chief_of_staff' to both", () => {
		// @lore AD8a: role string renamed in AD8b
		// @lore AD8a: role string renamed to "assistant" in AD8b
		expect(routeToFounder("chief_of_staff")).toBe("both"); // @lore AD8a: role string renamed in AD8b
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
