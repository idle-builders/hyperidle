import { describe, expect, it } from "vitest";
import type { ViewId } from "../shell/shell-types";
import { VIEW_ICONS, VIEW_IDS } from "../shell/shell-types";

describe("shell-types", () => {
	describe("VIEW_IDS", () => {
		it("contains exactly 3 view identifiers", () => {
			expect(VIEW_IDS).toHaveLength(3);
		});

		it("includes conversations, work, and knowledge", () => {
			expect(VIEW_IDS).toContain("conversations");
			expect(VIEW_IDS).toContain("work");
			expect(VIEW_IDS).toContain("knowledge");
		});

		it("is readonly (frozen)", () => {
			expect(Object.isFrozen(VIEW_IDS)).toBe(true);
		});

		it("maintains stable order: conversations, work, knowledge", () => {
			expect(VIEW_IDS[0]).toBe("conversations");
			expect(VIEW_IDS[1]).toBe("work");
			expect(VIEW_IDS[2]).toBe("knowledge");
		});
	});

	describe("VIEW_ICONS", () => {
		it("has an entry for every ViewId", () => {
			for (const id of VIEW_IDS) {
				expect(VIEW_ICONS[id]).toBeDefined();
			}
		});

		it("maps each ViewId to an object with label and icon", () => {
			for (const id of VIEW_IDS) {
				expect(VIEW_ICONS[id]).toHaveProperty("label");
				expect(VIEW_ICONS[id]).toHaveProperty("icon");
				expect(typeof VIEW_ICONS[id].label).toBe("string");
			}
		});
	});

	describe("ViewId type", () => {
		it("allows valid view ids", () => {
			const valid: ViewId[] = ["conversations", "work", "knowledge"];
			expect(valid).toHaveLength(3);
		});
	});
});
