import { describe, expect, it } from "vitest";
import { isValidLayer, layerDepth } from "../layers.js";

describe("isValidLayer", () => {
	it("accepts all five valid layers", () => {
		for (const layer of ["L0", "L1", "L2", "L3", "L4"]) {
			expect(isValidLayer(layer)).toBe(true);
		}
	});

	it("rejects invalid layer strings", () => {
		expect(isValidLayer("L5")).toBe(false);
		expect(isValidLayer("")).toBe(false);
		expect(isValidLayer("layer0")).toBe(false);
	});

	it("rejects non-layer values", () => {
		expect(isValidLayer("foo")).toBe(false);
		expect(isValidLayer("0")).toBe(false);
	});
});

describe("layerDepth", () => {
	it("returns numeric depth for each layer", () => {
		expect(layerDepth("L0")).toBe(0);
		expect(layerDepth("L1")).toBe(1);
		expect(layerDepth("L2")).toBe(2);
		expect(layerDepth("L3")).toBe(3);
		expect(layerDepth("L4")).toBe(4);
	});
});
