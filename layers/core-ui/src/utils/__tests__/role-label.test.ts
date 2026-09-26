import { describe, expect, it } from "vitest";
import { roleLabel } from "../role-label.js";

describe("roleLabel", () => {
	it("title-cases an underscore role (product_manager → 'Product Manager')", () => {
		expect(roleLabel("product_manager")).toBe("Product Manager");
	});

	it("title-cases a single word (builder → 'Builder')", () => {
		expect(roleLabel("builder")).toBe("Builder");
	});

	it("title-cases a hyphen role (data-engineer → 'Data Engineer')", () => {
		expect(roleLabel("data-engineer")).toBe("Data Engineer");
	});

	it("title-cases mixed separators (senior_product manager → 'Senior Product Manager')", () => {
		expect(roleLabel("senior_product manager")).toBe("Senior Product Manager");
	});

	it("empty string → ''", () => {
		expect(roleLabel("")).toBe("");
	});

	it("whitespace only → ''", () => {
		expect(roleLabel("   ")).toBe("");
	});
});
