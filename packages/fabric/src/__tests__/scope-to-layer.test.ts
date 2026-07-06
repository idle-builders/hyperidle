/**
 * Q2 — AC-9: Fabric layer assignment mapping.
 *
 * scopeToLayer() and SCOPE_TO_LAYER must map:
 *   factory → L4, product → L2, practice → L3, task → L1
 *   bet → null, team → null, user → null
 *
 * Red phase: scopeToLayer and SCOPE_TO_LAYER do not exist yet.
 */

import { describe, expect, it } from "vitest";
import { SCOPE_TO_LAYER, scopeToLayer } from "../types.js";

describe("Q2 AC-9: scopeToLayer mapping", () => {
	it("maps factory → L4", () => {
		expect(scopeToLayer("factory")).toBe("L4");
	});

	it("maps product → L2", () => {
		expect(scopeToLayer("product")).toBe("L2");
	});

	it("maps practice → L3", () => {
		expect(scopeToLayer("practice")).toBe("L3");
	});

	it("maps task → L1", () => {
		expect(scopeToLayer("task")).toBe("L1");
	});

	it("maps bet → null (no layer in fabric maturity flow)", () => {
		expect(scopeToLayer("bet")).toBeNull();
	});

	it("maps team → null", () => {
		expect(scopeToLayer("team")).toBeNull();
	});

	it("maps user → null", () => {
		expect(scopeToLayer("user")).toBeNull();
	});

	it("SCOPE_TO_LAYER record covers all 8 scope kinds (AV3: filesystem added)", () => {
		const keys = Object.keys(SCOPE_TO_LAYER as Record<string, unknown>);
		expect(keys).toHaveLength(8);
		expect(keys).toContain("factory");
		expect(keys).toContain("product");
		expect(keys).toContain("practice");
		expect(keys).toContain("team");
		expect(keys).toContain("bet");
		expect(keys).toContain("task");
		expect(keys).toContain("user");
		expect(keys).toContain("filesystem");
	});

	it("filesystem → null (not in fabric maturity flow)", () => {
		expect(scopeToLayer("filesystem")).toBeNull();
	});
});
