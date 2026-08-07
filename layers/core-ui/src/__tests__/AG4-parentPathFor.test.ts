/**
 * AG4 — parentPathFor pure fn (RED phase).
 *
 * Contract: parentPathFor(pathname) returns the explicit structural parent path
 * for known routes, or null for unmatched routes.
 *
 * Key boundary (Back ≠ Up): an unmatched route returns null — NOT navigate(-1).
 * Callers must no-op on null. This prevents the silent Up→Back conflation that
 * @lore AE4 documents.
 *
 * These tests FAIL until layers/core-ui/src/navigation/parentPathFor.ts is created.
 */

import { describe, expect, it } from "vitest";
import { parentPathFor } from "../navigation/parentPathFor.js";

describe("AG4 — parentPathFor", () => {
	describe("work routes", () => {
		// AD9: /work is now the Work overview root (was /work/portfolio)
		it("bet detail → /work (was /work/portfolio)", () => {
			expect(parentPathFor("/work/bet/abc-123")).toBe("/work");
		});

		it("bet detail with trailing content → /work", () => {
			expect(parentPathFor("/work/bet/abc-123/")).toBe("/work");
		});

		it("task detail → parent bet", () => {
			expect(parentPathFor("/work/bet/bet-1/task/task-2")).toBe("/work/bet/bet-1");
		});

		it("task detail with nested path → parent bet", () => {
			expect(parentPathFor("/work/bet/abc-123/task/xyz-456")).toBe("/work/bet/abc-123");
		});

		it("routine detail → /work (was /work/portfolio)", () => {
			expect(parentPathFor("/work/routine/routine-1")).toBe("/work");
		});

		it("team detail → /work (was /work/portfolio)", () => {
			expect(parentPathFor("/work/team/team-1")).toBe("/work");
		});

		it("/work overview itself → null (already root)", () => {
			expect(parentPathFor("/work")).toBeNull();
		});

		it("/work/portfolio → null (retired path, no match)", () => {
			expect(parentPathFor("/work/portfolio")).toBeNull();
		});
	});

	describe("knowledge routes", () => {
		it("knowledge detail → /knowledge", () => {
			expect(parentPathFor("/knowledge/item-123")).toBe("/knowledge");
		});

		it("knowledge detail with id → /knowledge", () => {
			expect(parentPathFor("/knowledge/some-article")).toBe("/knowledge");
		});

		it("knowledge list → null (already root)", () => {
			expect(parentPathFor("/knowledge")).toBeNull();
		});

		it("/knowledge/new is NOT a detail route → null", () => {
			// @lore AE4: /knowledge/new is a create page excluded from isDetailRoute
			expect(parentPathFor("/knowledge/new")).toBeNull();
		});
	});

	describe("agents routes", () => {
		it("agent detail → /conversations", () => {
			expect(parentPathFor("/agents/agent-1")).toBe("/conversations");
		});
	});

	describe("conversations routes", () => {
		it("thread detail → /conversations", () => {
			expect(parentPathFor("/conversations/thread-abc")).toBe("/conversations");
		});

		it("conversations root → null", () => {
			expect(parentPathFor("/conversations")).toBeNull();
		});
	});

	describe("unmatched routes → null (Back ≠ Up boundary)", () => {
		it("completely unknown route returns null", () => {
			expect(parentPathFor("/some/unknown/route")).toBeNull();
		});

		it("root path → null", () => {
			expect(parentPathFor("/")).toBeNull();
		});

		it("settings path → null", () => {
			expect(parentPathFor("/settings")).toBeNull();
		});

		it("empty string → null", () => {
			expect(parentPathFor("")).toBeNull();
		});
	});
});
