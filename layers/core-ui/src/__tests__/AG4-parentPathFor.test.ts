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
			expect(parentPathFor("/work/task/abc-123")).toBe("/work");
		});

		// @lore BB1: /work/bet/ routes deleted; test uses /work/task/ instead
		it("task detail with trailing slash → /work", () => {
			expect(parentPathFor("/work/task/abc-123/")).toBe("/work");
		});

		// @lore BB1: tasks have no URL-visible parent (breadcrumb uses ancestors API)
		it("task detail → /work (BB1: flat URL, depth via ancestors API)", () => {
			expect(parentPathFor("/work/task/task-2")).toBe("/work");
		});

		it("task detail (any id) → /work (BB1: all tasks share same flat parent)", () => {
			expect(parentPathFor("/work/task/xyz-456")).toBe("/work");
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

	describe("document routes", () => {
		it("document detail → /documents", () => {
			expect(parentPathFor("/documents/item-123")).toBe("/documents");
		});

		it("document detail with id → /documents", () => {
			expect(parentPathFor("/documents/some-article")).toBe("/documents");
		});

		it("document list → null (already root)", () => {
			expect(parentPathFor("/documents")).toBeNull();
		});

		it("/documents/new is NOT a detail route → null", () => {
			// @lore AE4: /documents/new is a create page excluded from isDetailRoute
			expect(parentPathFor("/documents/new")).toBeNull();
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
